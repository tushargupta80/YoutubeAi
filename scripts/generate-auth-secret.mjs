import crypto from "node:crypto";

const length = Number(process.env.GENERATE_SECRET_BYTES || 48);
const bytes = Number.isFinite(length) && length > 0 ? length : 48;

console.log(crypto.randomBytes(bytes).toString("hex"));
