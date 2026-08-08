import { NextFunction, Request, Response } from "express";
import User from "../models/User";
import { getEffectiveAdminRole } from "./authMiddleware";

export const authorizeAdminPermission = (
  permission: string,
  defaultRoles: string[] = []
) => {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user?._id) {
        res.status(401).json({ message: "Access denied. Authentication required." });
        return;
      }

      const role = getEffectiveAdminRole(req.user.role, req.user.email);
      if (["super_admin", "admin_0"].includes(role)) {
        next();
        return;
      }

      const user = await User.findById(req.user._id)
        .select("permissionsAllow permissionsDeny role email isActive")
        .lean();

      if (!user || user.isActive === false) {
        res.status(403).json({ message: "Access denied. Account unavailable." });
        return;
      }

      const effectiveRole = getEffectiveAdminRole(user.role, user.email);
      const denied = (user.permissionsDeny || []).includes(permission);
      const explicitlyAllowed = (user.permissionsAllow || []).includes(permission);
      const allowedByRole = defaultRoles.includes(effectiveRole);

      if (denied || (!explicitlyAllowed && !allowedByRole)) {
        res.status(403).json({ message: "Access denied. Missing permission." });
        return;
      }

      next();
    } catch (error) {
      res.status(500).json({ message: "Unable to verify access permission." });
    }
  };
};
