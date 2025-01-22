import express from "express";
import { login, signup } from "../controllers/authController";

const AuthRouter = express.Router();

// POST: Signup
AuthRouter.post("/signup", signup);

// POST: Login
AuthRouter.post("/login", login);

export default AuthRouter;
