"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const dotenv_1 = __importDefault(require("dotenv"));
const cors_1 = __importDefault(require("cors"));
const routes_1 = __importDefault(require("./routes"));
const errorHandler_1 = __importDefault(require("./middleware/errorHandler"));
const analyticsServerMiddleware_1 = require("./middleware/analyticsServerMiddleware");
dotenv_1.default.config();
const app = (0, express_1.default)();
app.disable("x-powered-by");
app.set("trust proxy", 1);
// Allow all CORS requests - no restrictions
app.use((0, cors_1.default)({
    origin: "*", // Allow all origins
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS", "HEAD"],
    allowedHeaders: "*", // Allow all headers
    credentials: false, // Set to false when using origin: "*"
}));
app.use(analyticsServerMiddleware_1.analyticsServerMiddleware);
app.use((_req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "no-referrer");
    next();
});
app.use(express_1.default.json({ limit: "64kb", strict: true }));
app.get("/", (req, res) => {
    res.setHeader("X-CP-Commit", process.env.VERCEL_GIT_COMMIT_SHA || "local");
    res.send("Creativa Poeta Backend is running ✅");
});
app.use("/api", routes_1.default);
app.use((_req, res) => {
    res.status(404).json({ message: "Route not found." });
});
app.use(errorHandler_1.default);
exports.default = app;
