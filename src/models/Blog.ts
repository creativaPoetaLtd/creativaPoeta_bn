import mongoose, { Schema, Document } from "mongoose";

export interface IBlog extends Document {
  title: string;
  content: string;
  author: mongoose.Types.ObjectId; // Reference to User model
  likes: number;
  comments: { user: string; comment: string; createdAt: Date }[];
  createdAt: Date;
}

const BlogSchema: Schema = new Schema(
  {
    title: { type: String, required: true },
    content: { type: String, required: true },
    author: { type: Schema.Types.ObjectId, ref: "User", required: true }, // Reference to User model
    likes: { type: Number, default: 0 },
    comments: [
      {
        user: { type: String, required: false },
        comment: { type: String, required: false },
        createdAt: { type: Date, default: Date.now },
      },
    ],
  },
  { timestamps: true }
);

export default mongoose.model<IBlog>("Blog", BlogSchema);
