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
exports.sendContactDetails = void 0;
const sendEmail_1 = __importDefault(require("../utils/sendEmail"));
const sendContactDetails = (req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
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
        yield (0, sendEmail_1.default)(recipientEmail, "New Contact Form Submission", htmlContent);
        res.status(200).json({ message: "Contact form submitted successfully!" });
    }
    catch (error) {
        next(error);
    }
});
exports.sendContactDetails = sendContactDetails;
