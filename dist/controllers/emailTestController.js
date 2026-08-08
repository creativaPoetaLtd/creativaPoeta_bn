"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.testEmail = void 0;
const sendEmail_1 = __importDefault(require("../utils/sendEmail"));
const testEmail = async (req, res) => {
    try {
        console.log("🧪 Testing email configuration...");
        // Check environment variables
        const emailUser = process.env.EMAIL_USER;
        const emailPass = process.env.EMAIL_PASS;
        console.log("Environment check:");
        console.log(`EMAIL_USER: ${emailUser ? 'SET' : 'NOT SET'}`);
        console.log(`EMAIL_PASS: ${emailPass ? 'SET' : 'NOT SET'}`);
        if (!emailUser || !emailPass) {
            res.status(500).json({
                error: "Email credentials not configured",
                details: {
                    EMAIL_USER: !!emailUser,
                    EMAIL_PASS: !!emailPass,
                }
            });
            return;
        }
        // Send test email
        const testHtmlContent = `
      <h2>🧪 Email Test</h2>
      <p>This is a test email from your Creativa Poeta backend.</p>
      <p><strong>Server:</strong> ${process.env.NODE_ENV || 'development'}</p>
      <p><strong>Time:</strong> ${new Date().toISOString()}</p>
      <div style="background: #f0f0f0; padding: 10px; margin: 10px 0;">
        <strong>Environment Variables:</strong><br>
        EMAIL_USER: ${emailUser}<br>
        EMAIL_PASS: ${'*'.repeat(emailPass.length)}<br>
      </div>
    `;
        await (0, sendEmail_1.default)(emailUser, // Send to self
        "🧪 Email Test - Creativa Poeta Backend", testHtmlContent);
        res.status(200).json({
            success: true,
            message: "Test email sent successfully!",
            sentTo: emailUser,
            timestamp: new Date().toISOString()
        });
    }
    catch (error) {
        console.error("❌ Email test failed:", error);
        res.status(500).json({
            success: false,
            error: "Email test failed",
            details: error instanceof Error ? error.message : "Unknown error",
            timestamp: new Date().toISOString()
        });
    }
};
exports.testEmail = testEmail;
