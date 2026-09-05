import mongoose from "mongoose";
import dotenv from "dotenv";
import ProjectDescription from "../models/ProjectDescription";

dotenv.config();

const connectDB = async () => {
  const uri = String(process.env.MONGO_MIGRATION_URI || "").trim();
  if (!uri) throw new Error("MONGO_MIGRATION_URI is required. The runtime database account must not perform maintenance operations.");
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 15000 });
  console.log("Connected with the isolated migration credential.");
};

const cleanOldProjectRequests = async () => {
  try {
    await connectDB();
    const outdatedFilter = {
      isDeleted: { $ne: true },
      $or: [
        { serviceType: { $exists: false } },
        { serviceType: null },
        { serviceType: "" },
        { selectedServices: { $exists: false } },
        { selectedServices: { $size: 0 } },
      ],
    };
    const oldRequests = await ProjectDescription.find(outdatedFilter).select("_id name email createdAt serviceType selectedServices").lean();
    console.log(`Found ${oldRequests.length} outdated project request(s).`);

    for (const [index, request] of oldRequests.entries()) {
      console.log(`${index + 1}. ${request._id} - ${request.name || request.email || "Unnamed"}`);
    }

    if (oldRequests.length > 0) {
      const archiveResult = await ProjectDescription.updateMany(
        { _id: { $in: oldRequests.map((request) => request._id) } },
        { $set: {
          isDeleted: true,
          deletedAt: new Date(),
          deletedByEmail: "system@creativapoeta.com",
          deletedByName: "Maintenance script",
          deleteReason: "Outdated project request structure",
        } }
      );
      console.log(`Successfully archived ${archiveResult.modifiedCount} project request(s).`);
    }

    const remaining = await ProjectDescription.countDocuments({});
    console.log(`Remaining active project requests: ${remaining}`);
  } catch (error) {
    console.error("Project request maintenance failed:", error);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
  }
};

void cleanOldProjectRequests();
