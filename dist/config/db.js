"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const mongoose_1 = __importDefault(require("mongoose"));
const databasePrivileges_1 = require("../security/databasePrivileges");
const connectDB = async () => {
    try {
        const conn = await mongoose_1.default.connect(process.env.MONGO_URI, {
            autoIndex: process.env.MONGO_AUTO_INDEX === "true" || process.env.NODE_ENV !== "production",
            serverSelectionTimeoutMS: 15000,
        });
        const enforceSafeRuntimeRole = process.env.MONGO_ENFORCE_SAFE_RUNTIME_ROLE === "true";
        if (enforceSafeRuntimeRole) {
            if (!conn.connection.db)
                throw new Error("MongoDB connection is not ready for privilege verification.");
            await (0, databasePrivileges_1.assertSafeRuntimeDatabasePrivileges)(conn.connection.db);
            console.log("MongoDB runtime role verified: destructive privileges are unavailable.");
        }
        else if (process.env.NODE_ENV === "production") {
            console.warn("MongoDB runtime role enforcement is not enabled. Set MONGO_ENFORCE_SAFE_RUNTIME_ROLE=true after configuring the restricted Atlas user.");
        }
        console.log(`MongoDB Connected: ${conn.connection.host}`);
    }
    catch (error) {
        console.error(`Error: ${error.message}`);
        process.exit(1);
    }
};
exports.default = connectDB;
