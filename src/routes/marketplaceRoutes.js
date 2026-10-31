import { Router } from "express";
import mongoose from "mongoose";
import crypto from "node:crypto";
import { z } from "zod";
import {
  MarketListing,
  MarketRequest,
  MarketSaved,
} from "../models/marketplaceModel.js";
import { User } from "../models/userModel.js";
import { verifyJWT } from "../middlewares/authMiddleware.js";
import { requireRole } from "../middlewares/roleMiddleware.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiResponse } from "../utils/apiResponse.js";
import { ApiError } from "../utils/apiError.js";
import { validateBody } from "../validations/schemas.js";
import { notifyUser } from "../services/notificationService.js";
const r = Router();
const categories = ["plan", "coaching", "meal", "supplement", "gear"];
const escape = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const allowed = (roles, category) =>
  roles.includes("admin") ||
  (roles.includes("coach") && ["plan", "coaching"].includes(category)) ||
  (roles.includes("gym_owner") &&
    ["meal", "supplement", "gear"].includes(category));
const schema = z.object({
  title: z.string().trim().min(3).max(100),
  category: z.enum(categories),
  summary: z.string().trim().min(10).max(220),
  description: z.string().trim().min(20).max(4000),
  features: z.array(z.string().trim().min(1).max(150)).max(8).default([]),
  priceMinor: z.number().int().min(0).max(100000000),
  currency: z.enum(["INR", "USD"]).default("INR"),
  billing: z.enum(["once", "month"]).default("once"),
  duration: z.string().trim().max(80).default(""),
  sellerLicenceRef: z.string().trim().max(160).default(""),
});
r.get(
  "/",
  asyncHandler(async (req, res) => {
    const page = Math.max(
      1,
      Math.min(10000, Math.floor(Number(req.query.page) || 1)),
    );
    const limit = 12;
    const query = { status: "published" };
    if (categories.includes(req.query.category))
      query.category = req.query.category;
    if (req.query.q)
      query.$or = ["title", "summary"].map((field) => ({
        [field]: {
          $regex: escape(String(req.query.q).slice(0, 100)),
          $options: "i",
        },
      }));
    const sort =
      req.query.sort === "price"
        ? { priceMinor: 1, _id: 1 }
        : { createdAt: -1, _id: -1 };
    const [listings, total] = await Promise.all([
      MarketListing.find(query)
        .select("-sellerLicenceRef -reviewNote -licenceReviewedBy")
        .populate("providerId", "name")
        .sort(sort)
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      MarketListing.countDocuments(query),
    ]);
    res.json(
      new ApiResponse(
        200,
        { listings, total, page, limit },
        "Marketplace catalogue",
      ),
    );
  }),
);
r.get(
  "/saved",
  verifyJWT,
  asyncHandler(async (req, res) => {
    const rows = await MarketSaved.find({ userId: req.user._id })
      .sort({ createdAt: -1 })
      .populate({
        path: "listingId",
        match: { status: "published" },
        select:
          "title slug category summary priceMinor currency billing duration isDemo",
        populate: { path: "providerId", select: "name" },
      })
      .lean();
    res.json(
      new ApiResponse(
        200,
        rows.filter((row) => row.listingId),
        "Saved listings",
      ),
    );
  }),
);
r.get(
  "/requests",
  verifyJWT,
  asyncHandler(async (req, res) => {
    const query =
      req.query.view === "provider"
        ? { providerId: req.user._id }
        : { customerId: req.user._id };
    const requests = await MarketRequest.find(query)
      .sort({ createdAt: -1 })
      .limit(100)
      .populate("listingId", "slug title category")
      .populate("customerId", "name email")
      .populate("providerId", "name email")
      .lean();
    res.json(new ApiResponse(200, requests, "Marketplace requests"));
  }),
);
r.patch(
  "/requests/:id",
  verifyJWT,
  validateBody(
    z.object({
      status: z.enum(["accepted", "declined", "cancelled"]),
      responseNote: z.string().trim().max(1500).optional(),
    }),
  ),
  asyncHandler(async (req, res) => {
    if (!mongoose.isValidObjectId(req.params.id))
      throw new ApiError(404, "Request not found");
    const request = await MarketRequest.findById(req.params.id);
    if (!request) throw new ApiError(404, "Request not found");
    const customer = String(request.customerId) === String(req.user._id);
    const provider = String(request.providerId) === String(req.user._id);
    if (
      !(customer && req.body.status === "cancelled") &&
      !(provider && ["accepted", "declined"].includes(req.body.status))
    )
      throw new ApiError(403, "You cannot make that decision");
    const updated = await MarketRequest.findOneAndUpdate(
      { _id: request._id, status: "requested" },
      {
        $set: {
          status: req.body.status,
          responseNote: req.body.responseNote || "",
        },
      },
      { new: true },
    );
    if (!updated)
      throw new ApiError(409, "This request has already been reviewed");
    await notifyUser(
      customer ? request.providerId : request.customerId,
      `market-decision:${request._id}`,
      {
        type: "marketplace",
        title: `Marketplace request ${req.body.status}`,
        body: `${request.titleSnapshot}: ${req.user.name} ${req.body.status} the request. No payment has been collected.`,
        href: customer
          ? "/marketplace/requests?view=provider"
          : "/marketplace/requests",
      },
    );
    res.json(new ApiResponse(200, updated, "Request updated"));
  }),
);
r.get(
  "/provider/listings",
  verifyJWT,
  requireRole("coach", "gym_owner", "admin"),
  asyncHandler(async (req, res) => {
    const query =
      req.user.roles.includes("admin") && req.query.all === "true"
        ? {}
        : { providerId: req.user._id };
    const listings = await MarketListing.find(query)
      .sort({ updatedAt: -1 })
      .populate("providerId", "name roles")
      .limit(200)
      .lean();
    res.json(new ApiResponse(200, listings, "Provider listings"));
  }),
);
r.post(
  "/provider/listings",
  verifyJWT,
  requireRole("coach", "gym_owner", "admin"),
  validateBody(schema),
  asyncHandler(async (req, res) => {
    if (!allowed(req.user.roles, req.body.category))
      throw new ApiError(403, "Your approved role cannot offer this category");
    const slug =
      req.body.title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "") +
      "-" +
      crypto.randomBytes(4).toString("hex");
    const listing = await MarketListing.create({
      ...req.body,
      slug,
      providerId: req.user._id,
      status: "draft",
    });
    res
      .status(201)
      .json(new ApiResponse(201, listing, "Listing draft created"));
  }),
);
r.patch(
  "/provider/listings/:id",
  verifyJWT,
  requireRole("coach", "gym_owner", "admin"),
  validateBody(
    schema
      .partial()
      .extend({
        status: z.enum(["draft", "pending", "published"]).optional(),
        reviewNote: z.string().trim().max(1000).optional(),
        verificationAcknowledged: z.literal(true).optional(),
      }),
  ),
  asyncHandler(async (req, res) => {
    if (!mongoose.isValidObjectId(req.params.id))
      throw new ApiError(404, "Listing not found");
    const listing = await MarketListing.findById(req.params.id);
    if (!listing) throw new ApiError(404, "Listing not found");
    const admin = req.user.roles.includes("admin");
    const owner = String(listing.providerId) === String(req.user._id);
    if (!admin && !owner)
      throw new ApiError(403, "This listing belongs to another provider");
    if (!admin && req.body.status === "published")
      throw new ApiError(
        403,
        "An admin must approve a listing before publication",
      );
    if (!admin && req.body.verificationAcknowledged !== undefined)
      throw new ApiError(403, "Only an admin can verify seller documents");
    if (!admin && req.body.reviewNote !== undefined)
      throw new ApiError(403, "Only an admin can add a moderation note");
    const provider = await User.findById(listing.providerId).select("roles");
    const category = req.body.category || listing.category;
    if (!provider || !allowed(provider.roles, category))
      throw new ApiError(403, "Provider access does not allow this category");
    if (
      req.body.status === "published" &&
      ["meal", "supplement"].includes(category) &&
      (!req.body.verificationAcknowledged ||
        !(req.body.sellerLicenceRef || listing.sellerLicenceRef))
    )
      throw new ApiError(
        400,
        "Record the seller licence reference after manual verification before publishing food or supplements",
      );
    const patch = { ...req.body };
    delete patch.verificationAcknowledged;
    if (admin && req.body.verificationAcknowledged) {
      patch.licenceReviewedBy = req.user._id;
      patch.licenceReviewedAt = new Date();
    }
    if (!admin && listing.status === "published") patch.status = "pending";
    Object.assign(listing, patch);
    await listing.save();
    if (listing.status === "pending") {
      const admins = await User.find({ roles: "admin" }).select("_id");
      await Promise.all(
        admins.map((user) =>
          notifyUser(
            user._id,
            `market-review:${listing._id}:${listing.updatedAt.toISOString()}`,
            {
              type: "marketplace",
              title: "A marketplace listing needs review",
              body: listing.title,
              href: "/marketplace/manage",
            },
          ),
        ),
      );
    }
    if (admin && req.body.status)
      await notifyUser(
        listing.providerId,
        `listing-status:${listing._id}:${listing.updatedAt.toISOString()}`,
        {
          type: "marketplace",
          title:
            listing.status === "published"
              ? "Your listing is published"
              : "Your listing status changed",
          body: `${listing.title}${listing.reviewNote ? ": " + listing.reviewNote : ""}`,
          href: "/marketplace/manage",
        },
      );
    res.json(new ApiResponse(200, listing, "Listing updated"));
  }),
);
r.post(
  "/listings/:id/save",
  verifyJWT,
  validateBody(z.object({ saved: z.boolean() })),
  asyncHandler(async (req, res) => {
    if (
      !mongoose.isValidObjectId(req.params.id) ||
      !(await MarketListing.exists({ _id: req.params.id, status: "published" }))
    )
      throw new ApiError(404, "Listing not found");
    if (req.body.saved)
      await MarketSaved.updateOne(
        { userId: req.user._id, listingId: req.params.id },
        { $setOnInsert: { userId: req.user._id, listingId: req.params.id } },
        { upsert: true },
      );
    else
      await MarketSaved.deleteOne({
        userId: req.user._id,
        listingId: req.params.id,
      });
    res.json(new ApiResponse(200, null, "Saved listing updated"));
  }),
);
r.post(
  "/listings/:id/request",
  verifyJWT,
  requireRole("athlete"),
  validateBody(z.object({ message: z.string().trim().min(5).max(2000) })),
  asyncHandler(async (req, res) => {
    if (!mongoose.isValidObjectId(req.params.id))
      throw new ApiError(404, "Listing not found");
    const listing = await MarketListing.findOne({
      _id: req.params.id,
      status: "published",
    });
    if (!listing) throw new ApiError(404, "Listing is no longer available");
    if (String(listing.providerId) === String(req.user._id))
      throw new ApiError(400, "You cannot request your own listing");
    if (
      await MarketRequest.exists({
        listingId: listing._id,
        customerId: req.user._id,
        status: { $in: ["requested", "accepted"] },
      })
    )
      throw new ApiError(
        409,
        "You already have an active request for this listing",
      );
    const request = await MarketRequest.create({
      listingId: listing._id,
      customerId: req.user._id,
      providerId: listing.providerId,
      message: req.body.message,
      titleSnapshot: listing.title,
      categorySnapshot: listing.category,
      billingSnapshot: listing.billing,
      priceMinor: listing.priceMinor,
      currency: listing.currency,
      isDemo: listing.isDemo,
    });
    await notifyUser(listing.providerId, `market-request:${request._id}`, {
      type: "marketplace",
      title: "A new marketplace enquiry",
      body: `${req.user.name} is interested in ${listing.title}.`,
      href: "/marketplace/requests?view=provider",
    });
    res
      .status(201)
      .json(
        new ApiResponse(201, request, "Request sent; no payment collected"),
      );
  }),
);
r.get(
  "/:slug",
  asyncHandler(async (req, res) => {
    const listing = await MarketListing.findOne({
      slug: req.params.slug,
      status: "published",
    })
      .select("-sellerLicenceRef -reviewNote -licenceReviewedBy")
      .populate("providerId", "name roles")
      .lean();
    if (!listing) throw new ApiError(404, "Listing not found");
    res.json(new ApiResponse(200, listing, "Listing details"));
  }),
);
export default r;
