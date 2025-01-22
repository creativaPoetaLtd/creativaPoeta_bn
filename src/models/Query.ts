import mongoose, { Schema, Document } from "mongoose";

export interface IQuery extends Document {
  name: string;
  email: string;
  message: string;
  createdAt: Date;
}

const QuerySchema: Schema = new Schema(
  {
    name: { type: String, required: true },
    email: { type: String, required: true },
    message: { type: String, required: true },
  },
  { timestamps: true }
);

export default mongoose.model<IQuery>("Query", QuerySchema);
