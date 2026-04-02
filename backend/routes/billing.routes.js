import { Router } from "express";
import { createCheckout, getSummary, verifyCheckout } from "../api/billing.controller.js";

export const billingRouter = Router();

billingRouter.get("/summary", getSummary);
billingRouter.post("/checkout", createCheckout);
billingRouter.post("/verify", verifyCheckout);
