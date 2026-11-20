"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const multer_1 = __importDefault(require("multer"));
const authMiddleware_1 = require("../middleware/authMiddleware");
const permissionMiddleware_1 = require("../middleware/permissionMiddleware");
const artController_1 = require("../controllers/artController");
const artCommerceController_1 = require("../controllers/artCommerceController");
const artTranslationController_1 = require("../controllers/artTranslationController");
const router = express_1.default.Router();
router.post("/checkout", artCommerceController_1.createArtCheckout);
router.post("/orders/status", artCommerceController_1.getArtOrderStatus);
router.post("/stripe/webhook", artCommerceController_1.receiveArtStripeWebhook);
router.get("/admin/settings", authMiddleware_1.authenticateUser, (0, permissionMiddleware_1.authorizeAdminPermission)("art:settings"), artCommerceController_1.getArtSettings);
router.put("/admin/settings", authMiddleware_1.authenticateUser, (0, permissionMiddleware_1.authorizeAdminPermission)("art:settings"), artCommerceController_1.saveArtSettings);
router.get("/admin/orders", authMiddleware_1.authenticateUser, (0, permissionMiddleware_1.authorizeAdminPermission)("art:orders"), artCommerceController_1.listArtOrders);
router.patch("/admin/orders/:id", authMiddleware_1.authenticateUser, (0, permissionMiddleware_1.authorizeAdminPermission)("art:orders"), artCommerceController_1.updateArtOrder);
const catalogue = (0, permissionMiddleware_1.authorizeAdminPermission)("art:catalog");
const requests = (0, permissionMiddleware_1.authorizeAdminPermission)("art:requests");
router.post("/admin/translate", authMiddleware_1.authenticateUser, catalogue, artTranslationController_1.translateArt);
const upload = (0, multer_1.default)({ storage: multer_1.default.memoryStorage(), limits: { fileSize: 3 * 1024 * 1024, files: 1 }, fileFilter: (_req, file, callback) => {
        if (["image/jpeg", "image/png", "image/webp"].includes(file.mimetype))
            callback(null, true);
        else
            callback(new Error("Utilisez une image JPEG, PNG ou WebP (3 Mo maximum)."));
    } });
router.get("/catalog", artController_1.listPublicArt);
router.post("/quote", artController_1.getArtQuote);
router.post("/requests", artController_1.createArtRequest);
router.get("/admin/shipping-profiles", authMiddleware_1.authenticateUser, catalogue, artCommerceController_1.getArtShippingProfiles);
router.get("/admin/artworks", authMiddleware_1.authenticateUser, catalogue, artController_1.listAdminArt);
router.post("/admin/artworks", authMiddleware_1.authenticateUser, catalogue, artController_1.createArt);
router.patch("/admin/artworks/:id", authMiddleware_1.authenticateUser, catalogue, artController_1.updateArt);
router.post("/admin/images", authMiddleware_1.authenticateUser, catalogue, (req, res, next) => {
    upload.single("image")(req, res, error => { if (error) {
        res.status(400).json({ message: error.message });
        return;
    } next(); });
}, artController_1.uploadArtImage);
router.get("/admin/requests", authMiddleware_1.authenticateUser, requests, artController_1.listArtRequests);
router.patch("/admin/requests/:id", authMiddleware_1.authenticateUser, requests, artController_1.updateArtRequest);
exports.default = router;
