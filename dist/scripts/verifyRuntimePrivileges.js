"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const dotenv_1 = __importDefault(require("dotenv"));
const mongoose_1 = __importDefault(require("mongoose"));
const databasePrivileges_1 = require("../security/databasePrivileges");
dotenv_1.default.config();
const main = async () => {
    const uri = String(process.env.MONGO_URI || "").trim();
    if (!uri)
        throw new Error("MONGO_URI is required.");
    const connection = await mongoose_1.default.createConnection(uri, {
        autoIndex: false,
        serverSelectionTimeoutMS: 15000,
    }).asPromise();
    try {
        if (!connection.db)
            throw new Error("MongoDB connection is not ready.");
        const report = await (0, databasePrivileges_1.assertSafeRuntimeDatabasePrivileges)(connection.db);
        console.log(`MongoDB runtime role verified: ${report.privilegeCount} privilege scope(s), no destructive actions.`);
    }
    finally {
        await connection.close();
    }
};
main().catch((error) => {
    console.error(error instanceof Error ? error.message : "MongoDB runtime privilege verification failed.");
    process.exit(1);
});
