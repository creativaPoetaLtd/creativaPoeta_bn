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
  startMfaSetup,
  confirmMfaSetup,
  verifyMfaLogin,
  promoteExistingAdmin,
  requestPasswordReset,
  setAdminTrashAccess,
  signup,
  updateAdmin,
  verifyToken,
} from "../controllers/authController";
import { authenticateUser, adminUserManagerOnly, superAdminOnly } from "../middleware/authMiddleware";

const AuthRouter = express.Router();

// Authentication responses can contain short-lived MFA challenges, QR codes or
// recovery codes. They must never be stored by a browser, proxy or CDN cache.
AuthRouter.use((_req, res, next) => {
  res.setHeader("Cache-Control", "no-store, private");
  res.setHeader("Pragma", "no-cache");
  next();
});

// Bootstrap only: creates the first root account when no users exist and a server secret is provided.
AuthRouter.post("/signup", signup);

AuthRouter.post("/login", login);
AuthRouter.post("/mfa/setup", startMfaSetup);
AuthRouter.post("/mfa/setup/confirm", confirmMfaSetup);
AuthRouter.post("/mfa/verify", verifyMfaLogin);
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
AuthRouter.patch("/admins/:id/trash-access", authenticateUser, superAdminOnly, setAdminTrashAccess);
AuthRouter.delete("/admins/:id", authenticateUser, adminUserManagerOnly, deleteAdmin);

AuthRouter.post("/verify-token", authenticateUser, verifyToken);

export default AuthRouter;

