"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.authorizeRoles = exports.authenticateUser = void 0;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
const JWT_SECRET = process.env.JWT_SECRET;
// Middleware for authentication
const authenticateUser = (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
        res.status(401).json({ message: "Access denied. No token provided or invalid header." });
        return;
    }
    const token = authHeader.split(" ")[1];
    if (!token) {
        res.status(401).json({ message: "Access denied. No token provided." });
        return;
    }
    try {
        if (!JWT_SECRET) {
            res.status(500).json({ message: "Internal server error. JWT secret is not defined." });
            return;
        }
        const decoded = jsonwebtoken_1.default.verify(token, JWT_SECRET);
        req.user = decoded; // Ensure `decoded` contains necessary info
        next();
    }
    catch (err) {
        console.error("Token verification error:", err.message);
        res.status(400).json({ message: "Invalid or expired token." });
    }
};
exports.authenticateUser = authenticateUser;
// Middleware for role-based access
const authorizeRoles = (roles) => {
    return (req, res, next) => {
        if (!req.user || !req.user.role) {
            res.status(401).json({ message: "Access denied. User not authenticated or role missing." });
            return;
        }
        if (!roles.includes(req.user.role)) {
            res.status(403).json({ message: "Access denied. You do not have the required role." });
            return;
        }
        next();
    };
};
exports.authorizeRoles = authorizeRoles;
