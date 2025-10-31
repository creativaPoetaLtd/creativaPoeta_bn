"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const mongoose_1 = __importDefault(require("mongoose"));
const Blog_1 = __importDefault(require("../models/Blog"));
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
const MONGO_URI = process.env.MONGO_URI ||
    "mongodb+srv://izanyibukayvette:1cRUEABbqhJdWGZD@cluster0.mongodb.net/creativaPoeta_db?retryWrites=true&w=majority";
function updateCommentStructure() {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            console.log("Connecting to MongoDB...");
            yield mongoose_1.default.connect(MONGO_URI);
            console.log("Connected to MongoDB");
            console.log("Starting comment structure update...");
            // Find all blogs with comments
            const blogs = yield Blog_1.default.find({ "comments.0": { $exists: true } });
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
                    yield blog.save({ validateBeforeSave: false });
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
    });
}
// Run the migration
updateCommentStructure();
