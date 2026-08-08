import mongoose from "mongoose";
import app from "./app";

const MONGO_URI = process.env.MONGO_URI || "";

let isConnected = false;

async function connectDB() {
  if (isConnected) return;
  if (!MONGO_URI) {
    console.error("MONGO_URI environment variable is required for database-backed endpoints");
    return;
  }

  try {
    const db = await mongoose.connect(MONGO_URI, {
      serverSelectionTimeoutMS: 30000,
    });
    isConnected = !!db.connection.readyState;
    console.log("Connected to MongoDB");
  } catch (err) {
    console.error("Database connection error:", err);
  }
}

export default async function handler(req: any, res: any) {
  const requestPath = String(req.url || "").split("?")[0];
  if (requestPath !== "/api/health/live") {
    await connectDB();
  }
  return app(req, res);
}
