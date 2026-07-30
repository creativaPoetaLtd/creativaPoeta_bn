import express from "express";
import {
  createAdmin,
  deleteAdmin,
  listAdmins,
  login,
  promoteExistingAdmin,
  signup,
  updateAdmin,
  verifyToken,
} from "../controllers/authController";
import { authenticateUser, adminUserManagerOnly } from "../middleware/authMiddleware";

const AuthRouter = express.Router();

// Bootstrap only: creates the first super admin when no users exist and a server secret is provided.
AuthRouter.post("/signup", signup);

AuthRouter.post("/login", login);

// Emergency recovery: promotes an existing admin when no super admin exists and a server secret is provided.
AuthRouter.post("/bootstrap/promote-super-admin", promoteExistingAdmin);

AuthRouter.get("/admins", authenticateUser, adminUserManagerOnly, listAdmins);
AuthRouter.post("/admins", authenticateUser, adminUserManagerOnly, createAdmin);
AuthRouter.patch("/admins/:id", authenticateUser, adminUserManagerOnly, updateAdmin);
AuthRouter.delete("/admins/:id", authenticateUser, adminUserManagerOnly, deleteAdmin);

AuthRouter.post("/verify-token", verifyToken);

export default AuthRouter;
