"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const mongoose_1 = __importStar(require("mongoose"));
const softDeletePlugin_1 = require("../plugins/softDeletePlugin");
const WhatsAppMessageSchema = new mongoose_1.Schema({
    conversationId: {
        type: mongoose_1.Schema.Types.ObjectId,
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
}, { timestamps: true });
WhatsAppMessageSchema.index({ conversationId: 1, providerTimestamp: 1, createdAt: 1 });
WhatsAppMessageSchema.plugin(softDeletePlugin_1.softDeletePlugin, { entityType: "whatsapp_message", audit: false });
WhatsAppMessageSchema.index({ providerMessageId: 1 }, { unique: true, partialFilterExpression: { isDeleted: false }, name: "active_whatsapp_provider_message_unique" });
exports.default = mongoose_1.default.model("WhatsAppMessage", WhatsAppMessageSchema);
