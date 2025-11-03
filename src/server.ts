import mongoose from "mongoose";
import app from "./app";

const MONGO_URI =
  process.env.MONGO_URI ||
  "mongodb+srv://izanyibukayvette:1cRUEABbqhJdWGZD@cluster0.mongodb.net/creativaPoeta_db?retryWrites=true&w=majority";

let isConnected = false;

async function connectDB() {
  if (isConnected) return;

  try {
    const db = await mongoose.connect(MONGO_URI, {
      serverSelectionTimeoutMS: 30000,
    });
    isConnected = !!db.connection.readyState;
    console.log("✅ Connected to MongoDB");
  } catch (err) {
    console.error("❌ Database connection error:", err);
  }
}

// This makes it compatible with Vercel's serverless functions
export default async function handler(req: any, res: any) {
  await connectDB();
  return app(req, res);
}
