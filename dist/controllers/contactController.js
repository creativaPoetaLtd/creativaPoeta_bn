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
exports.deleteQuery = exports.updateQueryStatus = exports.replyToQuery = exports.getQuery = exports.getAllQueries = exports.sendContactDetails = void 0;
const sendEmail_1 = __importDefault(require("../utils/sendEmail"));
const Query_1 = __importDefault(require("../models/Query"));
// Submit contact form (public endpoint)
const sendContactDetails = (req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { fullName, email, message } = req.body;
        if (!fullName || !email || !message) {
            res.status(400).json({ message: "Required fields are missing." });
            return;
        }
        // Save to database
        const newQuery = new Query_1.default({
            name: fullName,
            email,
            message,
            status: "pending",
            isReplied: false,
        });
        const savedQuery = yield newQuery.save();
        // Send email notification
        let emailSent = false;
        try {
            const htmlContent = `
                <h2>New Contact Form Submission</h2>
                <p><strong>Query ID:</strong> ${savedQuery._id}</p>
                <p><strong>Full Name:</strong> ${fullName}</p>
                <p><strong>Email:</strong> ${email}</p>
                <p><strong>Message:</strong> ${message}</p>
                <p><strong>Submitted At:</strong> ${savedQuery.createdAt}</p>
            `;
            const recipientEmail = process.env.EMAIL_USER;
            if (recipientEmail) {
                yield (0, sendEmail_1.default)(recipientEmail, "New Contact Form Submission", htmlContent);
                emailSent = true;
            }
        }
        catch (emailError) {
            console.error("Email sending failed:", emailError);
            // Don't fail the request if email fails
        }
        res.status(200).json({
            message: "Contact form submitted successfully!",
            queryId: savedQuery._id,
            status: "pending",
            emailSent,
        });
    }
    catch (error) {
        next(error);
    }
});
exports.sendContactDetails = sendContactDetails;
// Get all contact queries (admin only)
const getAllQueries = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const status = req.query.status;
        // Build filter
        const filter = {};
        if (status && status !== "all") {
            filter.status = status;
        }
        // Get queries with pagination
        const skip = (page - 1) * limit;
        const queries = yield Query_1.default.find(filter)
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit);
        const totalQueries = yield Query_1.default.countDocuments(filter);
        const totalPages = Math.ceil(totalQueries / limit);
        res.status(200).json({
            message: "Queries fetched successfully",
            queries,
            pagination: {
                currentPage: page,
                totalPages,
                totalQueries,
                limit,
            },
        });
    }
    catch (error) {
        res.status(500).json({ message: "Failed to fetch queries" });
    }
});
exports.getAllQueries = getAllQueries;
// Get single contact query (admin only)
const getQuery = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { id } = req.params;
        const query = yield Query_1.default.findById(id);
        if (!query) {
            res.status(404).json({ message: "Query not found" });
            return;
        }
        res.status(200).json({
            message: "Query fetched successfully",
            query,
        });
    }
    catch (error) {
        res.status(500).json({ message: "Failed to fetch query" });
    }
});
exports.getQuery = getQuery;
// Reply to contact query (admin only)
const replyToQuery = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        const { id } = req.params;
        const { replyMessage, subject } = req.body;
        const userEmail = (_a = req.user) === null || _a === void 0 ? void 0 : _a.email;
        if (!replyMessage) {
            res.status(400).json({ message: "Reply message is required" });
            return;
        }
        const query = yield Query_1.default.findById(id);
        if (!query) {
            res.status(404).json({ message: "Query not found" });
            return;
        }
        // Update query with reply
        query.replyMessage = replyMessage;
        query.isReplied = true;
        query.repliedAt = new Date();
        query.repliedBy = userEmail;
        query.status = "replied";
        yield query.save();
        // Send reply email
        let emailSent = false;
        try {
            const emailSubject = subject || `Re: Your Contact Form Inquiry`;
            const htmlContent = `
                <h2>Reply to Your Contact Form Inquiry</h2>
                <p>Dear ${query.name},</p>
                <p>Thank you for contacting us. Here is our response:</p>
                <div style="background-color: #f5f5f5; padding: 15px; margin: 10px 0; border-left: 4px solid #007bff;">
                    ${replyMessage.replace(/\n/g, "<br>")}
                </div>
                <p>If you have any further questions, please don't hesitate to reach out.</p>
                <p>Best regards,<br>Creativa Poeta Team</p>
                
                <hr style="margin: 20px 0;">
                <h3>Original Message:</h3>
                <p><strong>Your Message:</strong> ${query.message}</p>
                <p><strong>Submitted:</strong> ${query.createdAt}</p>
            `;
            yield (0, sendEmail_1.default)(query.email, emailSubject, htmlContent);
            emailSent = true;
        }
        catch (emailError) {
            console.error("Reply email sending failed:", emailError);
            // Don't fail the request if email fails
        }
        res.status(200).json({
            message: "Reply sent successfully",
            query,
            emailSent,
        });
    }
    catch (error) {
        res.status(500).json({ message: "Failed to send reply" });
    }
});
exports.replyToQuery = replyToQuery;
// Update query status (admin only)
const updateQueryStatus = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { id } = req.params;
        const { status } = req.body;
        if (!["pending", "replied", "closed"].includes(status)) {
            res.status(400).json({ message: "Invalid status" });
            return;
        }
        const query = yield Query_1.default.findByIdAndUpdate(id, { status }, { new: true });
        if (!query) {
            res.status(404).json({ message: "Query not found" });
            return;
        }
        res.status(200).json({
            message: "Query status updated successfully",
            query,
        });
    }
    catch (error) {
        res.status(500).json({ message: "Failed to update query status" });
    }
});
exports.updateQueryStatus = updateQueryStatus;
// Delete contact query (admin only)
const deleteQuery = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { id } = req.params;
        const query = yield Query_1.default.findByIdAndDelete(id);
        if (!query) {
            res.status(404).json({ message: "Query not found" });
            return;
        }
        res.status(200).json({
            message: "Query deleted successfully",
        });
    }
    catch (error) {
        res.status(500).json({ message: "Failed to delete query" });
    }
});
exports.deleteQuery = deleteQuery;
