import mongoose from "mongoose";
import Blog from "../models/Blog";
import dotenv from "dotenv";

dotenv.config();

const MONGO_URI =
  process.env.MONGO_URI ||
  "mongodb+srv://izanyibukayvette:1cRUEABbqhJdWGZD@cluster0.mongodb.net/creativaPoeta_db?retryWrites=true&w=majority";

async function updateCommentStructure() {
  try {
    console.log("Connecting to MongoDB...");
    await mongoose.connect(MONGO_URI);
    console.log("Connected to MongoDB");

    console.log("Starting comment structure update...");

    // Find all blogs with comments
    const blogs = await Blog.find({ "comments.0": { $exists: true } });

    console.log(`Found ${blogs.length} blogs with comments`);

    for (const blog of blogs) {
      let updated = false;

      // Transform each comment to the new structure
      for (const comment of blog.comments) {
        const commentObj = comment as any;

        // Check if comment has old structure (user field) instead of name/email
        if (commentObj.user && (!commentObj.name || !commentObj.email)) {
          console.log(`Updating comment structure in blog: ${blog.title}`);

          // If user field exists but name/email don't, transform it
          commentObj.name =
            typeof commentObj.user === "string"
              ? commentObj.user
              : "Anonymous User";
          commentObj.email = "anonymous@example.com";

          // Remove old user field
          delete commentObj.user;
          updated = true;
        }
      }

      if (updated) {
        // Save with validation disabled temporarily
        await blog.save({ validateBeforeSave: false });
        console.log(`Updated comment structure for blog: ${blog.title}`);
      }
    }

    console.log("Comment structure update completed successfully!");
    process.exit(0);
  } catch (error) {
    console.error("Migration failed:", error);
    process.exit(1);
  }
}

// Run the migration
updateCommentStructure();
