import { z } from "zod";
import { validateBody } from "../validations/schemas.js";
import { Router } from "express";
import { verifyJWT } from "../middlewares/authMiddleware.js";
import { requireRole } from "../middlewares/roleMiddleware.js";
import {
  gymDashboard,
  listGymPeople,
  updateBranding,
  registerDevice,
  listDevices,
  revokeDevice,
} from "../controllers/gymController.js";
const r = Router();
r.use(verifyJWT, requireRole("gym_owner"));
r.get("/dashboard", gymDashboard);
r.get("/people", listGymPeople);
r.patch(
  "/branding",
  validateBody(
    z.object({
      name: z.string().trim().min(1).max(100),
      logoUrl: z.union([z.string().url(), z.literal("")]).optional(),
    }),
  ),
  updateBranding,
);
r.post(
  "/devices",
  validateBody(z.object({ name: z.string().trim().min(1).max(100) })),
  registerDevice,
);
r.get("/devices", listDevices);
r.delete("/devices/:deviceId", revokeDevice);
export default r;
