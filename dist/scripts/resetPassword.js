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
const bcrypt_1 = __importDefault(require("bcrypt"));
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
const MONGO_URI = process.env.MONGO_URI ||
    "mongodb+srv://izanyibukayvette:1cRUEABbqhJdWGZD@cluster0.4q2p9.mongodb.net/";
function resetUserPassword() {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            console.log("Connecting to MongoDB...");
            yield mongoose_1.default.connect(MONGO_URI);
            console.log("Connected to MongoDB");
            const userId = "688cbd06f2f7d45fd16da22a";
            const newPassword = "adminpassword123";
            // Hash the new password
            const saltRounds = 10;
            const hashedPassword = yield bcrypt_1.default.hash(newPassword, saltRounds);
            // Update the user's password
            const result = yield User_1.default.findByIdAndUpdate(userId, { password: hashedPassword }, { new: true });
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
            yield mongoose_1.default.disconnect();
            console.log("Disconnected from MongoDB");
        }
    });
}
resetUserPassword();
