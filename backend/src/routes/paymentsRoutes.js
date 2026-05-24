const express = require("express");
const ordersService = require("../services/ordersService");

const router = express.Router();

router.post("/charge", async (req, res, next) => {
  try {
    const { orderId } = req.body;
    const idempotencyKey = req.header("Idempotency-Key");
    if (!idempotencyKey) {
      return res.status(400).json({
        error: "Missing Idempotency-Key header",
      });
    }
    const result = await ordersService.chargeOrder({ orderId, idempotencyKey });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

router.post("/webhook", async (req, res, next) => {
  try {
    const { providerEventId, orderId, eventType, payload } = req.body;
    if (!providerEventId || !orderId || !eventType) {
      return res.status(400).json({
        error: "Missing required fields in webhook payload",
      });
    }
    const result = await ordersService.processPaymentWebhook({
      providerEventId,
      orderId,
      eventType,
      payload,
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
