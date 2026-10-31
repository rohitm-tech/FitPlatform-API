import { authRateLimiter } from "../middlewares/rateLimitMiddleware.js";
import { Router } from "express";
import {
  validateBody,
  kioskPairSchema,
  kioskLoginSchema,
} from "../validations/schemas.js";
import {
  pairDevice,
  kioskLogin,
  kioskSession,
  endKioskSession,
  requireKioskSessionDevice,
} from "../controllers/gymController.js";
const r = Router();
r.post(
  "/:gymId/pair",
  authRateLimiter,
  validateBody(kioskPairSchema),
  pairDevice,
);
r.post(
  "/:gymId/login",
  authRateLimiter,
  validateBody(kioskLoginSchema),
  kioskLogin,
);
r.get("/session/:sessionId", requireKioskSessionDevice, kioskSession);
r.delete("/session/:sessionId", requireKioskSessionDevice, endKioskSession);
export default r;
