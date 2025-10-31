import nodemailer from "nodemailer";
import dotenv from "dotenv";

dotenv.config();

const sendEmail = async (
    to: string,
    subject: string,
    htmlContent: string,
    attachments?: { filename: string; path: string }[]
): Promise<void> => {
    try {
        // Detailed logging for debugging
        console.log("🔧 Email Configuration Check:");
        console.log(`EMAIL_USER exists: ${!!process.env.EMAIL_USER}`);
        console.log(`EMAIL_PASS exists: ${!!process.env.EMAIL_PASS}`);
        console.log(`EMAIL_USER value: ${process.env.EMAIL_USER ? process.env.EMAIL_USER.substring(0, 5) + '...' : 'undefined'}`);
        
        if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
            throw new Error("Email credentials not configured. Missing EMAIL_USER or EMAIL_PASS environment variables.");
        }

        console.log("📧 Creating transporter...");
        const transporter = nodemailer.createTransporter({
            service: "gmail",
            auth: {
                user: process.env.EMAIL_USER,
                pass: process.env.EMAIL_PASS,
            },
            // Additional options for production
            pool: true,
            maxConnections: 5,
            maxMessages: 100,
            rateDelta: 20000,
            rateLimit: 5,
        });

        // Verify transporter configuration
        console.log("🔍 Verifying transporter...");
        await transporter.verify();
        console.log("✅ Transporter verified successfully");

        const mailOptions = {
            from: `"Creativa Poeta" <${process.env.EMAIL_USER}>`,
            to,
            subject,
            html: htmlContent,
            attachments,
        };

        console.log(`📤 Sending email to: ${to}`);
        console.log(`📋 Subject: ${subject}`);
        
        const result = await transporter.sendMail(mailOptions);
        console.log(`✅ Email sent successfully to ${to}`);
        console.log(`📧 Message ID: ${result.messageId}`);
        
    } catch (error) {
        console.error("❌ Email sending failed:", error);
        
        // More detailed error logging
        if (error instanceof Error) {
            console.error("Error name:", error.name);
            console.error("Error message:", error.message);
            console.error("Error stack:", error.stack);
        }
        
        // Check for specific Gmail errors
        if (error instanceof Error) {
            if (error.message.includes("Invalid login")) {
                console.error("🚨 Gmail Authentication Error: Check if app password is correct and 2FA is enabled");
            } else if (error.message.includes("Less secure app")) {
                console.error("🚨 Gmail Security Error: Enable 2FA and use App Password instead of regular password");
            } else if (error.message.includes("ENOTFOUND") || error.message.includes("ECONNREFUSED")) {
                console.error("🚨 Network Error: Cannot connect to Gmail SMTP server");
            }
        }
        
        throw new Error(`Failed to send email: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
};

export default sendEmail;
