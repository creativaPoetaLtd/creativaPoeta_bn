import express from "express";
import multer from "multer";
import { authenticateUser } from "../middleware/authMiddleware";
import { authorizeAdminPermission } from "../middleware/permissionMiddleware";
import { createArt, createArtRequest, getArtQuote, listAdminArt, listArtRequests, listPublicArt, updateArt, updateArtRequest, uploadArtImage } from "../controllers/artController";

const router = express.Router();
const catalogue = authorizeAdminPermission("art:catalog");
const requests = authorizeAdminPermission("art:requests");
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 3 * 1024 * 1024, files: 1 }, fileFilter: (_req, file, callback) => {
  if (["image/jpeg", "image/png", "image/webp"].includes(file.mimetype)) callback(null, true);
  else callback(new Error("Utilisez une image JPEG, PNG ou WebP (3 Mo maximum)."));
} });
router.get("/catalog", listPublicArt);
router.post("/quote", getArtQuote);
router.post("/requests", createArtRequest);
router.get("/admin/artworks", authenticateUser, catalogue, listAdminArt);
router.post("/admin/artworks", authenticateUser, catalogue, createArt);
router.patch("/admin/artworks/:id", authenticateUser, catalogue, updateArt);
router.post("/admin/images", authenticateUser, catalogue, (req, res, next) => {
  upload.single("image")(req, res, error => { if (error) { res.status(400).json({ message: error.message }); return; } next(); });
}, uploadArtImage);
router.get("/admin/requests", authenticateUser, requests, listArtRequests);
router.patch("/admin/requests/:id", authenticateUser, requests, updateArtRequest);
export default router;
