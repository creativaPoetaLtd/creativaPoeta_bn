import jwt from "jsonwebtoken";
import { Request, Response, NextFunction } from "express";

const JWT_SECRET = process.env.JWT_SECRET || "your_jwt_secret";

declare module "express-serve-static-core" {
  interface Request {
    user?: any;
  }
}

// Middleware for authentication
export const authenticateUser = (req: Request, res: Response, next: NextFunction): void => {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    res.status(401).json({ message: "Access denied. No token provided." });
    return;
  }

  const token = authHeader.split(" ")[1];
  if (!token) {
    res.status(401).json({ message: "Access denied. No token provided." });
    return;
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as { id: string; [key: string]: any };
    req.user = { _id: decoded.id, ...decoded };
    next();
  } catch (err) {
    res.status(400).json({ message: "Invalid or expired token." });
    return;
  }
};

// Middleware for role-based access
export const authorizeRoles = (roles: string[]) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    const user = req.user;
    if (!user) {
      res.status(401).json({ message: "Access denied. User not authenticated." });
      return;
    }

    if (!roles.includes(user.role)) {
      res.status(403).json({ message: "Access denied. You do not have the required role." });
      return;
    }

    next();
  };
};