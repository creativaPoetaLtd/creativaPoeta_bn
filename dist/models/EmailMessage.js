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
const EmailMessageSchema = new mongoose_1.Schema({
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
}, { timestamps: true });
EmailMessageSchema.plugin(softDeletePlugin_1.softDeletePlugin, { entityType: "inbound_email", audit: false });
EmailMessageSchema.index({ mailbox: 1, sourceFolder: 1, uid: 1 }, {
    unique: true,
    partialFilterExpression: {
        mailbox: { $type: "string" },
        sourceFolder: { $type: "string" },
        uid: { $type: "number" },
        isDeleted: false,
    },
    name: "active_mailbox_sourceFolder_uid_unique",
});
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
    if (String(this.folder) === "dmarc")
        this.folder = "spam";
    next();
});
exports.default = mongoose_1.default.model("EmailMessage", EmailMessageSchema);
