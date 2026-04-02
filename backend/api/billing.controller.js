import { createCheckoutForPlan, getBillingSummary, verifyCheckoutAndApplyCredits } from "../services/billing.service.js";
import { getUserById } from "../services/auth.repository.js";

export async function getSummary(req, res, next) {
  try {
    const summary = await getBillingSummary(req.user.sub);
    return res.json(summary);
  } catch (error) {
    return next(error);
  }
}

export async function createCheckout(req, res, next) {
  try {
    const user = await getUserById(req.user.sub);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    const checkout = await createCheckoutForPlan(user, req.body.planId);
    return res.json(checkout);
  } catch (error) {
    return next(error);
  }
}

export async function verifyCheckout(req, res, next) {
  try {
    const summary = await verifyCheckoutAndApplyCredits({
      userId: req.user.sub,
      razorpayOrderId: req.body.razorpay_order_id,
      razorpayPaymentId: req.body.razorpay_payment_id,
      razorpaySignature: req.body.razorpay_signature
    });

    return res.json({ ok: true, billing: summary });
  } catch (error) {
    return next(error);
  }
}
