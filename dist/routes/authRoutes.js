"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const authController_1 = require("../controllers/authController");
const authMiddleware_1 = require("../middleware/authMiddleware");
const AuthRouter = express_1.default.Router();
// Bootstrap only: creates the first root account when no users exist and a server secret is provided.
AuthRouter.post("/signup", authController_1.signup);
AuthRouter.post("/login", authController_1.login);
AuthRouter.post("/activate/check", authController_1.checkActivation);
AuthRouter.post("/activate", authController_1.activateAccount);
AuthRouter.post("/password-reset/request", authController_1.requestPasswordReset);
AuthRouter.post("/password-reset/complete", authController_1.completePasswordReset);
// Emergency recovery: promotes an existing admin when no root account exists and a server secret is provided.
AuthRouter.post("/bootstrap/promote-super-admin", authController_1.promoteExistingAdmin);
AuthRouter.post("/change-password", authMiddleware_1.authenticateUser, authController_1.changePassword);
AuthRouter.get("/admins", authMiddleware_1.authenticateUser, authMiddleware_1.adminUserManagerOnly, authController_1.listAdmins);
AuthRouter.post("/admins", authMiddleware_1.authenticateUser, authMiddleware_1.adminUserManagerOnly, authController_1.createAdmin);
AuthRouter.patch("/admins/:id", authMiddleware_1.authenticateUser, authMiddleware_1.adminUserManagerOnly, authController_1.updateAdmin);
AuthRouter.post("/admins/:id/reset-password", authMiddleware_1.authenticateUser, authMiddleware_1.adminUserManagerOnly, authController_1.createAdminPasswordReset);
AuthRouter.delete("/admins/:id", authMiddleware_1.authenticateUser, authMiddleware_1.adminUserManagerOnly, authController_1.deleteAdmin);
AuthRouter.post("/verify-token", authController_1.verifyToken);
exports.default = AuthRouter;
