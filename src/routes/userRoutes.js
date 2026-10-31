import { Router } from "express";
import {
  completeOnboarding,
  exportMyData,
  exportMyExcel,
  deleteMyAccount,
  setKioskPin,
} from "../controllers/userController.js";
import { verifyJWT } from "../middlewares/authMiddleware.js";
import {
  validateBody,
  onboardingSchema,
  kioskPinSchema,
} from "../validations/schemas.js";

const router = Router();

router.use(verifyJWT);
router
  .route("/onboarding")
  .post(validateBody(onboardingSchema), completeOnboarding);
router.route("/me/export").get(exportMyData);
router.get("/me/export.xlsx", exportMyExcel);
router.route("/me").delete(deleteMyAccount);
router.post("/me/kiosk-pin", validateBody(kioskPinSchema), setKioskPin);

export default router;
