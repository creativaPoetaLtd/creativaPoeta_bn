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
const InternalMessageSchema = new mongoose_1.Schema({
    body: { type: String, required: true, trim: true },
    senderEmail: { type: String, required: true, trim: true, lowercase: true },
    senderName: { type: String, required: true, trim: true },
    readByEmails: { type: [String], default: [] },
    createdAt: { type: Date, default: Date.now },
}, { _id: true });
const InternalConversationSchema = new mongoose_1.Schema({
    title: { type: String, required: true, trim: true },
    type: { type: String, enum: ["group", "direct", "custom"], required: true, default: "custom" },
    groupKey: { type: String, trim: true },
    participantEmails: { type: [String], default: [] },
    createdByEmail: { type: String, required: true, trim: true, lowercase: true },
    messages: { type: [InternalMessageSchema], default: [] },
    lastMessageAt: { type: Date },
}, { timestamps: true });
InternalConversationSchema.index({ groupKey: 1 }, { sparse: true });
InternalConversationSchema.index({ participantEmails: 1, lastMessageAt: -1 });
exports.default = mongoose_1.default.model("InternalConversation", InternalConversationSchema);
