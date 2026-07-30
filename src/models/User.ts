import mongoose, { Schema, Document } from "mongoose";

export type UserRole =
  | "super_admin"
  | "admin_0"
  | "admin_1"
  | "admin_2"
  | "admin_3"
  | "admin_4"
  | "admin_5"
  | "admin"
  | "editor"
  | "viewer";

export interface IUser extends Document {
  name: string;
  email: string;
  password: string;
  role: UserRole;
  isActive: boolean;
  createdAt: Date;
}

const UserSchema: Schema = new Schema(
  {
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    role: {
      type: String,
      enum: [
        "super_admin",
        "admin_0",
        "admin_1",
        "admin_2",
        "admin_3",
        "admin_4",
        "admin_5",
        "admin",
        "editor",
        "viewer",
      ],
      default: "admin_1",
    },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

export default mongoose.model<IUser>("User", UserSchema);
