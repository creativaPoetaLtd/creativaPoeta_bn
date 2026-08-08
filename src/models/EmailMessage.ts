import mongoose, { Document, Schema } from "mongoose";

export type EmailMessageStatus = "new" | "read" | "replied" | "archived";
export type EmailMessageFolder = "inbox" | "spam";
export type EmailMessageActivityType = "assigned" | "released" | "read" | "replied" | "status";

export interface IEmailMessageActivity {
  type: EmailMessageActivityType;
  actorName?: string;
  actorEmail?: string;
  message?: string;
  createdAt: Date;
}

export interface IEmailMessage extends Document {
  mailbox: string;
  mailboxAddress: string;
  uid?: number;
  sourceFolder?: string;
  sourceSpecialUse?: string;
  messageId?: string;
  fromName?: string;
  fromEmail?: string;
  to: string[];
  cc: string[];
  subject: string;
  preview: string;
  text: string;
  html?: string;
  folder: EmailMessageFolder;
  status: EmailMessageStatus;
  isSeenOnServer: boolean;
  receivedAt: Date;
  syncedAt: Date;
  rawSize?: number;
  replyMessage?: string;
  replySubject?: string;
  repliedAt?: Date;
  repliedBy?: string;
  assignedToEmail?: string;
  assignedToName?: string;
  assignedAt?: Date;
  activity?: IEmailMessageActivity[];
}

const EmailMessageSchema: Schema = new Schema(
  {
    mailbox: { type: String, required: true, trim: true },
    mailboxAddress: { type: String, required: true, trim: true, lowercase: true },
    uid: { type: Number },
    sourceFolder: { type: String, trim: true, default: "INBOX" },
    sourceSpecialUse: { type: String, trim: true },
    messageId: { type: String, trim: true },
    fromName: { type: String, trim: true },
    fromEmail: { type: String, trim: true, lowercase: true },
    to: [{ type: String, trim: true, lowercase: true }],
    cc: [{ type: String, trim: true, lowercase: true }],
    subject: { type: String, trim: true, default: "(No subject)" },
    preview: { type: String, trim: true, default: "" },
    text: { type: String, default: "" },
    html: { type: String },
    folder: {
      type: String,
      enum: ["inbox", "spam"],
      default: "inbox",
    },
    status: {
      type: String,
      enum: ["new", "read", "replied", "archived"],
      default: "new",
    },
    isSeenOnServer: { type: Boolean, default: false },
    receivedAt: { type: Date, default: Date.now },
    syncedAt: { type: Date, default: Date.now },
    rawSize: { type: Number },
    replyMessage: { type: String },
    replySubject: { type: String, trim: true },
    repliedAt: { type: Date },
    repliedBy: { type: String, trim: true },
    assignedToEmail: { type: String, trim: true, lowercase: true },
    assignedToName: { type: String, trim: true },
    assignedAt: { type: Date },
    activity: [
      {
        type: { type: String, enum: ["assigned", "released", "read", "replied", "status"], required: true },
        actorName: { type: String, trim: true },
        actorEmail: { type: String, trim: true, lowercase: true },
        message: { type: String, trim: true },
        createdAt: { type: Date, default: Date.now },
      },
    ],
  },
  { timestamps: true }
);

EmailMessageSchema.index(
  { mailbox: 1, sourceFolder: 1, uid: 1 },
  { unique: true, sparse: true, name: "mailbox_sourceFolder_uid_unique" }
);
EmailMessageSchema.index({ mailbox: 1, messageId: 1 }, { sparse: true });
EmailMessageSchema.index({ status: 1, receivedAt: -1 });
EmailMessageSchema.index({ mailboxAddress: 1, receivedAt: -1 });
EmailMessageSchema.index({ folder: 1, receivedAt: -1 });
EmailMessageSchema.index({ assignedToEmail: 1, receivedAt: -1 });
EmailMessageSchema.index({
  subject: "text",
  preview: "text",
  text: "text",
  fromName: "text",
  fromEmail: "text",
});

EmailMessageSchema.pre("validate", function migrateLegacyDmarcFolder(next) {
  if (String(this.folder) === "dmarc") this.folder = "spam";
  next();
});

export default mongoose.model<IEmailMessage>("EmailMessage", EmailMessageSchema);

