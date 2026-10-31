import { CoachProfile } from "../models/coachProfileModel.js";
import "dotenv/config";
import mongoose from "mongoose";
import { User } from "../models/userModel.js";
import { MarketListing } from "../models/marketplaceModel.js";
await mongoose.connect(process.env.MONGODB_URI);
try {
  const coach = await User.findOne({
    email: "coach1@fitplatform.app",
    roles: "coach",
  });
  const owner = await User.findOne({
    email: "owner@fitplatform.app",
    roles: "gym_owner",
  });
  if (!coach || !owner)
    throw new Error("Run the main account seed before seeding the marketplace");
  const items = [
    [
      "strength-foundations",
      "Strength foundations",
      "plan",
      coach._id,
      "A four-week introduction to consistent strength training.",
      "Build a steady gym routine with a coach-designed programme. Your goals, available equipment and starting level are discussed before you begin. This is a demo listing for exploring the enquiry workflow.",
      [
        "4-week programme",
        "3 strength sessions per week",
        "Technique and progression notes",
      ],
      79900,
      "once",
      "4 weeks",
      "published",
    ],
    [
      "first-10k",
      "Your first 10K",
      "plan",
      coach._id,
      "A gradual running block built around a clear finish line.",
      "Discuss your running background and target date with a coach, then agree an appropriate training block. This demo listing represents the endurance programme store described in the business plan.",
      [
        "Goal-setting conversation",
        "Weekly running structure",
        "Recovery guidance",
      ],
      99900,
      "once",
      "8 weeks",
      "published",
    ],
    [
      "hybrid-block",
      "The hybrid block",
      "plan",
      coach._id,
      "Strength and conditioning in one considered training week.",
      "A demo programme for athletes combining gym work and endurance. Sessions and coaching scope are confirmed by the provider before any commitment.",
      [
        "Strength and conditioning",
        "Recovery checkpoints",
        "Weekly progression notes",
      ],
      129900,
      "once",
      "6 weeks",
      "published",
    ],
    [
      "personal-coaching",
      "Training with a human in your corner",
      "coaching",
      coach._id,
      "Ongoing coaching with context, check-ins and plan reviews.",
      "Meet your coach, discuss your goals and agree the support you need. This demo package illustrates a monthly coaching enquiry. It does not automatically create a coaching relationship or charge your account.",
      [
        "Individual training plan",
        "Weekly check-in",
        "Coach-reviewed adjustments",
      ],
      299900,
      "month",
      "Monthly",
      "published",
    ],
    [
      "training-bands",
      "Everyday training bands",
      "gear",
      owner._id,
      "Simple equipment for warm-ups, mobility and travel sessions.",
      "A demo gear listing to demonstrate a provider-managed catalogue. Availability and product specifications must be confirmed with the provider. No payment or shipment is processed.",
      [
        "Portable training kit",
        "Provider confirms availability",
        "No automatic checkout",
      ],
      49900,
      "once",
      "One set",
      "published",
    ],
    [
      "partner-meals",
      "High-protein gym meals",
      "meal",
      owner._id,
      "A partner-kitchen meal subscription awaiting seller review.",
      "Draft demo listing. An admin must verify the kitchen licence reference and delivery details before publication. This item cannot be requested until it passes review.",
      [
        "Meal options agreed with kitchen",
        "Delivery area confirmed",
        "Licence review required",
      ],
      199900,
      "month",
      "Monthly",
      "draft",
    ],
    [
      "supplement-partner",
      "Verified-seller supplement range",
      "supplement",
      owner._id,
      "A draft catalogue entry for a licensed supplement partner.",
      "Draft demo listing. Seller licensing, authenticity documentation and product information must be reviewed by an admin before this can be published. No authenticity guarantee is claimed by this prototype.",
      [
        "Seller documents required",
        "Product details reviewed",
        "Availability confirmed by seller",
      ],
      149900,
      "once",
      "Provider confirms",
      "draft",
    ],
  ];
  for (const [
    slug,
    title,
    category,
    providerId,
    summary,
    description,
    features,
    priceMinor,
    billing,
    duration,
    status,
  ] of items)
    await MarketListing.updateOne(
      { slug },
      {
        $setOnInsert: {
          slug,
          title,
          category,
          providerId,
          summary,
          description,
          features,
          priceMinor,
          currency: "INR",
          billing,
          duration,
          status,
          isDemo: true,
        },
      },
      { upsert: true },
    );
  await CoachProfile.updateOne(
    { coachId: coach._id },
    {
      $setOnInsert: {
        coachId: coach._id,
        headline: "Strength and consistency, with a clear plan.",
        bio: "A demo coaching profile for exploring the platform. This workspace supports goal-setting, weekly check-ins, training plans and coach-approved adjustments. Contact and availability are demonstrated through the package enquiry workflow.",
        specialties: ["Strength", "General fitness", "Hybrid"],
        location: "Bengaluru",
        languages: ["English"],
        experienceYears: 4,
        remoteAvailable: true,
        acceptingAthletes: true,
        isPublic: true,
        isDemo: true,
      },
    },
    { upsert: true },
  );
  console.log(
    "Marketplace demo seed ready: 5 published examples; 2 drafts awaiting seller review. Existing listings were preserved.",
  );
} finally {
  await mongoose.disconnect();
}
