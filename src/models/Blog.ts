import mongoose, { Schema, Document } from "mongoose";

interface IComment {
  _id?: mongoose.Types.ObjectId; // Add _id field
  name: string; // Commenter's name
  email: string; // Commenter's email
  text: string; // Comment text
  createdAt: Date;
}
export interface IBlog extends Document {
  title: string;
  content: string;
  author: mongoose.Types.ObjectId; // Reference to User model
  image: string; // New field for storing the image URL
  comments: IComment[];
  createdAt: Date;
}

const CommentSchema = new Schema<IComment>(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      minlength: 2,
      maxlength: 100,
    }, // Commenter's name
    email: { type: String, required: true, trim: true, lowercase: true }, // Commenter's email
    text: {
      type: String,
      required: true,
      trim: true,
      minlength: 5,
      maxlength: 1000,
    }, // Comment text
    createdAt: { type: Date, default: Date.now },
  },
  { _id: true }
); // Ensure each comment gets an _id

const BlogSchema: Schema = new Schema(
  {
    title: { type: String, required: true },
    content: { type: String, required: true },
    author: { type: Schema.Types.ObjectId, ref: "User", required: true }, // Reference to User model
    image: { type: String }, // Add this field
    comments: [CommentSchema], // Embedded comments
  },
  { timestamps: true }
);

export default mongoose.model<IBlog>("Blog", BlogSchema);
