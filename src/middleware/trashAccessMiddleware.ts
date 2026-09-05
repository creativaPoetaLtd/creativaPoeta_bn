import { NextFunction, Request, Response } from "express";
import User from "../models/User";
import { getEffectiveAdminRole } from "./authMiddleware";

export const TRASH_MANAGE_PERMISSION = "trash:manage";

export const trashManagerOnly = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (!req.user) {
      res.status(404).json({ message: "Not found." });
      return;
    }

    if (getEffectiveAdminRole(req.user.role, req.user.email) === "super_admin") {
      next();
      return;
    }

    const user = await User.findById(req.user._id).select("permissionsAllow permissionsDeny isActive accountStatus");
    const allowed = Boolean(
      user &&
      user.isActive &&
      user.accountStatus !== "disabled" &&
      (user.permissionsAllow || []).includes(TRASH_MANAGE_PERMISSION) &&
      !(user.permissionsDeny || []).includes(TRASH_MANAGE_PERMISSION)
    );

    if (!allowed) {
      res.status(404).json({ message: "Not found." });
      return;
    }

    next();
  } catch {
    res.status(404).json({ message: "Not found." });
  }
};
