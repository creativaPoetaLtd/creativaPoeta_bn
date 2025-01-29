import { Request, Response, NextFunction } from "express";
import sendEmail from "../utils/sendEmail";
import dotenv from "dotenv";

dotenv.config();
export const sendProjectInquiry = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        const {
            name,
            email,
            phone,
            company,
            projectType,
            deliverables,
            mainGoal,
            audience,
            stylePreference,
            contentElements,
            budget,
            timeline,
            status,
            projectPurpose,
            additionalInfo,
        } = req.body;

        if (!name || !email || !phone || !projectType || !deliverables || !audience || !contentElements || !projectPurpose || !mainGoal || !stylePreference || !budget || !status ) {
            res.status(400).json({ message: "All fields are missing." });
            return;
        }

        // Construct the HTML content for the email
        const htmlContent = `
            <h2>New Project Inquiry</h2>
            <p><strong>Name:</strong> ${name}</p>
            <p><strong>Email:</strong> ${email}</p>
            <p><strong>Phone:</strong> ${phone}</p>
            <p><strong>Company:</strong> ${company || "N/A"}</p>
            <p><strong>Project Type:</strong> ${projectType}</p>
            <p><strong>Deliverables:</strong> ${deliverables.length ? deliverables.join(", ") : "N/A"}</p>
            <p><strong>Main Goal:</strong> ${mainGoal || "N/A"}</p>
            <p><strong>Audience:</strong> ${audience.length ? audience.join(", ") : "N/A"}</p>
            <p><strong>Style Preference:</strong> ${stylePreference || "N/A"}</p>
            <p><strong>Content Elements:</strong> ${contentElements.length ? contentElements.join(", ") : "N/A"}</p>
            <p><strong>Budget:</strong> ${budget || "N/A"}</p>
            <p><strong>Timeline:</strong> ${timeline || "N/A"}</p>
            <p><strong>Status:</strong> ${status || "N/A"}</p>
            <p><strong>Project Purpose:</strong> ${projectPurpose.length ? projectPurpose.join(", ") : "N/A"}</p>
            <p><strong>Additional Information:</strong> ${additionalInfo || "N/A"}</p>
        `;

        // Send the email
        const emailUser = process.env.EMAIL_USER;
        if (!emailUser) {
            
             res.status(500).json({ message: "Email user is not defined." });
        }
        if (emailUser) {
            await sendEmail(emailUser, "New Project Inquiry", htmlContent);
            res.status(200).json({ message: "Inquiry sent successfully!" });
        } else {
            res.status(500).json({ message: "Email user is not defined." });
        }

        res.status(200).json({ message: "Inquiry sent successfully!" });
    } catch (error) {
        next(error);
    }
};
