"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const mongoose_1 = __importDefault(require("mongoose"));
const User_1 = __importDefault(require("../models/User"));
const bcrypt_1 = __importDefault(require("bcrypt"));
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
const MONGO_URI = process.env.MONGO_URI || "";
if (!MONGO_URI) {
    throw new Error("MONGO_URI environment variable is required");
}
async function resetUserPassword() {
    try {
        console.log("Connecting to MongoDB...");
        await mongoose_1.default.connect(MONGO_URI);
        console.log("Connected to MongoDB");
        const userId = "688cbd06f2f7d45fd16da22a";
        const newPassword = "adminpassword123";
        // Hash the new password
        const saltRounds = 10;
        const hashedPassword = await bcrypt_1.default.hash(newPassword, saltRounds);
        // Update the user's password
        const result = await User_1.default.findByIdAndUpdate(userId, { password: hashedPassword }, { new: true });
        if (result) {
            console.log(`✅ Password updated for user: ${result.email}`);
            console.log(`New password: ${newPassword}`);
        }
        else {
            console.log("❌ User not found");
        }
    }
    catch (error) {
        console.error("❌ Error:", error);
    }
    finally {
        await mongoose_1.default.disconnect();
        console.log("Disconnected from MongoDB");
    }
}
resetUserPassword();
