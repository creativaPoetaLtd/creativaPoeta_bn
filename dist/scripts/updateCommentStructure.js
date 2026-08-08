"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const mongoose_1 = __importDefault(require("mongoose"));
const Blog_1 = __importDefault(require("../models/Blog"));
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
const MONGO_URI = process.env.MONGO_URI || "";
if (!MONGO_URI) {
    throw new Error("MONGO_URI environment variable is required");
}
async function updateCommentStructure() {
    try {
        console.log("Connecting to MongoDB...");
        await mongoose_1.default.connect(MONGO_URI);
        console.log("Connected to MongoDB");
        console.log("Starting comment structure update...");
        // Find all blogs with comments
        const blogs = await Blog_1.default.find({ "comments.0": { $exists: true } });
        console.log(`Found ${blogs.length} blogs with comments`);
        for (const blog of blogs) {
            let updated = false;
            // Transform each comment to the new structure
            for (const comment of blog.comments) {
                const commentObj = comment;
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
    }
    catch (error) {
        console.error("Migration failed:", error);
        process.exit(1);
    }
}
// Run the migration
updateCommentStructure();
