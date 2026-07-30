import jwt from "jsonwebtoken";
import { Request, Response, NextFunction } from "express";
import dotenv from "dotenv";
dotenv.config();

const JWT_SECRET = process.env.JWT_SECRET as string;
const ROOT_ADMIN_EMAILS = (process.env.ROOT_ADMIN_EMAILS || "admin@creativapoeta.com,admin@cp.com")
  .split(",")
  .map((email) => email.trim().toLowerCase())
  .filter(Boolean);

export type AdminRole =
  | "super_admin"
  | "admin_0"
  | "admin_1"
  | "admin_2"
  | "admin_3"
  | "admin_4"
  | "admin_5"
  | "admin"
  | "editor"
  | "viewer";

interface AuthTokenPayload {
  _id: string;
  email: string;
  role: AdminRole;
  isActive?: boolean;
}

const legacyRoleMap: Record<string, AdminRole> = {
  admin: "admin_0",
  editor: "admin_2",
  viewer: "admin_4",
};

export const normalizeAdminRole = (role?: string): AdminRole => {
  if (!role) return "admin_5";
  return legacyRoleMap[role] || (role as AdminRole);
};

export const isRootAdminEmail = (email?: string) =>
  Boolean(email && ROOT_ADMIN_EMAILS.includes(email.trim().toLowerCase()));

export const getEffectiveAdminRole = (role?: string, email?: string): AdminRole => {
  if (isRootAdminEmail(email)) return "super_admin";
  return normalizeAdminRole(role);
};

export const canAccessDashboard = (role?: string, email?: string) =>
  ["super_admin", "admin_0", "admin_1", "admin_2", "admin_3", "admin_4", "admin_5"].includes(
    getEffectiveAdminRole(role, email)
  );

export const canManageAdminUsers = (role?: string, email?: string) =>
  ["super_admin", "admin_0"].includes(getEffectiveAdminRole(role, email));

declare module "express-serve-static-core" {
  interface Request {
    user?: any;
  }
}

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
    const decoded = jwt.verify(token, JWT_SECRET) as AuthTokenPayload;

    if (decoded.isActive === false) {
      res.status(403).json({ message: "Account is disabled." });
      return;
    }

    req.user = { ...decoded, role: getEffectiveAdminRole(decoded.role, decoded.email) };
    next();
  } catch (err: any) {
    console.error("Token verification error:", err.message);
    console.error("Token:", token.substring(0, 50) + "...");
    console.error("JWT_SECRET length:", JWT_SECRET ? JWT_SECRET.length : 0);

    if (err.name === "JsonWebTokenError") {
      res
        .status(401)
        .json({ message: "Invalid token signature. Please log in again." });
    } else if (err.name === "TokenExpiredError") {
      res.status(401).json({ message: "Token expired. Please log in again." });
    } else {
      res.status(400).json({ message: "Invalid or expired token." });
    }
  }
};

export const authorizeRoles = (roles: string[]) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res
        .status(401)
        .json({ message: "Access denied. User not authenticated." });
      return;
    }

    if (!roles.includes(getEffectiveAdminRole(req.user.role, req.user.email))) {
      res.status(403).json({ message: "Access denied. Insufficient role." });
      return;
    }

    next();
  };
};

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

  if (!canAccessDashboard(req.user.role, req.user.email)) {
    res.status(403).json({ message: "Access denied. Admin role required." });
    return;
  }

  next();
};

export const adminUserManagerOnly = (
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

  if (!canManageAdminUsers(req.user.role, req.user.email)) {
    res.status(403).json({ message: "Access denied. User management role required." });
    return;
  }

  next();
};

export const superAdminOnly = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  if (!req.user) {
    res
      .status(401)
      .json({ message: "Access denied. Super admin authentication required." });
    return;
  }

  if (getEffectiveAdminRole(req.user.role, req.user.email) !== "super_admin") {
    res.status(403).json({ message: "Access denied. Super admin role required." });
    return;
  }

  next();
};
