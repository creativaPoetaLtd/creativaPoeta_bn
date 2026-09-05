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
const OutboundEmailSchema = new mongoose_1.Schema({
    folder: { type: String, enum: ["sent", "draft"], required: true, default: "draft" },
    status: { type: String, enum: ["draft", "sent", "failed"], required: true, default: "draft" },
    to: [{ type: String, trim: true, lowercase: true }],
    cc: [{ type: String, trim: true, lowercase: true }],
    bcc: [{ type: String, trim: true, lowercase: true }],
    subject: { type: String, trim: true, default: "" },
    body: { type: String, default: "" },
    signature: { type: String, default: "" },
    fromEmail: { type: String, trim: true, lowercase: true },
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
    createdByEmail: { type: String, trim: true, lowercase: true },
    updatedByEmail: { type: String, trim: true, lowercase: true },
}, { timestamps: true });
OutboundEmailSchema.plugin(softDeletePlugin_1.softDeletePlugin, { entityType: "outbound_email" });
OutboundEmailSchema.index({ folder: 1, updatedAt: -1 });
OutboundEmailSchema.index({ status: 1, updatedAt: -1 });
OutboundEmailSchema.index({ createdByEmail: 1, folder: 1, updatedAt: -1 });
OutboundEmailSchema.index({ subject: "text", body: "text", signature: "text", to: "text" });
exports.default = mongoose_1.default.model("OutboundEmail", OutboundEmailSchema);
