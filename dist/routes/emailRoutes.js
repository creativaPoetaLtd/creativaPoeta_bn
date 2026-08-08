"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const multer_1 = __importDefault(require("multer"));
const emailController_1 = require("../controllers/emailController");
const authMiddleware_1 = require("../middleware/authMiddleware");
const router = express_1.default.Router();
const emailAttachmentUpload = (0, multer_1.default)({
    storage: multer_1.default.memoryStorage(),
    limits: {
        files: 8,
        fileSize: 8 * 1024 * 1024,
    },
});
router.post("/cron-sync", emailController_1.cronSyncEmails);
router.get("/cron-sync", emailController_1.cronSyncEmails);
router.use(authMiddleware_1.authenticateUser, authMiddleware_1.adminOnly);
router.get("/", emailController_1.getEmails);
router.get("/summary", emailController_1.getEmailSummary);
router.post("/sync", emailController_1.syncEmails);
router.get("/outbound", emailController_1.getOutboundEmails);
router.post("/outbound/draft", emailController_1.saveDraftEmail);
router.put("/outbound/:id/draft", emailController_1.updateDraftEmail);
router.post("/outbound/send", emailAttachmentUpload.array("attachments", 8), emailController_1.sendComposedEmail);
router.post("/outbound/:id/send", emailController_1.sendDraftEmail);
router.delete("/outbound/:id", emailController_1.deleteOutboundEmail);
router.get("/:id", emailController_1.getEmail);
router.post("/:id/claim", emailController_1.claimEmail);
router.post("/:id/release", emailController_1.releaseEmail);
router.post("/:id/reply", emailController_1.replyToEmail);
router.post("/:id/forward", emailAttachmentUpload.array("attachments", 8), emailController_1.forwardEmail);
router.put("/:id/status", emailController_1.updateEmailStatus);
router.delete("/:id", emailController_1.deleteEmail);
exports.default = router;
