"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendJobApplication = void 0;
const sendEmail_1 = __importDefault(require("../utils/sendEmail"));
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
const sendJobApplication = async (req, res, next) => {
    try {
        const { fullName, email, phone, linkedin, currentJobTitle, yearsOfExperience, desiredJobTitles, skills, education, certifications, languages, references, preferredLocation, additionalComments, } = req.body;
        if (!fullName || !email || !phone || !currentJobTitle || !yearsOfExperience || !desiredJobTitles || !skills.length || !education) {
            res.status(400).json({ message: "All fields are missing." });
            return;
        }
        // Construct the HTML content for the email
        const htmlContent = `
            <h2>New Job Application</h2>
            <p><strong>Full Name:</strong> ${fullName}</p>
            <p><strong>Email:</strong> ${email}</p>
            <p><strong>Phone:</strong> ${phone}</p>
            <p><strong>LinkedIn:</strong> ${linkedin || "N/A"}</p>
            <p><strong>Current Job Title:</strong> ${currentJobTitle}</p>
            <p><strong>Years of Experience:</strong> ${yearsOfExperience}</p>
            <p><strong>Desired Job Titles:</strong> ${desiredJobTitles}</p>
            <p><strong>Skills:</strong> ${skills.length ? skills.join(", ") : "N/A"}</p>
            <p><strong>Education:</strong> ${education}</p>
            <p><strong>Certifications:</strong> ${certifications || "N/A"}</p>
            <p><strong>Languages:</strong> ${languages || "N/A"}</p>
            <p><strong>References:</strong> ${references || "N/A"}</p>
            <p><strong>Preferred Location:</strong> ${preferredLocation || "N/A"}</p>
            <p><strong>Additional Comments:</strong> ${additionalComments || "N/A"}</p>
        `;
        // Handle the file upload if it exists
        const file = req.file;
        // Send the email
        const emailUser = process.env.EMAIL_USER;
        if (!emailUser) {
            res.status(500).json({ message: "Email user is not defined." });
            return;
        }
        // Send email with attachment
        await (0, sendEmail_1.default)(emailUser, "New Job Application", htmlContent);
        await (0, sendEmail_1.default)(emailUser, "New Job Application", htmlContent);
        res.status(200).json({ message: "Job application sent successfully!" });
    }
    catch (error) {
        next(error);
    }
};
exports.sendJobApplication = sendJobApplication;
