import mongoose, { Document, Schema } from "mongoose";
import { softDeletePlugin } from "../plugins/softDeletePlugin";

export type WhatsAppConversationStatus =
  | "open"
  | "waiting"
  | "resolved"
  | "closed"
  | "spam";

export interface IWhatsAppActivity {
  type: "assigned" | "released" | "status" | "note" | "inbound" | "outbound";
  message: string;
  actorEmail?: string;
  actorName?: string;
  at: Date;
}

export interface IWhatsAppConversation extends Document {
  conversationKey: string;
  waId: string;
  phoneNumberId: string;
  displayPhoneNumber?: string;
  displayName?: string;
  status: WhatsAppConversationStatus;
  unreadCount: number;
  lastMessagePreview?: string;
  lastMessageAt?: Date;
  lastDirection?: "inbound" | "outbound";
  lastInboundAt?: Date;
  lastOutboundAt?: Date;
  serviceWindowExpiresAt?: Date;
  assignedToEmail?: string;
  assignedToName?: string;
  assignedAt?: Date;
  activity: IWhatsAppActivity[];
  createdAt: Date;
  updatedAt: Date;
}

const WhatsAppActivitySchema = new Schema<IWhatsAppActivity>(
  {
    type: {
      type: String,
      enum: ["assigned", "released", "status", "note", "inbound", "outbound"],
      required: true,
    },
    message: { type: String, required: true, trim: true, maxlength: 2000 },
    actorEmail: { type: String, trim: true, lowercase: true },
    actorName: { type: String, trim: true },
    at: { type: Date, default: Date.now },
  },
  { _id: true }
);

const WhatsAppConversationSchema = new Schema<IWhatsAppConversation>(
  {
    conversationKey: { type: String, required: true },
    waId: { type: String, required: true, trim: true, index: true },
    phoneNumberId: { type: String, required: true, trim: true },
    displayPhoneNumber: { type: String, trim: true },
    displayName: { type: String, trim: true, maxlength: 160 },
    status: {
      type: String,
      enum: ["open", "waiting", "resolved", "closed", "spam"],
      default: "open",
      index: true,
    },
    unreadCount: { type: Number, default: 0, min: 0 },
    lastMessagePreview: { type: String, trim: true, maxlength: 500 },
    lastMessageAt: { type: Date, index: true },
    lastDirection: { type: String, enum: ["inbound", "outbound"] },
    lastInboundAt: { type: Date },
    lastOutboundAt: { type: Date },
    serviceWindowExpiresAt: { type: Date },
    assignedToEmail: { type: String, trim: true, lowercase: true, index: true },
    assignedToName: { type: String, trim: true },
    assignedAt: { type: Date },
    activity: { type: [WhatsAppActivitySchema], default: [] },
  },
  { timestamps: true }
);

WhatsAppConversationSchema.index({ status: 1, lastMessageAt: -1 });
WhatsAppConversationSchema.index({ assignedToEmail: 1, status: 1, lastMessageAt: -1 });
WhatsAppConversationSchema.plugin(softDeletePlugin, { entityType: "whatsapp_conversation", audit: false });
WhatsAppConversationSchema.index(
  { conversationKey: 1 },
  { unique: true, partialFilterExpression: { isDeleted: false }, name: "active_whatsapp_conversation_key_unique" }
);

export default mongoose.model<IWhatsAppConversation>(
  "WhatsAppConversation",
  WhatsAppConversationSchema
);
