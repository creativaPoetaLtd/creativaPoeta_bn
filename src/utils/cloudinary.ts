import { v2 as cloudinary } from "cloudinary";
import streamifier from "streamifier";
import dotenv from "dotenv";

dotenv.config();

// Configure Cloudinary with your credentials
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME, // Your Cloudinary cloud name
  api_key: process.env.CLOUDINARY_API_KEY,       // Your Cloudinary API key
  api_secret: process.env.CLOUDINARY_API_SECRET, // Your Cloudinary API secret
});

export default cloudinary;

export const uploadToCloudinary = (fileBuffer: Buffer, folder: string) =>
  new Promise((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
          { folder },
          (error, result) => {
              if (result) resolve(result);
              else reject(error);
          }
      );

      streamifier.createReadStream(fileBuffer).pipe(uploadStream);
  });