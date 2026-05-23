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

async function createOrder({ customerId, items }) {
  if (!customerId || !Array.isArray(items) || items.length === 0) {
    const error = new Error("customerId and items are required");
    error.status = 400;
    throw error;
  }

  return withTransaction(async (client) => {
    const enrichedItems = [];
    let calculatedTotal = 0;

    for (const item of items) {
      if (!item.productId || !item.quantity || item.quantity <= 0) {
        const error = new Error("Invalid order item");
        error.status = 400;
        throw error;
      }

      const product =
        await productsRepository.getProductByIdForUpdate(
          item.productId,
          client
        );

      if (!product) {
        const error = new Error(
          `Product ${item.productId} not found`
        );
        error.status = 404;
        throw error;
      }

      if (product.stock < item.quantity) {
        const error = new Error(
          `Insufficient stock for ${product.name}`
        );
        error.status = 409;
        throw error;
      }

      await productsRepository.decrementStock(
        item.productId,
        item.quantity,
        client
      );

      const unitPrice = Number(product.price);

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
      client
    );

    return order;
  });
}

async function chargeOrder({ orderId, idempotencyKey }) {
  if (!idempotencyKey) {
    const error = new Error("Idempotency key is required");
    error.status = 400;
    throw error;
  }

  const cached = await redis.get(`idem:${idempotencyKey}`);

  if (cached) {
    return JSON.parse(cached);
  }

  return withTransaction(async (client) => {
    const existingPayment =
      await paymentsRepository.findPaymentByIdempotencyKey(
        idempotencyKey,
        client
      );

    if (existingPayment) {
      const order = await ordersRepository.getOrderById(
        existingPayment.order_id,
        client
      );

      return {
        order,
        payment: existingPayment,
      };
    }

    const order = await ordersRepository.getOrderById(
      orderId,
      client
    );

    if (!order) {
      const error = new Error("Order not found");
      error.status = 404;
      throw error;
    }

    if (order.status !== "PENDING") {
      const error = new Error(
        "Only pending orders can be charged"
      );
      error.status = 409;
      throw error;
    }

    const gatewayResponse = await paymentGateway.charge({
      orderId: order.id,
      amount: order.total_amount,
    });

    const payment =
      await paymentsRepository.createPayment(
        {
          orderId: order.id,
          amount: gatewayResponse.chargedAmount,
          providerTxnId:
            gatewayResponse.providerTxnId,
          status: "SUCCESS",
          idempotencyKey,
        },
        client
      );

    const updatedOrder =
      await ordersRepository.markOrderAsPaid(
        order.id,
        client
      );

    const response = {
      order: updatedOrder,
      payment,
    };

    await redis.set(
      `idem:${idempotencyKey}`,
      JSON.stringify(response),
      "EX",
      3600
    );

    return response;
  });
}

async function processPaymentWebhook({
  providerEventId,
  orderId,
  eventType,
  payload,
}) {
  return withTransaction(async (client) => {
    const existingEvent =
      await paymentsRepository.getWebhookEventByProviderEventId(
        providerEventId,
        client
      );

    if (existingEvent) {
      return { accepted: true };
    }

    await paymentsRepository.createWebhookEvent(
      {
        providerEventId,
        orderId,
        eventType,
        payload,
      },
      client
    );

    if (eventType === "payment_succeeded") {
      await ordersRepository.markOrderAsPaid(
        orderId,
        client
      );
    }

    return { accepted: true };
  });
}

async function getOrderById(orderId) {
  const order =
    await ordersRepository.getOrderWithDetails(orderId);

  if (!order) {
    const error = new Error("Order not found");
    error.status = 404;
    throw error;
  }

  return order;
}

async function listOrders(params) {
  return ordersRepository.listOrders(params);
}

module.exports = {
  createOrder,
  chargeOrder,
  processPaymentWebhook,
  getOrderById,
  listOrders,
};