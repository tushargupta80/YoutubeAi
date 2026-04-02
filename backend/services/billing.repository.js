import { query } from "../config/db.js";

function resolveRunner(executor) {
  if (executor?.query) return executor;
  return { query: executor || query };
}

export async function ensureCreditAccount(userId, executor = query) {
  const runner = resolveRunner(executor);
  await runner.query(
    `INSERT INTO user_credit_accounts (user_id)
     VALUES ($1)
     ON CONFLICT (user_id) DO NOTHING`,
    [userId]
  );

  const result = await runner.query(
    `SELECT user_id, balance, lifetime_credited, lifetime_spent, created_at, updated_at
     FROM user_credit_accounts
     WHERE user_id = $1`,
    [userId]
  );

  return result.rows[0] || null;
}

export async function getCreditAccount(userId, executor = query) {
  const runner = resolveRunner(executor);
  const result = await runner.query(
    `SELECT user_id, balance, lifetime_credited, lifetime_spent, created_at, updated_at
     FROM user_credit_accounts
     WHERE user_id = $1`,
    [userId]
  );

  return result.rows[0] || null;
}

export async function listCreditLedger(userId, limit = 12, executor = query) {
  const runner = resolveRunner(executor);
  const normalizedLimit = Math.min(Math.max(Number(limit || 12), 1), 50);
  const result = await runner.query(
    `SELECT id, delta, entry_type, description, reference_type, reference_id, metadata, created_at
     FROM credit_ledger
     WHERE user_id = $1
     ORDER BY created_at DESC
     LIMIT $2`,
    [userId, normalizedLimit]
  );

  return result.rows;
}

export async function findLedgerEntryByReference(userId, entryType, referenceType, referenceId, executor = query) {
  const runner = resolveRunner(executor);
  const result = await runner.query(
    `SELECT id, user_id, delta, entry_type, description, reference_type, reference_id, metadata, created_at
     FROM credit_ledger
     WHERE user_id = $1
       AND entry_type = $2
       AND reference_type = $3
       AND reference_id = $4
     ORDER BY created_at DESC
     LIMIT 1`,
    [userId, entryType, referenceType, referenceId]
  );

  return result.rows[0] || null;
}

export async function insertLedgerEntry(entry, executor = query) {
  const runner = resolveRunner(executor);
  await runner.query(
    `INSERT INTO credit_ledger (
       id, user_id, delta, entry_type, description, reference_type, reference_id, metadata
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      entry.id,
      entry.userId,
      entry.delta,
      entry.entryType,
      entry.description,
      entry.referenceType || null,
      entry.referenceId || null,
      entry.metadata ? JSON.stringify(entry.metadata) : null
    ]
  );
}

export async function applyCreditDelta(userId, delta, executor = query) {
  const runner = resolveRunner(executor);
  const credited = delta > 0 ? delta : 0;
  const spent = delta < 0 ? Math.abs(delta) : 0;
  const result = await runner.query(
    `UPDATE user_credit_accounts
     SET balance = balance + $2,
         lifetime_credited = lifetime_credited + $3,
         lifetime_spent = lifetime_spent + $4,
         updated_at = NOW()
     WHERE user_id = $1
     RETURNING user_id, balance, lifetime_credited, lifetime_spent, created_at, updated_at`,
    [userId, delta, credited, spent]
  );

  return result.rows[0] || null;
}

export async function createBillingOrder(order, executor = query) {
  const runner = resolveRunner(executor);
  await runner.query(
    `INSERT INTO billing_orders (
       id, user_id, provider, plan_id, plan_name, credits, amount_inr, currency, status, provider_order_id, raw_payload
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
    [
      order.id,
      order.userId,
      order.provider || "razorpay",
      order.planId,
      order.planName,
      order.credits,
      order.amountInr,
      order.currency,
      order.status || "created",
      order.providerOrderId,
      order.rawPayload ? JSON.stringify(order.rawPayload) : null
    ]
  );
}

export async function getBillingOrderByProviderOrderId(providerOrderId, executor = query) {
  const runner = resolveRunner(executor);
  const result = await runner.query(
    `SELECT *
     FROM billing_orders
     WHERE provider_order_id = $1
     LIMIT 1`,
    [providerOrderId]
  );
  return result.rows[0] || null;
}

export async function markBillingOrderPaid({
  providerOrderId,
  providerPaymentId,
  providerSignature,
  rawPayload
}, executor = query) {
  const runner = resolveRunner(executor);
  const result = await runner.query(
    `UPDATE billing_orders
     SET status = 'paid',
         provider_payment_id = $2,
         provider_signature = $3,
         raw_payload = $4,
         paid_at = NOW(),
         updated_at = NOW()
     WHERE provider_order_id = $1
     RETURNING *`,
    [providerOrderId, providerPaymentId, providerSignature, rawPayload ? JSON.stringify(rawPayload) : null]
  );

  return result.rows[0] || null;
}
