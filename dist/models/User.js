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
const MailboxAccessSchema = new mongoose_1.Schema({
    address: { type: String, trim: true, lowercase: true, required: true },
    permission: {
        type: String,
        enum: ["read", "send", "manage"],
        default: "read",
    },
    type: {
        type: String,
        enum: ["personal", "shared"],
        default: "shared",
    },
}, { _id: false });
const UserSchema = new mongoose_1.Schema({
    name: { type: String, required: true },
    email: { type: String, required: true, lowercase: true, trim: true },
    password: { type: String, default: "" },
    role: {
        type: String,
        enum: [
            "super_admin",
            "admin_0",
            "admin_1",
            "admin_2",
            "admin_3",
            "admin_4",
            "admin_5",
            "admin",
            "editor",
            "viewer",
        ],
        default: "admin_1",
    },
    isActive: { type: Boolean, default: true },
    accountStatus: {
        type: String,
        enum: ["pending", "active", "disabled"],
        default: "active",
    },
    passwordSetAt: { type: Date },
    resetTokenHash: { type: String },
    resetTokenExpiresAt: { type: Date },
    mailboxAccess: { type: [MailboxAccessSchema], default: [] },
    permissionsAllow: { type: [String], default: [] },
    permissionsDeny: { type: [String], default: [] },
    internalGroups: { type: [String], default: [] },
    mfaEnabled: { type: Boolean, default: false },
    mfaSecretEncrypted: { type: String, select: false },
    mfaPendingSecretEncrypted: { type: String, select: false },
    mfaPendingExpiresAt: { type: Date, select: false },
    mfaRecoveryCodeHashes: { type: [String], default: [], select: false },
    mfaFailedAttempts: { type: Number, default: 0, select: false },
    mfaLockedUntil: { type: Date, select: false },
    mfaEnabledAt: { type: Date },
    authVersion: { type: Number, default: 0 },
}, { timestamps: true });
UserSchema.plugin(softDeletePlugin_1.softDeletePlugin, { entityType: "admin_user" });
UserSchema.index({ email: 1 }, { unique: true, partialFilterExpression: { isDeleted: false }, name: "active_user_email_unique" });
exports.default = mongoose_1.default.model("User", UserSchema);
