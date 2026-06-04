import mongoose from "mongoose";
import User from "../models/User";
import dotenv from "dotenv";

dotenv.config();

const MONGO_URI = process.env.MONGO_URI || "";

if (!MONGO_URI) {
  throw new Error("MONGO_URI environment variable is required");
}

async function updateAllUsersToAdmin() {
  try {
    console.log("Connecting to MongoDB...");
    await mongoose.connect(MONGO_URI);
    console.log("Connected to MongoDB");

    console.log("Updating all users to admin role...");

    // Update all users to have admin role
    const result = await User.updateMany(
      {}, // Empty filter to match all users
      { $set: { role: "admin" } }
    );

    console.log(`✅ Updated ${result.modifiedCount} users to admin role`);

    // Show all users after update
    const users = await User.find({}, "name email role");
    console.log("\n📋 Current users in database:");
    users.forEach((user, index) => {
      console.log(
        `${index + 1}. ${user.name} (${user.email}) - Role: ${user.role}`
      );
    });

    console.log(`\n🎉 Total users: ${users.length}`);
    console.log("✅ All users are now admins!");

    process.exit(0);
  } catch (error) {
    console.error("❌ Failed to update users:", error);
    process.exit(1);
  }
}

// Run the update
updateAllUsersToAdmin();
