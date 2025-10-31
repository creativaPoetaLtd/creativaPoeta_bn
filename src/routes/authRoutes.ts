import express from "express";
import { login, signup, verifyToken } from "../controllers/authController";

const AuthRouter = express.Router();

// POST: Signup
AuthRouter.post("/signup", signup);

// POST: Login
AuthRouter.post("/login", login);

// POST: Verify Token (for debugging)
AuthRouter.post("/verify-token", verifyToken);

export default AuthRouter;
