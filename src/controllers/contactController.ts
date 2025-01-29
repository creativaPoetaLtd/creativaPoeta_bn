import { Request, Response, NextFunction } from "express";
import sendEmail from "../utils/sendEmail";
export const sendContactDetails = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        const { fullName, email, message } = req.body;

        if (!fullName || !email || !message) {
            res.status(400).json({ message: "Required fields are missing." });
            return;
        }

        const htmlContent = `
            <h2>New Contact Form Submission</h2>
            <p><strong>Full Name:</strong> ${fullName}</p>
            <p><strong>Email:</strong> ${email}</p>
            <p><strong>Message:</strong> ${message}</p>
        `;

        const recipientEmail = process.env.EMAIL_USER;

        if (!recipientEmail) {
            res.status(500).json({ message: "Recipient email is not configured." });
            return;
        }

        await sendEmail(recipientEmail, "New Contact Form Submission", htmlContent);

        res.status(200).json({ message: "Contact form submitted successfully!" });
    } catch (error) {
        next(error);
    }
};
