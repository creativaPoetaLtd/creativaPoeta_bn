import { Request, Response } from "express";
import sendEmail from "../utils/sendEmail";
import { getAdminNotificationEmail } from "../utils/adminNotificationEmail";

export const testEmail = async (req: Request, res: Response): Promise<void> => {
  try {
    console.log("🧪 Testing email configuration...");
    
    const recipientEmail = getAdminNotificationEmail();
    
    if (!recipientEmail) {
      res.status(500).json({
        error: "Administrative notification recipient is not configured",
        details: {
          ADMIN_NOTIFICATION_EMAIL: !!recipientEmail,
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
    `;

    await sendEmail(
      recipientEmail,
      "🧪 Email Test - Creativa Poeta Backend",
      testHtmlContent
    );

    res.status(200).json({
      success: true,
      message: "Test email sent successfully!",
      sentTo: recipientEmail,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error("❌ Email test failed:", error);
    
    res.status(500).json({
      success: false,
      error: "Email test failed",
      details: error instanceof Error ? error.message : "Unknown error",
      timestamp: new Date().toISOString()
    });
  }
};
