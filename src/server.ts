import mongoose from "mongoose";
import app from "./app";

const MONGO_URI = process.env.MONGO_URI || "";

if (!MONGO_URI) {
  throw new Error("MONGO_URI environment variable is required");
}

let isConnected = false;

async function connectDB() {
  if (isConnected) return;

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
  await connectDB();
  return app(req, res);
}
