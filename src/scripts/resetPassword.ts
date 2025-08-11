import mongoose from "mongoose";
import User from "../models/User";
import bcrypt from "bcrypt";
import dotenv from "dotenv";

dotenv.config();

const MONGO_URI =
  process.env.MONGO_URI ||
  "mongodb+srv://izanyibukayvette:1cRUEABbqhJdWGZD@cluster0.4q2p9.mongodb.net/";

async function resetUserPassword() {
  try {
    console.log("Connecting to MongoDB...");
    await mongoose.connect(MONGO_URI);
    console.log("Connected to MongoDB");

    const userId = "688cbd06f2f7d45fd16da22a";
    const newPassword = "adminpassword123";

    // Hash the new password
    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(newPassword, saltRounds);

    // Update the user's password
    const result = await User.findByIdAndUpdate(
      userId,
      { password: hashedPassword },
      { new: true }
    );

    if (result) {
      console.log(`✅ Password updated for user: ${result.email}`);
      console.log(`New password: ${newPassword}`);
    } else {
      console.log("❌ User not found");
    }
  } catch (error) {
    console.error("❌ Error:", error);
  } finally {
    await mongoose.disconnect();
    console.log("Disconnected from MongoDB");
  }
}

resetUserPassword();
