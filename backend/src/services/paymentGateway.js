const {
  PAYMENT_FAILURE_RATE,
  PAYMENT_DELAY_MIN_MS,
  PAYMENT_DELAY_MAX_MS,
} = require("../config/env");

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function randomBetween(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function generateTxnId(orderId) {
  return `txn_${orderId}_${Date.now()}_${crypto.randomUUID()}`;
}

async function charge({ orderId, amount }) {
  const wait = randomBetween(PAYMENT_DELAY_MIN_MS, PAYMENT_DELAY_MAX_MS);
  await delay(wait);

  if (Math.random() < PAYMENT_FAILURE_RATE) {
    const err = new Error("Payment gateway declined");
    err.status = 502;
    throw err;
  }

  return {
    providerTxnId: generateTxnId(orderId),
    chargedAmount: amount,
  };
}

module.exports = { charge };
