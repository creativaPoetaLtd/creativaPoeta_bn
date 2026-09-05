import mongoose, { Schema, Document } from "mongoose";
import { softDeletePlugin } from "../plugins/softDeletePlugin";

export type InternalConversationType = "group" | "direct" | "custom";

export interface IInternalMessage {
  body: string;
  senderEmail: string;
  senderName: string;
  readByEmails: string[];
  createdAt: Date;
}

export interface IInternalConversation extends Document {
  title: string;
  type: InternalConversationType;
  groupKey?: string;
  participantEmails: string[];
  createdByEmail: string;
  messages: IInternalMessage[];
  lastMessageAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const InternalMessageSchema = new Schema<IInternalMessage>(
  {
    body: { type: String, required: true, trim: true },
    senderEmail: { type: String, required: true, trim: true, lowercase: true },
    senderName: { type: String, required: true, trim: true },
    readByEmails: { type: [String], default: [] },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: true }
);

const InternalConversationSchema = new Schema<IInternalConversation>(
  {
    title: { type: String, required: true, trim: true },
    type: { type: String, enum: ["group", "direct", "custom"], required: true, default: "custom" },
    groupKey: { type: String, trim: true },
    participantEmails: { type: [String], default: [] },
    createdByEmail: { type: String, required: true, trim: true, lowercase: true },
    messages: { type: [InternalMessageSchema], default: [] },
    lastMessageAt: { type: Date },
  },
  { timestamps: true }
);

InternalConversationSchema.index({ groupKey: 1 }, { sparse: true });
InternalConversationSchema.index({ participantEmails: 1, lastMessageAt: -1 });
InternalConversationSchema.plugin(softDeletePlugin, { entityType: "internal_conversation", audit: false });

export default mongoose.model<IInternalConversation>("InternalConversation", InternalConversationSchema);
