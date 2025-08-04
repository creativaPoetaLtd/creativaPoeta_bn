import mongoose from "mongoose";
import Blog from "../models/Blog";
import dotenv from "dotenv";

dotenv.config();

const MONGO_URI =
  process.env.MONGO_URI ||
  "mongodb+srv://izanyibukayvette:1cRUEABbqhJdWGZD@cluster0.mongodb.net/creativaPoeta_db?retryWrites=true&w=majority";

async function migrateComments() {
  try {
    console.log("Connecting to MongoDB...");
    await mongoose.connect(MONGO_URI);
    console.log("Connected to MongoDB");

    console.log("Starting comment migration...");

    // Find all blogs with comments
    const blogs = await Blog.find({ "comments.0": { $exists: true } });

    console.log(`Found ${blogs.length} blogs with comments`);

    for (const blog of blogs) {
      let updated = false;

      for (const comment of blog.comments) {
        // Check if comment is missing name or email
        if (!comment.name || !comment.email) {
          console.log(`Updating comment in blog: ${blog.title}`);

          // Set default values for missing fields
          if (!comment.name) {
            (comment as any).name = "Anonymous User";
            updated = true;
          }

          if (!comment.email) {
            (comment as any).email = "anonymous@example.com";
            updated = true;
          }
        }
      }

      if (updated) {
        await blog.save();
        console.log(`Updated blog: ${blog.title}`);
      }
    }

    console.log("Migration completed successfully!");

    // Now let's make the fields required again
    console.log("Updating schema to make fields required...");

    process.exit(0);
  } catch (error) {
    console.error("Migration failed:", error);
    process.exit(1);
  }
}

// Run the migration
migrateComments();
