import mongoose, { Document, Schema } from "mongoose";

export type EmailMessageStatus = "new" | "read" | "replied" | "archived";

export interface IEmailMessage extends Document {
  mailbox: string;
  mailboxAddress: string;
  uid?: number;
  messageId?: string;
  fromName?: string;
  fromEmail?: string;
  to: string[];
  cc: string[];
  subject: string;
  preview: string;
  text: string;
  html?: string;
  status: EmailMessageStatus;
  isSeenOnServer: boolean;
  receivedAt: Date;
  syncedAt: Date;
  rawSize?: number;
}

const EmailMessageSchema: Schema = new Schema(
  {
    mailbox: { type: String, required: true, trim: true },
    mailboxAddress: { type: String, required: true, trim: true, lowercase: true },
    uid: { type: Number },
    messageId: { type: String, trim: true },
    fromName: { type: String, trim: true },
    fromEmail: { type: String, trim: true, lowercase: true },
    to: [{ type: String, trim: true, lowercase: true }],
    cc: [{ type: String, trim: true, lowercase: true }],
    subject: { type: String, trim: true, default: "(No subject)" },
    preview: { type: String, trim: true, default: "" },
    text: { type: String, default: "" },
    html: { type: String },
    status: {
      type: String,
      enum: ["new", "read", "replied", "archived"],
      default: "new",
    },
    isSeenOnServer: { type: Boolean, default: false },
    receivedAt: { type: Date, default: Date.now },
    syncedAt: { type: Date, default: Date.now },
    rawSize: { type: Number },
  },
  { timestamps: true }
);

EmailMessageSchema.index({ mailbox: 1, uid: 1 }, { unique: true, sparse: true });
EmailMessageSchema.index({ mailbox: 1, messageId: 1 }, { sparse: true });
EmailMessageSchema.index({ status: 1, receivedAt: -1 });
EmailMessageSchema.index({ mailboxAddress: 1, receivedAt: -1 });
EmailMessageSchema.index({
  subject: "text",
  preview: "text",
  text: "text",
  fromName: "text",
  fromEmail: "text",
});

export default mongoose.model<IEmailMessage>("EmailMessage", EmailMessageSchema);
