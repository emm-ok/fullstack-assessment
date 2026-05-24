const ordersRepository = require("../repositories/ordersRepository");
const productsRepository = require("../repositories/productsRepository");
const paymentsRepository = require("../repositories/paymentsRepository");
const paymentGateway = require("./paymentGateway");
const redis = require("../db/redis");
const db = require("../db/postgres");

async function withTransaction(callback) {
  const client = await db.connect();

  try {
    await client.query("BEGIN");

    const result = await callback(client);

    await client.query("COMMIT");

    return result;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

function createError(message, status = 500) {
  const error = new Error(message);
  error.status = status;
  return error;
}

async function createOrder({ customerId, items }) {
  if (!customerId || !Array.isArray(items) || items.length === 0) {
    throw createError("customerId and items are required", 400);
  }

  return withTransaction(async (client) => {
    const enrichedItems = [];
    let calculatedTotal = 0;

    for (const item of items) {
      if (!item.productId || !item.quantity || item.quantity <= 0) {
        throw createError("Invalid order item", 400);
      }

      const product = await productsRepository.getProductByIdForUpdate(
        item.productId,
        client,
      );

      if (!product) {
        throw createError(`Product ${item.productId} not found`, 404);
      }

      if (product.stock < item.quantity) {
        throw createError(`Insufficient stock for ${product.name}`, 409);
      }

      await productsRepository.decrementStock(
        item.productId,
        item.quantity,
        client,
      );

      const unitPrice = Number(product.price);

      if (Number.isNaN(unitPrice)) {
        throw createError(`Invalid product price for ${product.name}`, 500);
      }

      enrichedItems.push({
        productId: product.id,
        quantity: item.quantity,
        unitPrice,
      });

      calculatedTotal += unitPrice * item.quantity;
    }

    const order = await ordersRepository.createOrder(
      {
        customerId,
        totalAmount: calculatedTotal,
        items: enrichedItems,
      },
      client,
    );

    return order;
  });
}

async function chargeOrder({ orderId, idempotencyKey }) {
  if (!orderId) {
    throw createError("Order ID is required", 400);
  }

  if (!idempotencyKey) {
    throw createError("Idempotency key is required", 400);
  }

  const cacheKey = `idem:${idempotencyKey}`;
  const lockKey = `lock:charge:${idempotencyKey}`;

  const cached = await redis.get(cacheKey);

  if (cached) {
    return JSON.parse(cached);
  }

  const locked = await redis.set(lockKey, "1", "NX", "EX", 15);

  if (!locked) {
    throw createError("Duplicate payment request in progress", 409);
  }

  try {
    // Validate and lock order

    const order = await withTransaction(async (client) => {
      const existingPayment =
        await paymentsRepository.findPaymentByIdempotencyKey(
          idempotencyKey,
          client,
        );

      if (existingPayment) {
        const existingOrder = await ordersRepository.getOrderById(
          existingPayment.orderId,
          client,
        );

        return {
          existing: true,
          response: {
            order: existingOrder,
            payment: existingPayment,
          },
        };
      }

      const lockedOrder = await ordersRepository.getOrderByIdForUpdate(
        orderId,
        client,
      );

      if (!lockedOrder) {
        throw createError("Order not found", 404);
      }

      if (lockedOrder.status === "PAID") {
        throw createError("Order has already been paid", 409);
      }

      if (lockedOrder.status !== "PENDING") {
        throw createError("Only pending orders can be charged", 409);
      }

      return {
        existing: false,
        order: lockedOrder,
      };
    });

    // Return existing successful payment

    if (order.existing) {
      return order.response;
    }

    // Call payment gateway OUTSIDE transaction

    let gatewayResponse;

    try {
      gatewayResponse = await paymentGateway.charge({
        orderId: order.order.id,
        amount: order.order.total_amount,
      });
    } catch (err) {
      throw createError(
        err.message || "Payment gateway failed",
        err.status || 502,
      );
    }

    if (!gatewayResponse || !gatewayResponse.providerTxnId) {
      throw createError("Invalid payment gateway response", 502);
    }

    //  Finalize payment in transaction

    const response = await withTransaction(async (client) => {
      const latestOrder = await ordersRepository.getOrderByIdForUpdate(
        order.order.id,
        client,
      );

      if (!latestOrder) {
        throw createError("Order not found", 404);
      }

      // Double safety check

      if (latestOrder.status === "PAID") {
        const existingPayment =
          await paymentsRepository.findPaymentByIdempotencyKey(
            idempotencyKey,
            client,
          );

        return {
          order: latestOrder,
          payment: existingPayment || null,
        };
      }

      const payment = await paymentsRepository.createPayment(
        {
          orderId: latestOrder.id,
          amount: gatewayResponse.chargedAmount,
          providerTxnId: gatewayResponse.providerTxnId,
          status: "SUCCESS",
          idempotencyKey,
        },
        client,
      );

      const updatedOrder = await ordersRepository.markOrderAsPaid(
        latestOrder.id,
        client,
      );

      return {
        order: updatedOrder,
        payment,
      };
    });

    // Cache successful response

    await redis.set(cacheKey, JSON.stringify(response), "EX", 3600);

    return response;
  } catch (err) {
    console.error("Charge order failed:", {
      orderId,
      idempotencyKey,
      message: err.message,
    });

    throw err;
  } finally {
    try {
      await redis.del(lockKey);
    } catch (err) {
      console.error("Failed to release Redis lock:", err.message);
    }
  }
}

async function processPaymentWebhook({
  providerEventId,
  orderId,
  eventType,
  payload,
}) {
  if (!providerEventId) {
    throw createError("providerEventId is required", 400);
  }

  if (!orderId) {
    throw createError("orderId is required", 400);
  }

  if (!eventType) {
    throw createError("eventType is required", 400);
  }

  try {
    return await withTransaction(async (client) => {
      // Deduplicate webhook delivery

      const existingEvent =
        await paymentsRepository.getWebhookEventByProviderEventId(
          providerEventId,
          client,
        );

      if (existingEvent) {
        return {
          accepted: true,
          duplicate: true,
        };
      }

      // Store webhook event

      await paymentsRepository.createWebhookEvent(
        {
          providerEventId,
          orderId,
          eventType,
          payload,
        },
        client,
      );

      // Ignore unsupported events

      if (eventType !== "payment_succeeded") {
        return {
          accepted: true,
        };
      }

      // Lock order row

      const order = await ordersRepository.getOrderByIdForUpdate(
        orderId,
        client,
      );

      if (!order) {
        throw createError("Order not found", 404);
      }

      if (order.status === "PAID") {
        return {
          accepted: true,
        };
      }

      //  Ensure successful payment exists

      const paymentExists =
        await paymentsRepository.findSuccessfulPaymentByOrderId(
          orderId,
          client,
        );

      if (!paymentExists) {
        console.warn("Webhook received without successful payment record", {
          providerEventId,
          orderId,
        });

        return {
          accepted: true,
        };
      }

      // Mark order paid

      await ordersRepository.markOrderAsPaid(orderId, client);

      return {
        accepted: true,
      };
    });
  } catch (err) {
    console.error("Webhook processing failed:", {
      providerEventId,
      orderId,
      eventType,
      message: err.message,
    });

    throw err;
  }
}

async function getOrderById(orderId) {
  if (!orderId) {
    throw createError("Order ID is required", 400);
  }

  try {
    const order = await ordersRepository.getOrderWithDetails(orderId);

    if (!order) {
      throw createError("Order not found", 404);
    }

    return order;
  } catch (err) {
    console.error("Get order failed:", {
      orderId,
      message: err.message,
    });

    throw err;
  }
}

async function listOrders(params) {
  try {
    return await ordersRepository.listOrders(params);
  } catch (err) {
    console.error("List orders failed:", {
      message: err.message,
    });

    throw err;
  }
}

module.exports = {
  createOrder,
  chargeOrder,
  processPaymentWebhook,
  getOrderById,
  listOrders,
};
