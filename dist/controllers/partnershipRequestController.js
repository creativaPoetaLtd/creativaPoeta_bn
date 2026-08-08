"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.deletePartnershipRequest = exports.replyToPartnershipRequest = exports.updatePartnershipRequestStatus = exports.releasePartnershipRequest = exports.claimPartnershipRequest = exports.getPartnershipRequest = exports.getPartnershipRequests = exports.getPartnershipRequestSummary = exports.createPartnershipRequest = void 0;
const PartnershipRequest_1 = __importDefault(require("../models/PartnershipRequest"));
const sendEmail_1 = __importDefault(require("../utils/sendEmail"));
const validStatuses = [
    "pending",
    "in_progress",
    "replied",
    "closed",
];
const clean = (value, maxLength = 5000) => String(value || "").trim().slice(0, maxLength);
const escapeHtml = (value) => clean(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
const getAdminEmail = (req) => { var _a; return clean((_a = req.user) === null || _a === void 0 ? void 0 : _a.email, 320).toLowerCase(); };
const getAdminName = (req) => { var _a, _b; return clean(((_a = req.user) === null || _a === void 0 ? void 0 : _a.name) || ((_b = req.user) === null || _b === void 0 ? void 0 : _b.email) || "Admin", 200); };
const addActivity = (request, req, type, message) => {
    request.activity = request.activity || [];
    request.activity.push({
        type,
        message,
        actorEmail: getAdminEmail(req),
        actorName: getAdminName(req),
        at: new Date(),
    });
};
const assignToCurrentAdmin = (request, req, message) => {
    request.assignedToEmail = getAdminEmail(req);
    request.assignedToName = getAdminName(req);
    request.assignedAt = new Date();
    addActivity(request, req, "assigned", message);
};
const createPartnershipRequest = async (req, res, next) => {
    var _a, _b, _c, _d, _e, _f, _g;
    try {
        const name = clean((_a = req.body) === null || _a === void 0 ? void 0 : _a.name, 200);
        const company = clean((_b = req.body) === null || _b === void 0 ? void 0 : _b.company, 200);
        const email = clean((_c = req.body) === null || _c === void 0 ? void 0 : _c.email, 320).toLowerCase();
        const phone = clean((_d = req.body) === null || _d === void 0 ? void 0 : _d.phone, 80);
        const partnershipType = clean((_e = req.body) === null || _e === void 0 ? void 0 : _e.partnershipType, 160);
        const locale = clean((_f = req.body) === null || _f === void 0 ? void 0 : _f.locale, 12) || "fr";
        const message = clean((_g = req.body) === null || _g === void 0 ? void 0 : _g.message, 5000);
        if (!name || !email || !partnershipType || !message) {
            res.status(400).json({ message: "Required fields are missing." });
            return;
        }
        const request = await PartnershipRequest_1.default.create({
            name,
            company,
            email,
            phone,
            partnershipType,
            locale,
            message,
        });
        let emailSent = false;
        const recipientEmail = process.env.EMAIL_USER;
        if (recipientEmail) {
            try {
                await (0, sendEmail_1.default)(recipientEmail, `New partnership request - ${company || name}`, `<h2>New partnership request</h2>
           <p><strong>Name:</strong> ${escapeHtml(name)}</p>
           <p><strong>Company:</strong> ${escapeHtml(company || "-")}</p>
           <p><strong>Email:</strong> ${escapeHtml(email)}</p>
           <p><strong>Phone:</strong> ${escapeHtml(phone || "-")}</p>
           <p><strong>Type:</strong> ${escapeHtml(partnershipType)}</p>
           <p><strong>Language:</strong> ${escapeHtml(locale)}</p>
           <p><strong>Message:</strong><br>${escapeHtml(message).replace(/\n/g, "<br>")}</p>`);
                emailSent = true;
            }
            catch (emailError) {
                console.error("Partnership notification email failed:", emailError);
            }
        }
        res.status(201).json({
            message: "Partnership request submitted successfully.",
            requestId: request._id,
            status: request.status,
            emailSent,
        });
    }
    catch (error) {
        next(error);
    }
};
exports.createPartnershipRequest = createPartnershipRequest;
const getPartnershipRequestSummary = async (req, res) => {
    try {
        const currentEmail = getAdminEmail(req);
        const [pending, inProgress, assignedToMe] = await Promise.all([
            PartnershipRequest_1.default.countDocuments({ status: "pending" }),
            PartnershipRequest_1.default.countDocuments({ status: "in_progress" }),
            PartnershipRequest_1.default.countDocuments({
                assignedToEmail: currentEmail,
                status: { $ne: "closed" },
            }),
        ]);
        res.status(200).json({
            metrics: {
                pending,
                inProgress,
                assignedToMe,
                attention: pending + assignedToMe,
            },
        });
    }
    catch (error) {
        res.status(500).json({ message: "Failed to fetch partnership request summary." });
    }
};
exports.getPartnershipRequestSummary = getPartnershipRequestSummary;
const getPartnershipRequests = async (req, res) => {
    try {
        const page = Math.max(1, Number(req.query.page) || 1);
        const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 25));
        const status = clean(req.query.status, 40);
        const filter = {};
        if (status && status !== "all" && validStatuses.includes(status)) {
            filter.status = status;
        }
        const [requests, totalRequests] = await Promise.all([
            PartnershipRequest_1.default.find(filter)
                .sort({ createdAt: -1 })
                .skip((page - 1) * limit)
                .limit(limit),
            PartnershipRequest_1.default.countDocuments(filter),
        ]);
        res.status(200).json({
            requests,
            pagination: {
                currentPage: page,
                totalPages: Math.max(1, Math.ceil(totalRequests / limit)),
                totalRequests,
                limit,
            },
        });
    }
    catch (error) {
        res.status(500).json({ message: "Failed to fetch partnership requests." });
    }
};
exports.getPartnershipRequests = getPartnershipRequests;
const getPartnershipRequest = async (req, res) => {
    try {
        const request = await PartnershipRequest_1.default.findById(req.params.id);
        if (!request) {
            res.status(404).json({ message: "Partnership request not found." });
            return;
        }
        addActivity(request, req, "opened", "Partnership request opened");
        await request.save();
        res.status(200).json({ request });
    }
    catch (error) {
        res.status(500).json({ message: "Failed to fetch partnership request." });
    }
};
exports.getPartnershipRequest = getPartnershipRequest;
const claimPartnershipRequest = async (req, res) => {
    try {
        const request = await PartnershipRequest_1.default.findById(req.params.id);
        if (!request) {
            res.status(404).json({ message: "Partnership request not found." });
            return;
        }
        if (request.assignedToEmail && request.assignedToEmail !== getAdminEmail(req)) {
            res.status(409).json({ message: "This request is already assigned." });
            return;
        }
        assignToCurrentAdmin(request, req, "Partnership request assigned");
        if (request.status === "pending")
            request.status = "in_progress";
        await request.save();
        res.status(200).json({ request });
    }
    catch (error) {
        res.status(500).json({ message: "Failed to assign partnership request." });
    }
};
exports.claimPartnershipRequest = claimPartnershipRequest;
const releasePartnershipRequest = async (req, res) => {
    try {
        const request = await PartnershipRequest_1.default.findById(req.params.id);
        if (!request) {
            res.status(404).json({ message: "Partnership request not found." });
            return;
        }
        if (request.assignedToEmail && request.assignedToEmail !== getAdminEmail(req)) {
            res.status(409).json({ message: "This request is assigned to another admin." });
            return;
        }
        const previousOwner = request.assignedToName || request.assignedToEmail || "an admin";
        request.assignedToEmail = undefined;
        request.assignedToName = undefined;
        request.assignedAt = undefined;
        addActivity(request, req, "released", `Partnership request released by ${previousOwner}`);
        await request.save();
        res.status(200).json({ request });
    }
    catch (error) {
        res.status(500).json({ message: "Failed to release partnership request." });
    }
};
exports.releasePartnershipRequest = releasePartnershipRequest;
const updatePartnershipRequestStatus = async (req, res) => {
    var _a;
    try {
        const status = clean((_a = req.body) === null || _a === void 0 ? void 0 : _a.status, 40);
        if (!validStatuses.includes(status)) {
            res.status(400).json({ message: "Invalid status." });
            return;
        }
        const request = await PartnershipRequest_1.default.findById(req.params.id);
        if (!request) {
            res.status(404).json({ message: "Partnership request not found." });
            return;
        }
        request.status = status;
        addActivity(request, req, "status", `Status changed to ${status}`);
        await request.save();
        res.status(200).json({ request });
    }
    catch (error) {
        res.status(500).json({ message: "Failed to update partnership request." });
    }
};
exports.updatePartnershipRequestStatus = updatePartnershipRequestStatus;
const replyToPartnershipRequest = async (req, res) => {
    var _a, _b;
    try {
        const replyMessage = clean((_a = req.body) === null || _a === void 0 ? void 0 : _a.replyMessage, 10000);
        const subject = clean((_b = req.body) === null || _b === void 0 ? void 0 : _b.subject, 300) || "Re: Partnership with Creativa Poeta";
        if (!replyMessage) {
            res.status(400).json({ message: "Reply message is required." });
            return;
        }
        const request = await PartnershipRequest_1.default.findById(req.params.id);
        if (!request) {
            res.status(404).json({ message: "Partnership request not found." });
            return;
        }
        if (!request.assignedToEmail) {
            assignToCurrentAdmin(request, req, "Partnership request assigned while replying");
        }
        await (0, sendEmail_1.default)(request.email, subject, `<p>Hello ${escapeHtml(request.name)},</p>
       <div>${escapeHtml(replyMessage).replace(/\n/g, "<br>")}</div>
       <p>Creativa Poeta</p>`);
        request.replyMessage = replyMessage;
        request.repliedAt = new Date();
        request.repliedBy = getAdminEmail(req);
        request.status = "replied";
        addActivity(request, req, "replied", `Reply sent: ${subject}`);
        await request.save();
        res.status(200).json({ request, emailSent: true });
    }
    catch (error) {
        console.error("Partnership reply failed:", error);
        res.status(500).json({ message: "Failed to send partnership reply." });
    }
};
exports.replyToPartnershipRequest = replyToPartnershipRequest;
const deletePartnershipRequest = async (req, res) => {
    try {
        const request = await PartnershipRequest_1.default.findByIdAndDelete(req.params.id);
        if (!request) {
            res.status(404).json({ message: "Partnership request not found." });
            return;
        }
        res.status(200).json({ message: "Partnership request deleted." });
    }
    catch (error) {
        res.status(500).json({ message: "Failed to delete partnership request." });
    }
};
exports.deletePartnershipRequest = deletePartnershipRequest;
