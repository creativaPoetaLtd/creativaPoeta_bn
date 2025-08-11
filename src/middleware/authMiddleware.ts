import jwt from "jsonwebtoken";
import { Request, Response, NextFunction } from "express";
import dotenv from "dotenv";
dotenv.config();

const JWT_SECRET = process.env.JWT_SECRET as string;

declare module "express-serve-static-core" {
  interface Request {
    user?: any;
  }
}

// Middleware for authentication
export const authenticateUser = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    res
      .status(401)
      .json({ message: "Access denied. No token provided or invalid header." });
    return;
  }
  const token = authHeader.split(" ")[1];

  if (!token) {
    res.status(401).json({ message: "Access denied. No token provided." });
    return;
  }

  try {
    if (!JWT_SECRET) {
      res
        .status(500)
        .json({ message: "Internal server error. JWT secret is not defined." });
      return;
    }
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded; // Ensure `decoded` contains necessary info
    next();
  } catch (err: any) {
    console.error("Token verification error:", err.message);
    res.status(400).json({ message: "Invalid or expired token." });
  }
};

// Middleware for role-based access (simplified - all users are admins)
export const authorizeRoles = (roles: string[]) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res
        .status(401)
        .json({ message: "Access denied. User not authenticated." });
      return;
    }

    // Since all users are admins, just check if user is authenticated
    // No need to check roles since everyone is admin
    next();
  };
};

// Simplified admin-only middleware (since all users are admins)
export const adminOnly = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  if (!req.user) {
    res
      .status(401)
      .json({ message: "Access denied. Admin authentication required." });
    return;
  }

  // All authenticated users are admins
  next();
};
