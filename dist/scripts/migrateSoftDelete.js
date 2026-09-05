"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const mongoose_1 = __importDefault(require("mongoose"));
const User_1 = __importDefault(require("../models/User"));
const Blog_1 = __importDefault(require("../models/Blog"));
const ProjectDescription_1 = __importDefault(require("../models/ProjectDescription"));
const Query_1 = __importDefault(require("../models/Query"));
const PartnershipRequest_1 = __importDefault(require("../models/PartnershipRequest"));
const ReferralPartner_1 = __importDefault(require("../models/ReferralPartner"));
const ReferralLead_1 = __importDefault(require("../models/ReferralLead"));
const JobApplication_1 = __importDefault(require("../models/JobApplication"));
const JobApplicationFile_1 = __importDefault(require("../models/JobApplicationFile"));
const EmailMessage_1 = __importDefault(require("../models/EmailMessage"));
const OutboundEmail_1 = __importDefault(require("../models/OutboundEmail"));
const Job_1 = __importDefault(require("../models/Job"));
const ReferralReward_1 = __importDefault(require("../models/ReferralReward"));
const AdminNotification_1 = __importDefault(require("../models/AdminNotification"));
const InternalConversation_1 = __importDefault(require("../models/InternalConversation"));
const WhatsAppConversation_1 = __importDefault(require("../models/WhatsAppConversation"));
const WhatsAppMessage_1 = __importDefault(require("../models/WhatsAppMessage"));
const protectedModels = [
    User_1.default, Blog_1.default, ProjectDescription_1.default, Query_1.default, PartnershipRequest_1.default, ReferralPartner_1.default,
    ReferralLead_1.default, JobApplication_1.default, JobApplicationFile_1.default, EmailMessage_1.default, OutboundEmail_1.default,
    Job_1.default, ReferralReward_1.default, AdminNotification_1.default, InternalConversation_1.default, WhatsAppConversation_1.default,
    WhatsAppMessage_1.default,
];
const activeUniqueIndexes = [
    { model: User_1.default, key: { email: 1 }, name: "active_user_email_unique" },
    { model: Blog_1.default, key: { slug: 1, language: 1 }, name: "active_blog_slug_language_unique" },
    { model: ReferralPartner_1.default, key: { partnerId: 1 }, name: "active_referral_partner_id_unique" },
    { model: ReferralPartner_1.default, key: { referralCode: 1 }, name: "active_referral_code_unique" },
    { model: JobApplicationFile_1.default, key: { application: 1 }, name: "active_job_application_file_unique" },
    { model: ReferralReward_1.default, key: { lead: 1 }, name: "active_referral_reward_lead_unique" },
    { model: WhatsAppConversation_1.default, key: { conversationKey: 1 }, name: "active_whatsapp_conversation_key_unique" },
    { model: WhatsAppMessage_1.default, key: { providerMessageId: 1 }, name: "active_whatsapp_provider_message_unique" },
    { model: EmailMessage_1.default, key: { mailbox: 1, sourceFolder: 1, uid: 1 }, name: "active_mailbox_sourceFolder_uid_unique" },
];
const sameKey = (left, right) => JSON.stringify(left) === JSON.stringify(right);
const isActiveOnlyIndex = (partialFilterExpression) => Boolean(partialFilterExpression &&
    typeof partialFilterExpression === "object" &&
    partialFilterExpression.isDeleted === false);
const main = async () => {
    const uri = String(process.env.MONGO_MIGRATION_URI || "").trim();
    if (!uri)
        throw new Error("MONGO_MIGRATION_URI is required. Use a temporary migration credential, never the runtime credential.");
    await mongoose_1.default.connect(uri, { serverSelectionTimeoutMS: 15000 });
    console.log("Connected with the isolated migration credential.");
    for (const model of protectedModels) {
        const result = await model.collection.updateMany({ isDeleted: { $exists: false } }, { $set: { isDeleted: false } });
        console.log(`${model.modelName}: normalized ${result.modifiedCount} record(s).`);
    }
    await Blog_1.default.collection.updateMany({ "comments.isDeleted": { $exists: false } }, [{
            $set: {
                comments: {
                    $map: {
                        input: { $ifNull: ["$comments", []] },
                        as: "comment",
                        in: { $mergeObjects: [{ isDeleted: false }, "$$comment"] },
                    },
                },
            },
        }]);
    for (const definition of activeUniqueIndexes) {
        const indexes = await definition.model.collection.indexes();
        for (const index of indexes) {
            if (!index.unique || !sameKey(index.key, definition.key))
                continue;
            const activeOnly = isActiveOnlyIndex(index.partialFilterExpression);
            if (index.name && (index.name !== definition.name || !activeOnly)) {
                console.log(`Dropping incompatible index ${definition.model.modelName}.${index.name}`);
                await definition.model.collection.dropIndex(index.name);
            }
        }
    }
    for (const model of protectedModels)
        await model.createIndexes();
    console.log("Soft-delete fields and active-only indexes are ready.");
};
main()
    .catch((error) => { console.error(error); process.exitCode = 1; })
    .finally(async () => { await mongoose_1.default.disconnect(); });
