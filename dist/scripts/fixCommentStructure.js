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
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
const MONGO_URI = process.env.MONGO_URI ||
    "mongodb+srv://izanyibukayvette:1cRUEABbqhJdWGZD@cluster0.mongodb.net/creativaPoeta_db?retryWrites=true&w=majority";
function fixCommentStructure() {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            console.log("Connecting to MongoDB...");
            yield mongoose_1.default.connect(MONGO_URI);
            console.log("Connected to MongoDB");
            const db = mongoose_1.default.connection.db;
            const blogsCollection = db.collection("blogs");
            console.log("Starting direct database comment structure update...");
            // Get all blogs and update them manually
            const blogs = yield blogsCollection
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
                        yield blogsCollection.updateOne({ _id: blog._id }, { $set: { comments: blog.comments } });
                        console.log(`Updated blog: ${blog.title}`);
                    }
                }
            }
            console.log("Database update completed successfully!");
            process.exit(0);
        }
        catch (error) {
            console.error("Database update failed:", error);
            process.exit(1);
        }
    });
}
// Run the update
fixCommentStructure();
