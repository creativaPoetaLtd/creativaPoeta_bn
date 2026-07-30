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

export type AccountStatus = "pending" | "active" | "disabled";
export type MailboxAccessPermission = "read" | "send" | "manage";
export type MailboxAccessType = "personal" | "shared";

export interface IUserMailboxAccess {
  address: string;
  permission: MailboxAccessPermission;
  type: MailboxAccessType;
}

export interface IUser extends Document {
  name: string;
  email: string;
  password?: string;
  role: UserRole;
  isActive: boolean;
  accountStatus: AccountStatus;
  passwordSetAt?: Date;
  resetTokenHash?: string;
  resetTokenExpiresAt?: Date;
  mailboxAccess: IUserMailboxAccess[];
  createdAt: Date;
}

const MailboxAccessSchema = new Schema(
  {
    address: { type: String, trim: true, lowercase: true, required: true },
    permission: {
      type: String,
      enum: ["read", "send", "manage"],
      default: "read",
    },
    type: {
      type: String,
      enum: ["personal", "shared"],
      default: "shared",
    },
  },
  { _id: false }
);

const UserSchema: Schema = new Schema(
  {
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    password: { type: String, default: "" },
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
    accountStatus: {
      type: String,
      enum: ["pending", "active", "disabled"],
      default: "active",
    },
    passwordSetAt: { type: Date },
    resetTokenHash: { type: String },
    resetTokenExpiresAt: { type: Date },
    mailboxAccess: { type: [MailboxAccessSchema], default: [] },
  },
  { timestamps: true }
);

export default mongoose.model<IUser>("User", UserSchema);
