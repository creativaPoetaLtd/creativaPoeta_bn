import mongoose, { Document, Schema, Types } from "mongoose";
import { softDeletePlugin } from "../plugins/softDeletePlugin";

export type WhatsAppMessageDirection = "inbound" | "outbound";
export type WhatsAppMessageStatus =
  | "received"
  | "queued"
  | "sent"
  | "delivered"
  | "read"
  | "failed";

export interface IWhatsAppMessage extends Document {
  conversationId: Types.ObjectId;
  providerMessageId: string;
  contextMessageId?: string;
  direction: WhatsAppMessageDirection;
  type: string;
  text?: string;
  status: WhatsAppMessageStatus;
  from: string;
  to: string;
  providerTimestamp?: Date;
  mediaId?: string;
  mediaMimeType?: string;
  mediaFilename?: string;
  mediaCaption?: string;
  errorCode?: string;
  errorMessage?: string;
  sentByEmail?: string;
  sentByName?: string;
  createdAt: Date;
  updatedAt: Date;
}

const WhatsAppMessageSchema = new Schema<IWhatsAppMessage>(
  {
    conversationId: {
      type: Schema.Types.ObjectId,
      ref: "WhatsAppConversation",
      required: true,
      index: true,
    },
    providerMessageId: { type: String, required: true },
    contextMessageId: { type: String, trim: true },
    direction: { type: String, enum: ["inbound", "outbound"], required: true },
    type: { type: String, required: true, trim: true },
    text: { type: String, maxlength: 4096 },
    status: {
      type: String,
      enum: ["received", "queued", "sent", "delivered", "read", "failed"],
      required: true,
      index: true,
    },
    from: { type: String, required: true, trim: true },
    to: { type: String, required: true, trim: true },
    providerTimestamp: { type: Date },
    mediaId: { type: String, trim: true },
    mediaMimeType: { type: String, trim: true },
    mediaFilename: { type: String, trim: true },
    mediaCaption: { type: String, maxlength: 1024 },
    errorCode: { type: String, trim: true },
    errorMessage: { type: String, maxlength: 1000 },
    sentByEmail: { type: String, trim: true, lowercase: true },
    sentByName: { type: String, trim: true },
  },
  { timestamps: true }
);

WhatsAppMessageSchema.index({ conversationId: 1, providerTimestamp: 1, createdAt: 1 });
WhatsAppMessageSchema.plugin(softDeletePlugin, { entityType: "whatsapp_message", audit: false });
WhatsAppMessageSchema.index(
  { providerMessageId: 1 },
  { unique: true, partialFilterExpression: { isDeleted: false }, name: "active_whatsapp_provider_message_unique" }
);

export default mongoose.model<IWhatsAppMessage>("WhatsAppMessage", WhatsAppMessageSchema);
