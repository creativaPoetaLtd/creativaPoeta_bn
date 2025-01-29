"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendProjectInquiry = void 0;
const sendEmail_1 = __importDefault(require("../utils/sendEmail"));
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
const sendProjectInquiry = (req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { name, email, phone, company, projectType, deliverables, mainGoal, audience, stylePreference, contentElements, budget, timeline, status, projectPurpose, additionalInfo, } = req.body;
        if (!name || !email || !phone || !projectType || !deliverables || !audience || !contentElements || !projectPurpose || !mainGoal || !stylePreference || !budget || !status) {
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
            yield (0, sendEmail_1.default)(emailUser, "New Project Inquiry", htmlContent);
            res.status(200).json({ message: "Inquiry sent successfully!" });
        }
        else {
            res.status(500).json({ message: "Email user is not defined." });
        }
        res.status(200).json({ message: "Inquiry sent successfully!" });
    }
    catch (error) {
        next(error);
    }
});
exports.sendProjectInquiry = sendProjectInquiry;
