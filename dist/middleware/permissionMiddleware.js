"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.authorizeAdminPermission = void 0;
const User_1 = __importDefault(require("../models/User"));
const authMiddleware_1 = require("./authMiddleware");
const authorizeAdminPermission = (permission, defaultRoles = []) => {
    return async (req, res, next) => {
        var _a;
        try {
            if (!((_a = req.user) === null || _a === void 0 ? void 0 : _a._id)) {
                res.status(401).json({ message: "Access denied. Authentication required." });
                return;
            }
            const role = (0, authMiddleware_1.getEffectiveAdminRole)(req.user.role, req.user.email);
            if (["super_admin", "admin_0"].includes(role)) {
                next();
                return;
            }
            const user = await User_1.default.findById(req.user._id)
                .select("permissionsAllow permissionsDeny role email isActive")
                .lean();
            if (!user || user.isActive === false) {
                res.status(403).json({ message: "Access denied. Account unavailable." });
                return;
            }
            const effectiveRole = (0, authMiddleware_1.getEffectiveAdminRole)(user.role, user.email);
            const denied = (user.permissionsDeny || []).includes(permission);
            const explicitlyAllowed = (user.permissionsAllow || []).includes(permission);
            const allowedByRole = defaultRoles.includes(effectiveRole);
            if (denied || (!explicitlyAllowed && !allowedByRole)) {
                res.status(403).json({ message: "Access denied. Missing permission." });
                return;
            }
            next();
        }
        catch (error) {
            res.status(500).json({ message: "Unable to verify access permission." });
        }
    };
};
exports.authorizeAdminPermission = authorizeAdminPermission;
