import { Router } from "express";

import { z } from "zod";

import { User } from "../../models/userModel.js";

import { Gym } from "../../models/gymModel.js";

import { verifyJWT } from "../../middlewares/authMiddleware.js";

import { requireRole } from "../../middlewares/roleMiddleware.js";

import { validateBody } from "../../validations/schemas.js";

import { asyncHandler } from "../../utils/asyncHandler.js";

import { ApiResponse } from "../../utils/apiResponse.js";

import { ApiError } from "../../utils/apiError.js";

const router = Router();

router.use(verifyJWT, requireRole("admin"));

router.get(
  "/users",
  asyncHandler(async (req, res) =>
    res.json(
      new ApiResponse(
        200,
        await User.find()
          .select("name email roles gymId createdAt")
          .sort({ createdAt: -1 }),
        "Users fetched",
      ),
    ),
  ),
);

router.get(
  "/gyms",
  asyncHandler(async (req, res) =>
    res.json(
      new ApiResponse(
        200,
        await Gym.find()
          .select("name address ownerId")
          .populate("ownerId", "name email"),
        "Gyms fetched",
      ),
    ),
  ),
);

router.patch(
  "/users/:id/roles",
  validateBody(
    z.object({
      roles: z.array(z.enum(["athlete", "coach", "gym_owner", "admin"])).min(1),
      gymName: z.string().trim().min(1).max(100).optional(),
    }),
  ),
  asyncHandler(async (req, res) => {
    if (!/^[a-f0-9]{24}$/i.test(req.params.id))
      throw new ApiError(400, "Invalid user ID");

    const user = await User.findById(req.params.id);
    if (!user) throw new ApiError(404, "User not found");

    if (user.roles.includes("admin") && !req.body.roles.includes("admin"))
      throw new ApiError(400, "Admin access cannot be removed here");

    if (
      req.body.roles.includes("gym_owner") &&
      !user.roles.includes("gym_owner")
    ) {
      const gym =
        (await Gym.findOne({ ownerId: user._id })) ||
        (await Gym.create({
          name: req.body.gymName || `${user.name}'s gym`,
          ownerId: user._id,
        }));
      user.gymId = gym._id;
    }

    user.roles = [...new Set(req.body.roles)];
    await user.save();

    res.json(
      new ApiResponse(
        200,
        { _id: user._id, roles: user.roles },
        "Access updated",
      ),
    );
  }),
);

export default router;
