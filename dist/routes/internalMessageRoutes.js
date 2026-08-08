"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const internalMessageController_1 = require("../controllers/internalMessageController");
const authMiddleware_1 = require("../middleware/authMiddleware");
const router = express_1.default.Router();
router.use(authMiddleware_1.authenticateUser, authMiddleware_1.adminOnly);
router.get("/", internalMessageController_1.listInternalConversations);
router.get("/summary", internalMessageController_1.getInternalMessageSummary);
router.post("/", internalMessageController_1.createInternalConversation);
router.post("/:id/messages", internalMessageController_1.sendInternalMessage);
router.patch("/:id/read", internalMessageController_1.markInternalConversationRead);
exports.default = router;
