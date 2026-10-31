import request from "supertest";
import app from "../src/app.js";
import { User } from "../src/models/userModel.js";
import {
  MarketListing,
  MarketRequest,
} from "../src/models/marketplaceModel.js";
import { CoachProfile } from "../src/models/coachProfileModel.js";
const person = async (role, email = role + "@market.test") => {
  const user = await User.create({
    name: "Market " + role,
    email,
    passwordHash: "Password123!",
    roles: [role],
  });
  return {
    user,
    headers: { Authorization: `Bearer ${user.generateAccessToken()}` },
  };
};
const body = {
  title: "Strength programme",
  category: "plan",
  summary: "A carefully structured training programme.",
  description: "A programme with clear sessions, rest and progression notes.",
  features: ["Three weekly sessions"],
  priceMinor: 79900,
  currency: "INR",
  billing: "once",
};
it("requires an approved provider and admin publication before a listing enters the public catalogue", async () => {
  const athlete = await person("athlete");
  const coach = await person("coach");
  const admin = await person("admin");
  expect(
    (
      await request(app)
        .post("/api/v1/marketplace/provider/listings")
        .set(athlete.headers)
        .send(body)
    ).status,
  ).toBe(403);
  const draft = await request(app)
    .post("/api/v1/marketplace/provider/listings")
    .set(coach.headers)
    .send(body);
  expect(draft.status).toBe(201);
  expect((await request(app).get("/api/v1/marketplace")).body.data.total).toBe(
    0,
  );
  expect(
    (
      await request(app)
        .patch(`/api/v1/marketplace/provider/listings/${draft.body.data._id}`)
        .set(coach.headers)
        .send({ status: "published" })
    ).status,
  ).toBe(403);
  expect(
    (
      await request(app)
        .patch(`/api/v1/marketplace/provider/listings/${draft.body.data._id}`)
        .set(admin.headers)
        .send({ status: "published" })
    ).status,
  ).toBe(200);
  expect((await request(app).get("/api/v1/marketplace")).body.data.total).toBe(
    1,
  );
});
it("requires explicit admin licence review for food and supplements", async () => {
  const owner = await person("gym_owner");
  const admin = await person("admin");
  const listing = await MarketListing.create({
    ...body,
    category: "meal",
    providerId: owner.user._id,
    slug: "meal-draft",
    sellerLicenceRef: "Seller document reference",
  });
  expect(
    (
      await request(app)
        .patch(`/api/v1/marketplace/provider/listings/${listing.id}`)
        .set(admin.headers)
        .send({ status: "published" })
    ).status,
  ).toBe(400);
  const approved = await request(app)
    .patch(`/api/v1/marketplace/provider/listings/${listing.id}`)
    .set(admin.headers)
    .send({ status: "published", verificationAcknowledged: true });
  expect(approved.status).toBe(200);
  expect(approved.body.data.licenceReviewedBy).toBe(admin.user.id);
});
it("keeps enquiries private, prevents duplicate requests, and lets only the seller accept", async () => {
  const coach = await person("coach");
  const athlete = await person("athlete");
  const other = await person("athlete", "other@market.test");
  const listing = await MarketListing.create({
    ...body,
    providerId: coach.user._id,
    slug: "published-plan",
    status: "published",
  });
  const sent = await request(app)
    .post(`/api/v1/marketplace/listings/${listing.id}/request`)
    .set(athlete.headers)
    .send({ message: "I would like to start next month." });
  expect(sent.status).toBe(201);
  expect(sent.body.data.priceMinor).toBe(79900);
  expect(
    (
      await request(app)
        .post(`/api/v1/marketplace/listings/${listing.id}/request`)
        .set(athlete.headers)
        .send({ message: "Another request" })
    ).status,
  ).toBe(409);
  expect(
    (await request(app).get("/api/v1/marketplace/requests").set(other.headers))
      .body.data,
  ).toHaveLength(0);
  expect(
    (
      await request(app)
        .patch(`/api/v1/marketplace/requests/${sent.body.data._id}`)
        .set(other.headers)
        .send({ status: "accepted" })
    ).status,
  ).toBe(403);
  expect(
    (
      await request(app)
        .patch(`/api/v1/marketplace/requests/${sent.body.data._id}`)
        .set(coach.headers)
        .send({ status: "accepted" })
    ).status,
  ).toBe(200);
  expect((await MarketRequest.findById(sent.body.data._id)).paymentStatus).toBe(
    "unpaid",
  );
});
it("only publishes coach profiles from active approved coach accounts", async () => {
  const coach = await person("coach");
  await CoachProfile.create({
    coachId: coach.user._id,
    headline: "Strength with a clear approach",
    bio: "Thoughtful coaching and a gradual approach to training.",
    specialties: ["Strength"],
    isPublic: true,
  });
  expect((await request(app).get("/api/v1/coaches")).body.data).toHaveLength(1);
  await User.updateOne(
    { _id: coach.user._id },
    { $set: { roles: ["athlete"] } },
  );
  expect((await request(app).get("/api/v1/coaches")).body.data).toHaveLength(0);
});
