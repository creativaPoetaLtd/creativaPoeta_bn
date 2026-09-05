"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.trashManagerOnly = exports.TRASH_MANAGE_PERMISSION = void 0;
const User_1 = __importDefault(require("../models/User"));
const authMiddleware_1 = require("./authMiddleware");
exports.TRASH_MANAGE_PERMISSION = "trash:manage";
const trashManagerOnly = async (req, res, next) => {
    try {
        if (!req.user) {
            res.status(404).json({ message: "Not found." });
            return;
        }
        if ((0, authMiddleware_1.getEffectiveAdminRole)(req.user.role, req.user.email) === "super_admin") {
            next();
            return;
        }
        const user = await User_1.default.findById(req.user._id).select("permissionsAllow permissionsDeny isActive accountStatus");
        const allowed = Boolean(user &&
            user.isActive &&
            user.accountStatus !== "disabled" &&
            (user.permissionsAllow || []).includes(exports.TRASH_MANAGE_PERMISSION) &&
            !(user.permissionsDeny || []).includes(exports.TRASH_MANAGE_PERMISSION));
        if (!allowed) {
            res.status(404).json({ message: "Not found." });
            return;
        }
        next();
    }
    catch {
        res.status(404).json({ message: "Not found." });
    }
};
exports.trashManagerOnly = trashManagerOnly;
