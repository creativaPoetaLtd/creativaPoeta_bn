import dotenv from "dotenv";
import mongoose from "mongoose";
import { assertSafeRuntimeDatabasePrivileges } from "../security/databasePrivileges";

dotenv.config();

const main = async () => {
  const uri = String(process.env.MONGO_URI || "").trim();
  if (!uri) throw new Error("MONGO_URI is required.");

  const connection = await mongoose.createConnection(uri, {
    autoIndex: false,
    serverSelectionTimeoutMS: 15_000,
  }).asPromise();
  try {
    if (!connection.db) throw new Error("MongoDB connection is not ready.");
    const report = await assertSafeRuntimeDatabasePrivileges(connection.db);
    console.log(`MongoDB runtime role verified: ${report.privilegeCount} privilege scope(s), no destructive actions.`);
  } finally {
    await connection.close();
  }
};

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "MongoDB runtime privilege verification failed.");
  process.exit(1);
});
