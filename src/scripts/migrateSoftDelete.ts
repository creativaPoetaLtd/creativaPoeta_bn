import mongoose, { Model } from "mongoose";
import User from "../models/User";
import Blog from "../models/Blog";
import ProjectRequest from "../models/ProjectDescription";
import Query from "../models/Query";
import PartnershipRequest from "../models/PartnershipRequest";
import ReferralPartner from "../models/ReferralPartner";
import ReferralLead from "../models/ReferralLead";
import JobApplication from "../models/JobApplication";
import JobApplicationFile from "../models/JobApplicationFile";
import EmailMessage from "../models/EmailMessage";
import OutboundEmail from "../models/OutboundEmail";
import Job from "../models/Job";
import ReferralReward from "../models/ReferralReward";
import AdminNotification from "../models/AdminNotification";
import InternalConversation from "../models/InternalConversation";
import WhatsAppConversation from "../models/WhatsAppConversation";
import WhatsAppMessage from "../models/WhatsAppMessage";

const protectedModels: Model<any>[] = [
  User, Blog, ProjectRequest, Query, PartnershipRequest, ReferralPartner,
  ReferralLead, JobApplication, JobApplicationFile, EmailMessage, OutboundEmail,
  Job, ReferralReward, AdminNotification, InternalConversation, WhatsAppConversation,
  WhatsAppMessage,
];

const activeUniqueIndexes = [
  { model: User, key: { email: 1 }, name: "active_user_email_unique" },
  { model: Blog, key: { slug: 1, language: 1 }, name: "active_blog_slug_language_unique" },
  { model: ReferralPartner, key: { partnerId: 1 }, name: "active_referral_partner_id_unique" },
  { model: ReferralPartner, key: { referralCode: 1 }, name: "active_referral_code_unique" },
  { model: JobApplicationFile, key: { application: 1 }, name: "active_job_application_file_unique" },
  { model: ReferralReward, key: { lead: 1 }, name: "active_referral_reward_lead_unique" },
  { model: WhatsAppConversation, key: { conversationKey: 1 }, name: "active_whatsapp_conversation_key_unique" },
  { model: WhatsAppMessage, key: { providerMessageId: 1 }, name: "active_whatsapp_provider_message_unique" },
  { model: EmailMessage, key: { mailbox: 1, sourceFolder: 1, uid: 1 }, name: "active_mailbox_sourceFolder_uid_unique" },
] as const;

const sameKey = (left: Record<string, unknown>, right: Record<string, unknown>) =>
  JSON.stringify(left) === JSON.stringify(right);

const isActiveOnlyIndex = (partialFilterExpression: unknown) =>
  Boolean(
    partialFilterExpression &&
    typeof partialFilterExpression === "object" &&
    (partialFilterExpression as Record<string, unknown>).isDeleted === false
  );

const main = async () => {
  const uri = String(process.env.MONGO_MIGRATION_URI || "").trim();
  if (!uri) throw new Error("MONGO_MIGRATION_URI is required. Use a temporary migration credential, never the runtime credential.");

  await mongoose.connect(uri, { serverSelectionTimeoutMS: 15000 });
  console.log("Connected with the isolated migration credential.");

  for (const model of protectedModels) {
    const result = await model.collection.updateMany(
      { isDeleted: { $exists: false } },
      { $set: { isDeleted: false } }
    );
    console.log(`${model.modelName}: normalized ${result.modifiedCount} record(s).`);
  }

  await Blog.collection.updateMany(
    { "comments.isDeleted": { $exists: false } },
    [{
      $set: {
        comments: {
          $map: {
            input: { $ifNull: ["$comments", []] },
            as: "comment",
            in: { $mergeObjects: [{ isDeleted: false }, "$$comment"] },
          },
        },
      },
    }]
  );

  for (const definition of activeUniqueIndexes) {
    const indexes = await definition.model.collection.indexes();
    for (const index of indexes) {
      if (!index.unique || !sameKey(index.key as Record<string, unknown>, definition.key)) continue;
      const activeOnly = isActiveOnlyIndex(index.partialFilterExpression);
      if (index.name && (index.name !== definition.name || !activeOnly)) {
        console.log(`Dropping incompatible index ${definition.model.modelName}.${index.name}`);
        await definition.model.collection.dropIndex(index.name);
      }
    }
  }

  for (const model of protectedModels) await model.createIndexes();
  console.log("Soft-delete fields and active-only indexes are ready.");
};

main()
  .catch((error) => { console.error(error); process.exitCode = 1; })
  .finally(async () => { await mongoose.disconnect(); });
