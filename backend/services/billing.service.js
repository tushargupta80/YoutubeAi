import crypto, { randomUUID } from "node:crypto";
import { env } from "../config/env.js";
import { query, withTransaction } from "../config/db.js";
import { getNoteJobRecord } from "./notes.repository.js";
import {
  applyCreditDelta,
  createBillingOrder,
  ensureCreditAccount,
  findLedgerEntryByReference,
  getBillingOrderByProviderOrderId,
  getCreditAccount,
  insertLedgerEntry,
  listCreditLedger,
  markBillingOrderPaid
} from "./billing.repository.js";

const BILLING_PLANS = [
  {
    id: "starter-pack",
    name: "Starter Pack",
    description: "A low-commitment credit pack for trying a few lectures.",
    credits: 40,
    amountInr: 199,
    highlight: "Good first purchase"
  },
  {
    id: "pro-pack",
    name: "Pro Pack",
    description: "Balanced credits for regular weekly study note generation.",
    credits: 150,
    amountInr: 699,
    highlight: "Best value"
  },
  {
    id: "power-pack",
    name: "Power Pack",
    description: "Higher-volume credits for serious prep and repeated revisions.",
    credits: 400,
    amountInr: 1699,
    highlight: "Heavy usage"
  }
];

class BillingError extends Error {
  constructor(message, status = 400, code = "BILLING_ERROR") {
    super(message);
    this.name = "BillingError";
    this.status = status;
    this.statusCode = status;
    this.code = code;
  }
}

function getBasicAuthHeader() {
  return `Basic ${Buffer.from(`${env.razorpayKeyId}:${env.razorpayKeySecret}`).toString("base64")}`;
}

function getPlanById(planId) {
  return BILLING_PLANS.find((plan) => plan.id === planId) || null;
}

function buildSummary(account, ledger) {
  return {
    balance: Number(account?.balance || 0),
    lifetimeCredited: Number(account?.lifetime_credited || 0),
    lifetimeSpent: Number(account?.lifetime_spent || 0),
    starterCredits: env.billingStarterCredits,
    noteGenerationCreditCost: env.noteGenerationCreditCost,
    billingEnabled: Boolean(env.razorpayKeyId && env.razorpayKeySecret),
    currency: env.razorpayCurrency,
    plans: BILLING_PLANS,
    recentLedger: ledger.map((entry) => ({
      ...entry,
      delta: Number(entry.delta || 0)
    }))
  };
}

async function createRazorpayOrder({ receipt, amountInr, notes }) {
  const response = await fetch("https://api.razorpay.com/v1/orders", {
    method: "POST",
    headers: {
      Authorization: getBasicAuthHeader(),
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      amount: amountInr * 100,
      currency: env.razorpayCurrency,
      receipt,
      notes
    })
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new BillingError(payload?.error?.description || "Failed to create Razorpay order.", 502, "RAZORPAY_ORDER_FAILED");
  }

  return payload;
}

export async function grantStarterCredits(userId) {
  if (env.billingStarterCredits <= 0) {
    return getBillingSummary(userId);
  }

  await withTransaction(async (client) => {
    await ensureCreditAccount(userId, client);
    const existing = await findLedgerEntryByReference(userId, "starter_grant", "user", userId, client);
    if (existing) {
      return;
    }

    await applyCreditDelta(userId, env.billingStarterCredits, client);
    await insertLedgerEntry({
      id: randomUUID(),
      userId,
      delta: env.billingStarterCredits,
      entryType: "starter_grant",
      description: `Starter credits for new account (${env.billingStarterCredits} credits).`,
      referenceType: "user",
      referenceId: userId,
      metadata: { source: "signup" }
    }, client);
  });

  return getBillingSummary(userId);
}

export async function getBillingSummary(userId) {
  await ensureCreditAccount(userId);
  const [account, ledger] = await Promise.all([
    getCreditAccount(userId),
    listCreditLedger(userId, 12)
  ]);

  return buildSummary(account, ledger);
}

export async function reserveCreditsForNotesJob({ userId, jobId, youtubeUrl }) {
  return withTransaction(async (client) => {
    await ensureCreditAccount(userId, client);
    const existingCharge = await findLedgerEntryByReference(userId, "note_generation_charge", "note_job", jobId, client);
    if (existingCharge) {
      const account = await getCreditAccount(userId, client);
      return {
        charged: false,
        creditsCharged: Math.abs(Number(existingCharge.delta || 0)),
        balanceAfter: Number(account?.balance || 0)
      };
    }

    const account = await getCreditAccount(userId, client);
    const balance = Number(account?.balance || 0);
    if (balance < env.noteGenerationCreditCost) {
      throw new BillingError(
        `You need ${env.noteGenerationCreditCost} credits to generate notes. Please top up your balance.`,
        402,
        "INSUFFICIENT_CREDITS"
      );
    }

    const updated = await applyCreditDelta(userId, -env.noteGenerationCreditCost, client);
    await insertLedgerEntry({
      id: randomUUID(),
      userId,
      delta: -env.noteGenerationCreditCost,
      entryType: "note_generation_charge",
      description: `Charged ${env.noteGenerationCreditCost} credits for note generation.`,
      referenceType: "note_job",
      referenceId: jobId,
      metadata: { youtubeUrl }
    }, client);

    return {
      charged: true,
      creditsCharged: env.noteGenerationCreditCost,
      balanceAfter: Number(updated?.balance || 0)
    };
  });
}

export async function refundCreditsForNoteJob(jobId, reason = "job_failed") {
  const job = await getNoteJobRecord(jobId);
  if (!job?.user_id) {
    return { refunded: false, reason: "job_not_found" };
  }

  return withTransaction(async (client) => {
    await ensureCreditAccount(job.user_id, client);

    const charge = await findLedgerEntryByReference(job.user_id, "note_generation_charge", "note_job", jobId, client);
    if (!charge) {
      return { refunded: false, reason: "no_charge" };
    }

    const existingRefund = await findLedgerEntryByReference(job.user_id, "note_generation_refund", "note_job", jobId, client);
    if (existingRefund) {
      return { refunded: false, reason: "already_refunded" };
    }

    const refundAmount = Math.abs(Number(charge.delta || 0));
    const updated = await applyCreditDelta(job.user_id, refundAmount, client);
    await insertLedgerEntry({
      id: randomUUID(),
      userId: job.user_id,
      delta: refundAmount,
      entryType: "note_generation_refund",
      description: `Refunded ${refundAmount} credits because the note job did not complete successfully.`,
      referenceType: "note_job",
      referenceId: jobId,
      metadata: { reason }
    }, client);

    return {
      refunded: true,
      amount: refundAmount,
      balanceAfter: Number(updated?.balance || 0)
    };
  });
}

export async function createCheckoutForPlan(user, planId) {
  if (!env.razorpayKeyId || !env.razorpayKeySecret) {
    throw new BillingError("Razorpay is not configured yet. Add your Razorpay keys before accepting payments.", 503, "PAYMENTS_NOT_CONFIGURED");
  }

  const plan = getPlanById(planId);
  if (!plan) {
    throw new BillingError("Selected plan not found.", 404, "PLAN_NOT_FOUND");
  }

  const localOrderId = randomUUID();
  const providerOrder = await createRazorpayOrder({
    receipt: localOrderId,
    amountInr: plan.amountInr,
    notes: {
      userId: user.id,
      planId: plan.id,
      credits: String(plan.credits)
    }
  });

  await createBillingOrder({
    id: localOrderId,
    userId: user.id,
    planId: plan.id,
    planName: plan.name,
    credits: plan.credits,
    amountInr: plan.amountInr,
    currency: env.razorpayCurrency,
    providerOrderId: providerOrder.id,
    rawPayload: providerOrder
  });

  return {
    checkout: {
      key: env.razorpayKeyId,
      orderId: providerOrder.id,
      amount: plan.amountInr * 100,
      currency: env.razorpayCurrency,
      name: env.siteName,
      description: `${plan.name} - ${plan.credits} credits`,
      prefill: {
        name: user.name || "",
        email: user.email || ""
      },
      notes: {
        localOrderId,
        planId: plan.id
      }
    },
    plan
  };
}

export async function verifyCheckoutAndApplyCredits({
  userId,
  razorpayOrderId,
  razorpayPaymentId,
  razorpaySignature
}) {
  if (!env.razorpayKeySecret) {
    throw new BillingError("Razorpay secret is not configured.", 503, "PAYMENTS_NOT_CONFIGURED");
  }

  const expectedSignature = crypto
    .createHmac("sha256", env.razorpayKeySecret)
    .update(`${razorpayOrderId}|${razorpayPaymentId}`)
    .digest("hex");

  if (expectedSignature !== razorpaySignature) {
    throw new BillingError("Payment verification failed. Please contact support if you were charged.", 400, "PAYMENT_VERIFICATION_FAILED");
  }

  const summary = await withTransaction(async (client) => {
    const order = await getBillingOrderByProviderOrderId(razorpayOrderId, client);
    if (!order || order.user_id !== userId) {
      throw new BillingError("Billing order not found for this account.", 404, "ORDER_NOT_FOUND");
    }

    await ensureCreditAccount(userId, client);

    const existingPurchase = await findLedgerEntryByReference(userId, "credit_purchase", "billing_order", order.id, client);
    if (!existingPurchase) {
      await markBillingOrderPaid({
        providerOrderId: razorpayOrderId,
        providerPaymentId: razorpayPaymentId,
        providerSignature: razorpaySignature,
        rawPayload: {
          razorpayOrderId,
          razorpayPaymentId,
          razorpaySignature
        }
      }, client);

      await applyCreditDelta(userId, Number(order.credits || 0), client);
      await insertLedgerEntry({
        id: randomUUID(),
        userId,
        delta: Number(order.credits || 0),
        entryType: "credit_purchase",
        description: `Purchased ${order.credits} credits via Razorpay (${order.plan_name}).`,
        referenceType: "billing_order",
        referenceId: order.id,
        metadata: {
          providerOrderId: razorpayOrderId,
          providerPaymentId: razorpayPaymentId,
          planId: order.plan_id
        }
      }, client);
    }

    const [account, ledger] = await Promise.all([
      getCreditAccount(userId, client),
      listCreditLedger(userId, 12, client)
    ]);
    return buildSummary(account, ledger);
  });

  return summary;
}
