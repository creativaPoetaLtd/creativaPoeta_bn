"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const app_1 = __importDefault(require("./app")); // Import the app from app.ts
const mongoose_1 = __importDefault(require("mongoose"));
const PORT = process.env.PORT || 5000;
const MONGO_URI = process.env.MONGO_URI || "mongodb+srv://izanyibukayvette:1cRUEABbqhJdWGZD@cluster0.mongodb.net/creativaPoeta_db?retryWrites=true&w=majority";
// Database connection
mongoose_1.default
    .connect(MONGO_URI, {
    serverSelectionTimeoutMS: 30000, // Increase timeout to 30 seconds
})
    .then(() => console.log("Connected to MongoDB"))
    .catch((err) => console.error("Database connection error:", err));
// Start the server
app_1.default.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});
