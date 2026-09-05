import mongoose from "mongoose";
import { assertSafeRuntimeDatabasePrivileges } from "../security/databasePrivileges";

const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGO_URI!, {
      autoIndex: process.env.MONGO_AUTO_INDEX === "true" || process.env.NODE_ENV !== "production",
      serverSelectionTimeoutMS: 15000,
    });
    const enforceSafeRuntimeRole = process.env.MONGO_ENFORCE_SAFE_RUNTIME_ROLE === "true";
    if (enforceSafeRuntimeRole) {
      if (!conn.connection.db) throw new Error("MongoDB connection is not ready for privilege verification.");
      await assertSafeRuntimeDatabasePrivileges(conn.connection.db);
      console.log("MongoDB runtime role verified: destructive privileges are unavailable.");
    } else if (process.env.NODE_ENV === "production") {
      console.warn("MongoDB runtime role enforcement is not enabled. Set MONGO_ENFORCE_SAFE_RUNTIME_ROLE=true after configuring the restricted Atlas user.");
    }
    console.log(`MongoDB Connected: ${conn.connection.host}`);
  } catch (error) {
    console.error(`Error: ${(error as Error).message}`);
    process.exit(1);
  }
};

export default connectDB;
