"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const mongoose_1 = __importDefault(require("mongoose"));
const User_1 = __importDefault(require("../models/User"));
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
const MONGO_URI = process.env.MONGO_URI || "";
if (!MONGO_URI) {
    throw new Error("MONGO_URI environment variable is required");
}
async function listAllUsers() {
    try {
        console.log("Connecting to MongoDB...");
        await mongoose_1.default.connect(MONGO_URI);
        console.log("Connected to MongoDB");
        // Find all users
        const users = await User_1.default.find({}, "name email role _id");
        console.log("\n📋 All users in database:");
        users.forEach((user, index) => {
            console.log(`${index + 1}. ID: ${user._id}`);
            console.log(`   Name: ${user.name}`);
            console.log(`   Email: ${user.email}`);
            console.log(`   Role: ${user.role}\n`);
        });
        console.log(`Total users: ${users.length}`);
    }
    catch (error) {
        console.error("❌ Error:", error);
    }
    finally {
        await mongoose_1.default.disconnect();
        console.log("Disconnected from MongoDB");
    }
}
listAllUsers();
