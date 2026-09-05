import mongoose, { Document, Schema } from "mongoose";
import { softDeletePlugin } from "../plugins/softDeletePlugin";

export type AdminNotificationType = "password_reset";
export type AdminNotificationStatus = "new" | "read" | "resolved" | "archived";

export interface IAdminNotification extends Document {
  type: AdminNotificationType;
  status: AdminNotificationStatus;
  title: string;
  message?: string;
  targetUserId?: mongoose.Types.ObjectId;
  targetEmail?: string;
  targetName?: string;
  createdByEmail?: string;
  resolvedByEmail?: string;
  resolvedByName?: string;
  resolvedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const AdminNotificationSchema = new Schema<IAdminNotification>(
  {
    type: {
      type: String,
      enum: ["password_reset"],
      required: true,
      index: true,
    },
    status: {
      type: String,
      enum: ["new", "read", "resolved", "archived"],
      default: "new",
      index: true,
    },
    title: { type: String, required: true },
    message: { type: String },
    targetUserId: { type: Schema.Types.ObjectId, ref: "User", index: true },
    targetEmail: { type: String, lowercase: true, trim: true, index: true },
    targetName: { type: String },
    createdByEmail: { type: String, lowercase: true, trim: true },
    resolvedByEmail: { type: String, lowercase: true, trim: true },
    resolvedByName: { type: String },
    resolvedAt: { type: Date },
  },
  { timestamps: true }
);

AdminNotificationSchema.index({ type: 1, status: 1, createdAt: -1 });
AdminNotificationSchema.plugin(softDeletePlugin, { entityType: "admin_notification" });

export default mongoose.model<IAdminNotification>("AdminNotification", AdminNotificationSchema);
