import mongoose, { Schema, Document } from "mongoose";

export interface IQuery extends Document {
  name: string;
  email: string;
  message: string;
  status: "pending" | "replied" | "closed";
  isReplied: boolean;
  replyMessage?: string;
  repliedAt?: Date;
  repliedBy?: string;
  createdAt: Date;
  updatedAt: Date;
}

const QuerySchema: Schema = new Schema(
  {
    name: { type: String, required: true },
    email: { type: String, required: true },
    message: { type: String, required: true },
    status: {
      type: String,
      enum: ["pending", "replied", "closed"],
      default: "pending",
    },
    isReplied: { type: Boolean, default: false },
    replyMessage: { type: String },
    repliedAt: { type: Date },
    repliedBy: { type: String },
  },
  { timestamps: true }
);

export default mongoose.model<IQuery>("Query", QuerySchema);
