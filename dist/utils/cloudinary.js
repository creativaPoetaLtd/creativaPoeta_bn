"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.uploadToCloudinary = void 0;
const cloudinary_1 = require("cloudinary");
const streamifier_1 = __importDefault(require("streamifier"));
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
// Configure Cloudinary with your credentials
cloudinary_1.v2.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME, // Your Cloudinary cloud name
    api_key: process.env.CLOUDINARY_API_KEY, // Your Cloudinary API key
    api_secret: process.env.CLOUDINARY_API_SECRET, // Your Cloudinary API secret
});
exports.default = cloudinary_1.v2;
const uploadToCloudinary = (fileBuffer, folder) => new Promise((resolve, reject) => {
    const uploadStream = cloudinary_1.v2.uploader.upload_stream({ folder }, (error, result) => {
        if (result)
            resolve(result);
        else
            reject(error);
    });
    streamifier_1.default.createReadStream(fileBuffer).pipe(uploadStream);
});
exports.uploadToCloudinary = uploadToCloudinary;
