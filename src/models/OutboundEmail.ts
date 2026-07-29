import mongoose, { Document, Schema } from "mongoose";

export type OutboundEmailFolder = "sent" | "draft";
export type OutboundEmailStatus = "draft" | "sent" | "failed";

export interface IOutboundAttachment {
  filename: string;
  mimeType?: string;
  size?: number;
}

export interface IOutboundEmail extends Document {
  folder: OutboundEmailFolder;
  status: OutboundEmailStatus;
  to: string[];
  cc: string[];
  bcc: string[];
  subject: string;
  body: string;
  signature?: string;
  attachments?: IOutboundAttachment[];
  error?: string;
  sentAt?: Date;
  createdBy?: string;
  updatedBy?: string;
}

const OutboundEmailSchema: Schema = new Schema(
  {
    folder: { type: String, enum: ["sent", "draft"], required: true, default: "draft" },
    status: { type: String, enum: ["draft", "sent", "failed"], required: true, default: "draft" },
    to: [{ type: String, trim: true, lowercase: true }],
    cc: [{ type: String, trim: true, lowercase: true }],
    bcc: [{ type: String, trim: true, lowercase: true }],
    subject: { type: String, trim: true, default: "" },
    body: { type: String, default: "" },
    signature: { type: String, default: "" },
    attachments: [
      {
        filename: { type: String, required: true, trim: true },
        mimeType: { type: String, trim: true },
        size: { type: Number, default: 0 },
      },
    ],
    error: { type: String },
    sentAt: { type: Date },
    createdBy: { type: String, trim: true },
    updatedBy: { type: String, trim: true },
  },
  { timestamps: true }
);

OutboundEmailSchema.index({ folder: 1, updatedAt: -1 });
OutboundEmailSchema.index({ status: 1, updatedAt: -1 });
OutboundEmailSchema.index({ subject: "text", body: "text", signature: "text", to: "text" });

export default mongoose.model<IOutboundEmail>("OutboundEmail", OutboundEmailSchema);
