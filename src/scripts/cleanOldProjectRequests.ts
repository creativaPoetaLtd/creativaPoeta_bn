import mongoose from "mongoose";
import dotenv from "dotenv";
import ProjectDescription from "../models/ProjectDescription";

// Load environment variables
dotenv.config();

// Connect to MongoDB
const connectDB = async () => {
  try {
    await mongoose.connect(
      process.env.MONGO_URI || "mongodb://localhost:27017/creativapoeta"
    );
    console.log("Connected to MongoDB");
  } catch (error) {
    console.error("Error connecting to MongoDB:", error);
    process.exit(1);
  }
};

const cleanOldProjectRequests = async () => {
  try {
    await connectDB();

    // Find all project requests
    const allRequests = await ProjectDescription.find({});
    console.log(`Found ${allRequests.length} total project requests`);

    // Identify old requests (those without serviceType and selectedServices)
    const oldRequests = allRequests.filter(
      (request) =>
        !request.serviceType ||
        !request.selectedServices ||
        Array.isArray(request.selectedServices) === false ||
        request.selectedServices.length === 0
    );

    console.log(
      `Found ${oldRequests.length} old project requests with outdated structure`
    );

    if (oldRequests.length > 0) {
      console.log("\nOld requests to be deleted:");
      oldRequests.forEach((request, index) => {
        console.log(`${index + 1}. ID: ${request._id}`);
        console.log(`   Name: ${request.name}`);
        console.log(`   Email: ${request.email}`);
        console.log(`   Created: ${request.createdAt}`);
        console.log(`   Has serviceType: ${!!request.serviceType}`);
        console.log(`   Has selectedServices: ${!!request.selectedServices}`);
        console.log(`   ---`);
      });

      // Delete old requests
      const deleteResult = await ProjectDescription.deleteMany({
        _id: { $in: oldRequests.map((req) => req._id) },
      });

      console.log(
        `\n✅ Successfully deleted ${deleteResult.deletedCount} old project requests`
      );
    } else {
      console.log(
        "✅ No old project requests found. All requests have the new structure."
      );
    }

    // Show remaining requests with new structure
    const remainingRequests = await ProjectDescription.find({});
    console.log(`\n📊 Remaining project requests: ${remainingRequests.length}`);

    if (remainingRequests.length > 0) {
      console.log("\nRemaining requests (new structure):");
      remainingRequests.forEach((request, index) => {
        console.log(`${index + 1}. ${request.name} - ${request.serviceType}`);
        console.log(
          `   Services: ${request.selectedServices?.length || 0} selected`
        );
      });
    }
  } catch (error) {
    console.error("Error cleaning old project requests:", error);
  } finally {
    await mongoose.connection.close();
    console.log("\nDatabase connection closed");
    process.exit(0);
  }
};

// Run the script
cleanOldProjectRequests();
