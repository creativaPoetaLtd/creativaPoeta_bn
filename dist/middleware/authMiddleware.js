"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.superAdminOnly = exports.adminUserManagerOnly = exports.adminOnly = exports.authorizeRoles = exports.authenticateUser = exports.canManageAdminUsers = exports.canAccessDashboard = exports.getEffectiveAdminRole = exports.isRootAdminEmail = exports.normalizeAdminRole = void 0;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const dotenv_1 = __importDefault(require("dotenv"));
const User_1 = __importDefault(require("../models/User"));
const auditContext_1 = require("./auditContext");
dotenv_1.default.config();
const JWT_SECRET = process.env.JWT_SECRET;
const ROOT_ADMIN_EMAILS = (process.env.ROOT_ADMIN_EMAILS || "admin@creativapoeta.com,admin@cp.com")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
const legacyRoleMap = {
    admin: "admin_0",
    editor: "admin_2",
    viewer: "admin_4",
};
const normalizeAdminRole = (role) => {
    if (!role)
        return "admin_5";
    return legacyRoleMap[role] || role;
};
exports.normalizeAdminRole = normalizeAdminRole;
const isRootAdminEmail = (email) => Boolean(email && ROOT_ADMIN_EMAILS.includes(email.trim().toLowerCase()));
exports.isRootAdminEmail = isRootAdminEmail;
const getEffectiveAdminRole = (role, email) => {
    if ((0, exports.isRootAdminEmail)(email))
        return "super_admin";
    return (0, exports.normalizeAdminRole)(role);
};
exports.getEffectiveAdminRole = getEffectiveAdminRole;
const canAccessDashboard = (role, email) => ["super_admin", "admin_0", "admin_1", "admin_2", "admin_3", "admin_4", "admin_5"].includes((0, exports.getEffectiveAdminRole)(role, email));
exports.canAccessDashboard = canAccessDashboard;
const canManageAdminUsers = (role, email) => ["super_admin", "admin_0"].includes((0, exports.getEffectiveAdminRole)(role, email));
exports.canManageAdminUsers = canManageAdminUsers;
const authenticateUser = async (req, res, next) => {
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
        const decoded = jsonwebtoken_1.default.verify(token, JWT_SECRET);
        const currentUser = await User_1.default.findById(decoded._id)
            .select("name email role isActive accountStatus mfaEnabled authVersion")
            .lean();
        if (!currentUser) {
            res.status(401).json({ message: "Account no longer exists. Please log in again." });
            return;
        }
        if (!currentUser.isActive || currentUser.accountStatus !== "active") {
            res.status(403).json({ message: "Account is disabled." });
            return;
        }
        const effectiveRole = (0, exports.getEffectiveAdminRole)(currentUser.role, currentUser.email);
        if (effectiveRole === "super_admin") {
            if (!currentUser.mfaEnabled) {
                res.status(401).json({
                    code: "MFA_ENROLLMENT_REQUIRED",
                    message: "Multi-factor authentication must be configured.",
                });
                return;
            }
            if (decoded.mfaVerified !== true ||
                decoded.authVersion !== (currentUser.authVersion || 0)) {
                res.status(401).json({
                    code: "MFA_REQUIRED",
                    message: "Multi-factor authentication is required.",
                });
                return;
            }
        }
        req.user = {
            ...decoded,
            _id: String(currentUser._id),
            name: currentUser.name,
            email: currentUser.email,
            role: effectiveRole,
            isActive: currentUser.isActive,
            accountStatus: currentUser.accountStatus,
        };
        (0, auditContext_1.setAuditActor)({ id: req.user._id, email: req.user.email, name: req.user.name, role: req.user.role });
        next();
    }
    catch (err) {
        console.warn("Admin token verification failed:", (err === null || err === void 0 ? void 0 : err.name) || "unknown_error");
        if (err.name === "JsonWebTokenError") {
            res
                .status(401)
                .json({ message: "Invalid token signature. Please log in again." });
        }
        else if (err.name === "TokenExpiredError") {
            res.status(401).json({ message: "Token expired. Please log in again." });
        }
        else {
            res.status(400).json({ message: "Invalid or expired token." });
        }
    }
};
exports.authenticateUser = authenticateUser;
const authorizeRoles = (roles) => {
    return (req, res, next) => {
        if (!req.user) {
            res
                .status(401)
                .json({ message: "Access denied. User not authenticated." });
            return;
        }
        if (!roles.includes((0, exports.getEffectiveAdminRole)(req.user.role, req.user.email))) {
            res.status(403).json({ message: "Access denied. Insufficient role." });
            return;
        }
        next();
    };
};
exports.authorizeRoles = authorizeRoles;
const adminOnly = (req, res, next) => {
    if (!req.user) {
        res
            .status(401)
            .json({ message: "Access denied. Admin authentication required." });
        return;
    }
    if (!(0, exports.canAccessDashboard)(req.user.role, req.user.email)) {
        res.status(403).json({ message: "Access denied. Admin role required." });
        return;
    }
    next();
};
exports.adminOnly = adminOnly;
const adminUserManagerOnly = (req, res, next) => {
    if (!req.user) {
        res
            .status(401)
            .json({ message: "Access denied. Admin authentication required." });
        return;
    }
    if (!(0, exports.canManageAdminUsers)(req.user.role, req.user.email)) {
        res.status(403).json({ message: "Access denied. User management role required." });
        return;
    }
    next();
};
exports.adminUserManagerOnly = adminUserManagerOnly;
const superAdminOnly = (req, res, next) => {
    if (!req.user) {
        res
            .status(401)
            .json({ message: "Access denied. Authorized account required." });
        return;
    }
    if ((0, exports.getEffectiveAdminRole)(req.user.role, req.user.email) !== "super_admin") {
        res.status(403).json({ message: "Access denied. Authorized account required." });
        return;
    }
    next();
};
exports.superAdminOnly = superAdminOnly;
