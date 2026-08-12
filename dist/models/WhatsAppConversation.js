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
const WhatsAppActivitySchema = new mongoose_1.Schema({
    type: {
        type: String,
        enum: ["assigned", "released", "status", "note", "inbound", "outbound"],
        required: true,
    },
    message: { type: String, required: true, trim: true, maxlength: 2000 },
    actorEmail: { type: String, trim: true, lowercase: true },
    actorName: { type: String, trim: true },
    at: { type: Date, default: Date.now },
}, { _id: true });
const WhatsAppConversationSchema = new mongoose_1.Schema({
    conversationKey: { type: String, required: true, unique: true, index: true },
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
}, { timestamps: true });
WhatsAppConversationSchema.index({ status: 1, lastMessageAt: -1 });
WhatsAppConversationSchema.index({ assignedToEmail: 1, status: 1, lastMessageAt: -1 });
exports.default = mongoose_1.default.model("WhatsAppConversation", WhatsAppConversationSchema);
