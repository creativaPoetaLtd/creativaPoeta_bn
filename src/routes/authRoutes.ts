import express from "express";
import {
  activateAccount,
  changePassword,
  checkActivation,
  completePasswordReset,
  createAdmin,
  createAdminPasswordReset,
  deleteAdmin,
  listAdmins,
  login,
  promoteExistingAdmin,
  requestPasswordReset,
  signup,
  updateAdmin,
  verifyToken,
} from "../controllers/authController";
import { authenticateUser, adminUserManagerOnly } from "../middleware/authMiddleware";

const AuthRouter = express.Router();

// Bootstrap only: creates the first root account when no users exist and a server secret is provided.
AuthRouter.post("/signup", signup);

AuthRouter.post("/login", login);
AuthRouter.post("/activate/check", checkActivation);
AuthRouter.post("/activate", activateAccount);
AuthRouter.post("/password-reset/request", requestPasswordReset);
AuthRouter.post("/password-reset/complete", completePasswordReset);

// Emergency recovery: promotes an existing admin when no root account exists and a server secret is provided.
AuthRouter.post("/bootstrap/promote-super-admin", promoteExistingAdmin);

AuthRouter.post("/change-password", authenticateUser, changePassword);
AuthRouter.get("/admins", authenticateUser, adminUserManagerOnly, listAdmins);
AuthRouter.post("/admins", authenticateUser, adminUserManagerOnly, createAdmin);
AuthRouter.patch("/admins/:id", authenticateUser, adminUserManagerOnly, updateAdmin);
AuthRouter.post("/admins/:id/reset-password", authenticateUser, adminUserManagerOnly, createAdminPasswordReset);
AuthRouter.delete("/admins/:id", authenticateUser, adminUserManagerOnly, deleteAdmin);

AuthRouter.post("/verify-token", verifyToken);

export default AuthRouter;

