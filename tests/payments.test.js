import { jest } from "@jest/globals";
import crypto from "node:crypto";
import request from "supertest";
import app from "../src/app.js";
import { User } from "../src/models/userModel.js";
import {
  MarketListing,
  MarketRequest,
} from "../src/models/marketplaceModel.js";
import { Payment } from "../src/models/paymentModel.js";
import { CoachAthlete } from "../src/models/coachAthleteModel.js";
const envNames = [
  "RAZORPAY_KEY_ID",
  "RAZORPAY_KEY_SECRET",
  "RAZORPAY_WEBHOOK_SECRET",
  "PAYMENTS_ENABLED",
];
const original = Object.fromEntries(envNames.map((k) => [k, process.env[k]]));
let network;
beforeEach(() => {
  process.env.RAZORPAY_KEY_ID = "rzp_test_local";
  process.env.RAZORPAY_KEY_SECRET = "local-test-secret";
  process.env.RAZORPAY_WEBHOOK_SECRET = "local-hook-secret";
  process.env.PAYMENTS_ENABLED = "true";
  network = jest.spyOn(global, "fetch");
});
afterEach(() => {
  network.mockRestore();
  for (const key of envNames) {
    if (original[key] === undefined) delete process.env[key];
    else process.env[key] = original[key];
  }
});
const fixture = async (status = "accepted") => {
  const coach = await User.create({
    name: "Paid coach",
    email: "coach@pay.test",
    passwordHash: "Password123!",
    roles: ["coach"],
  });
  const athlete = await User.create({
    name: "Paid athlete",
    email: "athlete@pay.test",
    passwordHash: "Password123!",
    roles: ["athlete"],
  });
  const listing = await MarketListing.create({
    providerId: coach._id,
    slug: "paid-coaching",
    title: "Monthly coaching",
    category: "coaching",
    summary: "Coaching with regular check-ins.",
    description: "A real package workflow with a clear monthly fee.",
    features: [],
    priceMinor: 299900,
    currency: "INR",
    billing: "month",
    status: "published",
  });
  const enquiry = await MarketRequest.create({
    listingId: listing._id,
    customerId: athlete._id,
    providerId: coach._id,
    message: "I would like coaching.",
    status,
    titleSnapshot: listing.title,
    categorySnapshot: "coaching",
    billingSnapshot: "month",
    priceMinor: 299900,
    currency: "INR",
    isDemo: false,
  });
  return {
    coach,
    athlete,
    enquiry,
    headers: { Authorization: `Bearer ${athlete.generateAccessToken()}` },
  };
};
const response = (data) =>
  Promise.resolve({ ok: true, json: async () => data });
const captured = {
  id: "pay_local123",
  order_id: "order_local123",
  amount: 299900,
  currency: "INR",
  status: "captured",
};
const order = () =>
  network.mockImplementationOnce(() =>
    response({ id: "order_local123", amount: 299900, currency: "INR" }),
  );
const signature = () =>
  crypto
    .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
    .update("order_local123|pay_local123")
    .digest("hex");
it("blocks payment before coach acceptance and when credentials are disabled", async () => {
  const f = await fixture("requested");
  expect(
    (
      await request(app)
        .post("/api/v1/payments/orders")
        .set(f.headers)
        .send({ requestId: f.enquiry.id, amount: 1 })
    ).status,
  ).toBe(409);
  process.env.PAYMENTS_ENABLED = "false";
  expect(
    (
      await request(app)
        .post("/api/v1/payments/orders")
        .set(f.headers)
        .send({ requestId: f.enquiry.id })
    ).status,
  ).toBe(503);
  expect(network).not.toHaveBeenCalled();
});
it("uses the accepted snapshot price and reuses its gateway order", async () => {
  const f = await fixture();
  order();
  const first = await request(app)
    .post("/api/v1/payments/orders")
    .set(f.headers)
    .send({ requestId: f.enquiry.id, amount: 1 });
  expect(first.status).toBe(200);
  expect(first.body.data.amount).toBe(299900);
  expect(JSON.parse(network.mock.calls[0][1].body).amount).toBe(299900);
  await request(app)
    .post("/api/v1/payments/orders")
    .set(f.headers)
    .send({ requestId: f.enquiry.id });
  expect(network).toHaveBeenCalledTimes(1);
  expect(await Payment.countDocuments()).toBe(1);
});
it("does not activate coaching for an authorised but uncaptured payment", async () => {
  const f = await fixture();
  order();
  await request(app)
    .post("/api/v1/payments/orders")
    .set(f.headers)
    .send({ requestId: f.enquiry.id });
  network.mockImplementationOnce(() =>
    response({ ...captured, status: "authorized" }),
  );
  const result = await request(app)
    .post("/api/v1/payments/verify")
    .set(f.headers)
    .send({
      requestId: f.enquiry.id,
      razorpay_order_id: "order_local123",
      razorpay_payment_id: "pay_local123",
      razorpay_signature: signature(),
    });
  expect(result.status).toBe(202);
  expect(await CoachAthlete.countDocuments()).toBe(0);
  expect((await Payment.findOne()).status).toBe("created");
});
it("confirms captured payments and activates coaching once despite replay", async () => {
  const f = await fixture();
  order();
  await request(app)
    .post("/api/v1/payments/orders")
    .set(f.headers)
    .send({ requestId: f.enquiry.id });
  const body = {
    requestId: f.enquiry.id,
    razorpay_order_id: "order_local123",
    razorpay_payment_id: "pay_local123",
    razorpay_signature: signature(),
  };
  network.mockImplementationOnce(() => response(captured));
  expect(
    (
      await request(app)
        .post("/api/v1/payments/verify")
        .set(f.headers)
        .send(body)
    ).status,
  ).toBe(200);
  network.mockImplementationOnce(() => response(captured));
  expect(
    (
      await request(app)
        .post("/api/v1/payments/verify")
        .set(f.headers)
        .send(body)
    ).status,
  ).toBe(200);
  expect(await CoachAthlete.countDocuments({ status: "active" })).toBe(1);
  expect((await MarketRequest.findById(f.enquiry._id)).paymentStatus).toBe(
    "paid",
  );
});
it("rejects invalid signatures and amount mismatches without granting access", async () => {
  const f = await fixture();
  order();
  await request(app)
    .post("/api/v1/payments/orders")
    .set(f.headers)
    .send({ requestId: f.enquiry.id });
  const body = {
    requestId: f.enquiry.id,
    razorpay_order_id: "order_local123",
    razorpay_payment_id: "pay_local123",
    razorpay_signature: "0".repeat(64),
  };
  expect(
    (
      await request(app)
        .post("/api/v1/payments/verify")
        .set(f.headers)
        .send(body)
    ).status,
  ).toBe(400);
  body.razorpay_signature = signature();
  network.mockImplementationOnce(() => response({ ...captured, amount: 1 }));
  expect(
    (
      await request(app)
        .post("/api/v1/payments/verify")
        .set(f.headers)
        .send(body)
    ).status,
  ).toBe(400);
  expect(await CoachAthlete.countDocuments()).toBe(0);
});
it("authenticates raw webhooks and ignores failed events after capture", async () => {
  const f = await fixture();
  order();
  await request(app)
    .post("/api/v1/payments/orders")
    .set(f.headers)
    .send({ requestId: f.enquiry.id });
  const payload = {
    event: "payment.captured",
    payload: { payment: { entity: captured } },
  };
  const text = JSON.stringify(payload);
  expect(
    (
      await request(app)
        .post("/api/v1/payments/webhook")
        .set("x-razorpay-signature", "0".repeat(64))
        .send(payload)
    ).status,
  ).toBe(400);
  const sig = crypto
    .createHmac("sha256", process.env.RAZORPAY_WEBHOOK_SECRET)
    .update(text)
    .digest("hex");
  expect(
    (
      await request(app)
        .post("/api/v1/payments/webhook")
        .set("x-razorpay-signature", sig)
        .send(payload)
    ).status,
  ).toBe(200);
  const failed = {
    event: "payment.failed",
    payload: { payment: { entity: { ...captured, status: "failed" } } },
  };
  const failedSig = crypto
    .createHmac("sha256", process.env.RAZORPAY_WEBHOOK_SECRET)
    .update(JSON.stringify(failed))
    .digest("hex");
  await request(app)
    .post("/api/v1/payments/webhook")
    .set("x-razorpay-signature", failedSig)
    .send(failed);
  expect((await Payment.findOne()).status).toBe("paid");
});
it("requires reconciliation after an uncertain order response instead of creating another order", async () => {
  const f = await fixture();
  network.mockRejectedValueOnce(new Error("Connection lost"));
  expect(
    (
      await request(app)
        .post("/api/v1/payments/orders")
        .set(f.headers)
        .send({ requestId: f.enquiry.id })
    ).status,
  ).toBe(502);
  expect(
    (
      await request(app)
        .post("/api/v1/payments/orders")
        .set(f.headers)
        .send({ requestId: f.enquiry.id })
    ).status,
  ).toBe(409);
  expect(network).toHaveBeenCalledTimes(1);
});
it("keeps another athlete from creating, verifying or refreshing a customer's payment", async () => {
  const f = await fixture();
  order();
  await request(app)
    .post("/api/v1/payments/orders")
    .set(f.headers)
    .send({ requestId: f.enquiry.id });
  const other = await User.create({
    name: "Other athlete",
    email: "other@pay.test",
    passwordHash: "Password123!",
    roles: ["athlete"],
  });
  const headers = { Authorization: `Bearer ${other.generateAccessToken()}` };
  expect(
    (
      await request(app)
        .post("/api/v1/payments/orders")
        .set(headers)
        .send({ requestId: f.enquiry.id })
    ).status,
  ).toBe(409);
  expect(
    (
      await request(app)
        .post("/api/v1/payments/verify")
        .set(headers)
        .send({
          requestId: f.enquiry.id,
          razorpay_order_id: "order_local123",
          razorpay_payment_id: "pay_local123",
          razorpay_signature: signature(),
        })
    ).status,
  ).toBe(404);
  expect(
    (
      await request(app)
        .post(`/api/v1/payments/${(await Payment.findOne()).id}/refresh`)
        .set(headers)
    ).status,
  ).toBe(404);
  expect(network).toHaveBeenCalledTimes(1);
});
it("records capture for a withdrawn offering without granting coaching access", async () => {
  const f = await fixture();
  order();
  await request(app)
    .post("/api/v1/payments/orders")
    .set(f.headers)
    .send({ requestId: f.enquiry.id });
  await MarketListing.updateOne(
    { _id: f.enquiry.listingId },
    { $set: { status: "draft" } },
  );
  network.mockImplementationOnce(() => response(captured));
  const result = await request(app)
    .post("/api/v1/payments/verify")
    .set(f.headers)
    .send({
      requestId: f.enquiry.id,
      razorpay_order_id: "order_local123",
      razorpay_payment_id: "pay_local123",
      razorpay_signature: signature(),
    });
  expect(result.status).toBe(200);
  expect(result.body.data.payment.fulfillment).toBe("needs_review");
  expect((await Payment.findOne()).status).toBe("paid");
  expect(await CoachAthlete.countDocuments()).toBe(0);
});
