"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const mongoose_1 = __importDefault(require("mongoose"));
const User_1 = __importDefault(require("../models/User"));
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
const MONGO_URI = process.env.MONGO_URI ||
    "mongodb+srv://izanyibukayvette:1cRUEABbqhJdWGZD@cluster0.4q2p9.mongodb.net/";
function listAllUsers() {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            console.log("Connecting to MongoDB...");
            yield mongoose_1.default.connect(MONGO_URI);
            console.log("Connected to MongoDB");
            // Find all users
            const users = yield User_1.default.find({}, "name email role _id");
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
            yield mongoose_1.default.disconnect();
            console.log("Disconnected from MongoDB");
        }
    });
}
listAllUsers();
