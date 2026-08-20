"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteQuery = exports.releaseQuery = exports.claimQuery = exports.updateQueryStatus = exports.replyToQuery = exports.getQuery = exports.getAllQueries = exports.getContactSummary = exports.sendContactDetails = void 0;
const sendEmail_1 = __importDefault(require("../utils/sendEmail"));
const adminNotificationEmail_1 = require("../utils/adminNotificationEmail");
const Query_1 = __importDefault(require("../models/Query"));
const getAdminEmail = (req) => { var _a; return String(((_a = req.user) === null || _a === void 0 ? void 0 : _a.email) || "").toLowerCase().trim(); };
const getAdminName = (req) => { var _a, _b; return String(((_a = req.user) === null || _a === void 0 ? void 0 : _a.name) || ((_b = req.user) === null || _b === void 0 ? void 0 : _b.email) || "Admin").trim(); };
const addContactActivity = (query, req, type, message) => {
    query.activity = query.activity || [];
    query.activity.push({
        type,
        message,
        actorEmail: getAdminEmail(req),
        actorName: getAdminName(req),
        at: new Date(),
    });
};
const assignContactToCurrentUser = (query, req, message = "Ticket pris en charge") => {
    query.assignedToEmail = getAdminEmail(req);
    query.assignedToName = getAdminName(req);
    query.assignedAt = new Date();
    addContactActivity(query, req, "assigned", message);
};
const canModifyContactAssignment = (req, query) => !query.assignedToEmail || query.assignedToEmail === getAdminEmail(req);
// Submit contact form (public endpoint)
const sendContactDetails = async (req, res, next) => {
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
        const savedQuery = await newQuery.save();
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
            emailSent = await (0, adminNotificationEmail_1.sendAdminNotificationEmail)("New Contact Form Submission", htmlContent);
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
};
exports.sendContactDetails = sendContactDetails;
const getContactSummary = async (req, res) => {
    try {
        const currentEmail = getAdminEmail(req);
        const [pending, assignedToMe] = await Promise.all([
            Query_1.default.countDocuments({ status: "pending" }),
            Query_1.default.countDocuments({ assignedToEmail: currentEmail, status: { $ne: "closed" } }),
        ]);
        res.status(200).json({ metrics: { pending, assignedToMe, attention: pending + assignedToMe } });
    }
    catch (error) {
        res.status(500).json({ message: "Failed to fetch contact summary" });
    }
};
exports.getContactSummary = getContactSummary;
// Get all contact queries (admin only)
const getAllQueries = async (req, res) => {
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
        const queries = await Query_1.default.find(filter)
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit);
        const totalQueries = await Query_1.default.countDocuments(filter);
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
};
exports.getAllQueries = getAllQueries;
// Get single contact query (admin only)
const getQuery = async (req, res) => {
    try {
        const { id } = req.params;
        const query = await Query_1.default.findById(id);
        if (!query) {
            res.status(404).json({ message: "Query not found" });
            return;
        }
        addContactActivity(query, req, "opened", "Ticket ouvert");
        await query.save();
        res.status(200).json({
            message: "Query fetched successfully",
            query,
        });
    }
    catch (error) {
        res.status(500).json({ message: "Failed to fetch query" });
    }
};
exports.getQuery = getQuery;
// Reply to contact query (admin only)
const replyToQuery = async (req, res) => {
    var _a;
    try {
        const { id } = req.params;
        const { replyMessage, subject } = req.body;
        const userEmail = (_a = req.user) === null || _a === void 0 ? void 0 : _a.email;
        if (!replyMessage) {
            res.status(400).json({ message: "Reply message is required" });
            return;
        }
        const query = await Query_1.default.findById(id);
        if (!query) {
            res.status(404).json({ message: "Query not found" });
            return;
        }
        if (!query.assignedToEmail) {
            assignContactToCurrentUser(query, req, "Ticket pris en charge pendant la reponse");
        }
        else if (query.assignedToEmail !== getAdminEmail(req)) {
            addContactActivity(query, req, "replied", `Reponse envoyee alors que le ticket etait assigne a ${query.assignedToName || query.assignedToEmail}`);
        }
        // Update query with reply
        query.replyMessage = replyMessage;
        query.isReplied = true;
        query.repliedAt = new Date();
        query.repliedBy = userEmail;
        query.status = "replied";
        addContactActivity(query, req, "replied", `Reponse envoyee: ${subject || "Contact"}`);
        await query.save();
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
            await (0, sendEmail_1.default)(query.email, emailSubject, htmlContent);
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
};
exports.replyToQuery = replyToQuery;
// Update query status (admin only)
const updateQueryStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body;
        if (!["pending", "replied", "closed"].includes(status)) {
            res.status(400).json({ message: "Invalid status" });
            return;
        }
        const query = await Query_1.default.findById(id);
        if (!query) {
            res.status(404).json({ message: "Query not found" });
            return;
        }
        if (query.status !== status) {
            query.status = status;
            addContactActivity(query, req, "status", `Statut change en ${status}`);
            await query.save();
        }
        res.status(200).json({
            message: "Query status updated successfully",
            query,
        });
    }
    catch (error) {
        res.status(500).json({ message: "Failed to update query status" });
    }
};
exports.updateQueryStatus = updateQueryStatus;
const claimQuery = async (req, res) => {
    try {
        const query = await Query_1.default.findById(req.params.id);
        if (!query) {
            res.status(404).json({ message: "Query not found" });
            return;
        }
        if (!canModifyContactAssignment(req, query)) {
            res.status(409).json({
                message: `This ticket is already handled by ${query.assignedToName || query.assignedToEmail}.`,
                query,
            });
            return;
        }
        assignContactToCurrentUser(query, req);
        await query.save();
        res.status(200).json({ message: "Query assigned", query });
    }
    catch (error) {
        res.status(500).json({ message: "Failed to assign query" });
    }
};
exports.claimQuery = claimQuery;
const releaseQuery = async (req, res) => {
    try {
        const query = await Query_1.default.findById(req.params.id);
        if (!query) {
            res.status(404).json({ message: "Query not found" });
            return;
        }
        if (!canModifyContactAssignment(req, query)) {
            res.status(403).json({ message: "Only the assigned admin can release this ticket." });
            return;
        }
        const previousOwner = query.assignedToName || query.assignedToEmail || "un admin";
        query.assignedToEmail = undefined;
        query.assignedToName = undefined;
        query.assignedAt = undefined;
        addContactActivity(query, req, "released", `Ticket libere de ${previousOwner}`);
        await query.save();
        res.status(200).json({ message: "Query released", query });
    }
    catch (error) {
        res.status(500).json({ message: "Failed to release query" });
    }
};
exports.releaseQuery = releaseQuery;
// Delete contact query (admin only)
const deleteQuery = async (req, res) => {
    try {
        const { id } = req.params;
        const query = await Query_1.default.findByIdAndDelete(id);
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
};
exports.deleteQuery = deleteQuery;
