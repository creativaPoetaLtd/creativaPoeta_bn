"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const dotenv_1 = __importDefault(require("dotenv"));
const cors_1 = __importDefault(require("cors"));
const routes_1 = __importDefault(require("./routes"));
dotenv_1.default.config();
const app = (0, express_1.default)();
// Allow all CORS requests - no restrictions
app.use((0, cors_1.default)({
    origin: "*", // Allow all origins
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS", "HEAD"],
    allowedHeaders: "*", // Allow all headers
    credentials: false, // Set to false when using origin: "*"
}));
app.use(express_1.default.json());
app.get("/", (req, res) => {
    res.send("Creativa Poeta Backend is running ✅");
});
app.use("/api", routes_1.default);
exports.default = app;
