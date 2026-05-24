const pool = require("../db/postgres");

async function createPayment(
  { orderId, amount, providerTxnId, status, idempotencyKey },
  client = pool,
) {
  const query = `
    INSERT INTO payments (order_id, amount, provider_txn_id, status, idempotency_key)
    VALUES ($1, $2, $3, $4, $5)
    ON CONFLICT (idempotency_key)
    DO UPDATE SET
      status = EXCLUDED.status
    RETURNING id, order_id AS "orderId", amount, provider_txn_id AS "providerTxnId",
              status, created_at AS "createdAt"
  `;
  const { rows } = await client.query(query, [
    orderId,
    amount,
    providerTxnId,
    status,
    idempotencyKey,
  ]);
  return rows[0];
}

async function findPaymentByIdempotencyKey(idempotencyKey, client = pool) {
  const query = `
    SELECT id, order_id AS "orderId", amount, provider_txn_id AS "providerTxnId",
           status, created_at AS "createdAt"
    FROM payments
    WHERE idempotency_key = $1
    LIMIT 1
  `;
  const { rows } = await client.query(query, [idempotencyKey]);
  return rows[0] || null;
}

async function createWebhookEvent(
  { providerEventId, orderId, eventType, payload },
  client = pool,
) {
  const query = `
    INSERT INTO payment_events (provider_event_id, order_id, event_type, payload)
    VALUES ($1, $2, $3, $4)
    ON CONFLICT (provider_event_id) DO NOTHING
    RETURNING id, provider_event_id AS "providerEventId", order_id AS "orderId",
              event_type AS "eventType", payload, created_at AS "createdAt"
  `;
  const { rows } = await client.query(query, [
    providerEventId,
    orderId,
    eventType,
    payload || {},
  ]);
  return rows[0] || NonNullable;
}

module.exports = {
  createPayment,
  findPaymentByIdempotencyKey,
  createWebhookEvent,
};
