import { ApiError } from '../utils/apiError.js';

// requireRole must run after verifyJWT. A user can hold several roles
// (e.g. coach + athlete), so this checks for overlap, not equality.
// Every router file under routes/admin/ (and other role-gated areas) calls
// router.use(verifyJWT, requireRole('admin')) at the top, before any route
// definitions, so enforcement can't be forgotten on a per-route basis.
export const requireRole = (...roles) => (req, res, next) => {
  if (!req.user) {
    throw new ApiError(401, 'Unauthorized request - No user context');
  }
  const hasRole = req.user.roles?.some((role) => roles.includes(role));
  if (!hasRole) {
    throw new ApiError(403, 'Forbidden - insufficient permissions');
  }
  next();
};
