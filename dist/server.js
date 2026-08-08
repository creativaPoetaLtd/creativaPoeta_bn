"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = handler;
const mongoose_1 = __importDefault(require("mongoose"));
const app_1 = __importDefault(require("./app"));
const MONGO_URI = process.env.MONGO_URI || "";
let isConnected = false;
async function connectDB() {
    if (isConnected)
        return;
    if (!MONGO_URI) {
        console.error("MONGO_URI environment variable is required for database-backed endpoints");
        return;
    }
    try {
        const db = await mongoose_1.default.connect(MONGO_URI, {
            serverSelectionTimeoutMS: 30000,
        });
        isConnected = !!db.connection.readyState;
        console.log("Connected to MongoDB");
    }
    catch (err) {
        console.error("Database connection error:", err);
    }
}
async function handler(req, res) {
    const requestPath = String(req.url || "").split("?")[0];
    if (requestPath !== "/api/health/live") {
        await connectDB();
    }
    return (0, app_1.default)(req, res);
}
