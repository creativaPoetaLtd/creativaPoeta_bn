import mongoose from "mongoose";
import dotenv from "dotenv";

dotenv.config();

const MONGO_URI =
  process.env.MONGO_URI ||
  "mongodb+srv://izanyibukayvette:1cRUEABbqhJdWGZD@cluster0.mongodb.net/creativaPoeta_db?retryWrites=true&w=majority";

async function fixCommentStructure() {
  try {
    console.log("Connecting to MongoDB...");
    await mongoose.connect(MONGO_URI);
    console.log("Connected to MongoDB");

    const db = mongoose.connection.db!;
    const blogsCollection = db.collection("blogs");

    console.log("Starting direct database comment structure update...");

    // Get all blogs and update them manually
    const blogs = await blogsCollection
      .find({ "comments.0": { $exists: true } })
      .toArray();

    console.log(`Found ${blogs.length} blogs with comments`);

    for (const blog of blogs) {
      if (blog.comments && Array.isArray(blog.comments)) {
        let updated = false;

        for (const comment of blog.comments) {
          // If comment has user field but no name/email, transform it
          if (comment.user && (!comment.name || !comment.email)) {
            comment.name =
              typeof comment.user === "string"
                ? comment.user
                : "Anonymous User";
            comment.email = "anonymous@example.com";
            delete comment.user;
            updated = true;
          }
        }

        if (updated) {
          await blogsCollection.updateOne(
            { _id: blog._id },
            { $set: { comments: blog.comments } }
          );
          console.log(`Updated blog: ${blog.title}`);
        }
      }
    }

    console.log("Database update completed successfully!");
    process.exit(0);
  } catch (error) {
    console.error("Database update failed:", error);
    process.exit(1);
  }
}

// Run the update
fixCommentStructure();
