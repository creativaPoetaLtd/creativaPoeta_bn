import mongoose, { Schema, Document } from "mongoose";

interface IComment {
  user: mongoose.Types.ObjectId;
  text: string;
  createdAt: Date;
}
export interface IBlog extends Document {
  title: string;
  content: string;
  author?: mongoose.Types.ObjectId; // Reference to User model
  image: string; // New field for storing the image URL
  likes: mongoose.Types.ObjectId[]; // Array of user IDs who liked the blog
  comments: IComment[];
  createdAt: Date;
}

const CommentSchema = new Schema<IComment>({
  user: { type: Schema.Types.ObjectId, ref: "User", required: true },
  text: { type: String, required: true },
  createdAt: { type: Date, default: Date.now },
});


const BlogSchema: Schema = new Schema(
  {
    title: { type: String, required: true },
    content: { type: String, required: true },
    author: { type: Schema.Types.ObjectId, ref: "User", required: true }, // Reference to User model
    image: { type: String }, // Add this field
    likes: { type: [mongoose.Types.ObjectId], default: [] }, // Initialize likes as an empty array
    comments: [CommentSchema], // Embedded comments
  },
  { timestamps: true }
);

export default mongoose.model<IBlog>("Blog", BlogSchema);