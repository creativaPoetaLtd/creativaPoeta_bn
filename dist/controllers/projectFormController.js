"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteProjectRequest = exports.releaseProjectRequest = exports.claimProjectRequest = exports.updateProjectRequestStatus = exports.replyToProjectRequest = exports.getProjectRequest = exports.getAllProjectRequests = exports.getProjectRequestSummary = exports.sendProjectInquiry = exports.renderProjectReplyContent = void 0;
const sendEmail_1 = __importDefault(require("../utils/sendEmail"));
const adminNotificationEmail_1 = require("../utils/adminNotificationEmail");
const emailTemplate_1 = require("../utils/emailTemplate");
const ProjectDescription_1 = __importDefault(require("../models/ProjectDescription"));
const dotenv_1 = __importDefault(require("dotenv"));
const communicationLocale_1 = require("../utils/communicationLocale");
dotenv_1.default.config();
const renderProjectReplyContent = (replyMessage) => (0, emailTemplate_1.formatParagraphs)(String(replyMessage || "").trim());
exports.renderProjectReplyContent = renderProjectReplyContent;
const getAdminEmail = (req) => { var _a; return String(((_a = req.user) === null || _a === void 0 ? void 0 : _a.email) || "").toLowerCase().trim(); };
const getAdminName = (req) => { var _a, _b; return String(((_a = req.user) === null || _a === void 0 ? void 0 : _a.name) || ((_b = req.user) === null || _b === void 0 ? void 0 : _b.email) || "Admin").trim(); };
const addProjectActivity = (request, req, type, message) => {
    request.activity = request.activity || [];
    request.activity.push({
        type,
        message,
        actorEmail: getAdminEmail(req),
        actorName: getAdminName(req),
        at: new Date(),
    });
};
const assignProjectToCurrentUser = (request, req, message = "Ticket pris en charge") => {
    request.assignedToEmail = getAdminEmail(req);
    request.assignedToName = getAdminName(req);
    request.assignedAt = new Date();
    addProjectActivity(request, req, "assigned", message);
};
const canModifyProjectAssignment = (req, request) => !request.assignedToEmail || request.assignedToEmail === getAdminEmail(req);
const getProjectBucket = (request) => {
    const serviceType = String(request.serviceType || "").toLowerCase();
    const selected = Array.isArray(request.selectedServices) ? request.selectedServices.join(" ").toLowerCase() : "";
    if (serviceType.includes("diagnostic visibilite") || serviceType.includes("visibility test") || selected.includes("test visibilite"))
        return "visibility";
    if (serviceType.includes("assistance numerique") || serviceType.includes("digital assistance") || serviceType.includes("depannage") || selected.includes("depannage") || selected.includes("troubleshooting"))
        return "assistance";
    return "projects";
};
const sendProjectInquiry = async (req, res, next) => {
    try {
        const { name, email, phone, company, serviceType, selectedServices, customServiceDescription, customServiceNeeds, serviceSpecificOtherDescription, additionalInfo, locale, } = req.body;
        // Basic required field validation
        if (!name || !email || !phone || !serviceType) {
            res.status(400).json({
                message: "Name, email, phone, and service type are required.",
            });
            return;
        }
        // Create and save project request to database
        const projectRequest = new ProjectDescription_1.default({
            name: name.trim(),
            email: email.trim().toLowerCase(),
            phone: phone.trim(),
            company: company === null || company === void 0 ? void 0 : company.trim(),
            serviceType: serviceType.trim(),
            selectedServices: Array.isArray(selectedServices)
                ? selectedServices.map((s) => s.trim())
                : selectedServices
                    ? [selectedServices.trim()]
                    : [],
            customServiceDescription: customServiceDescription === null || customServiceDescription === void 0 ? void 0 : customServiceDescription.trim(),
            customServiceNeeds: customServiceNeeds === null || customServiceNeeds === void 0 ? void 0 : customServiceNeeds.trim(),
            serviceSpecificOtherDescription: serviceSpecificOtherDescription === null || serviceSpecificOtherDescription === void 0 ? void 0 : serviceSpecificOtherDescription.trim(),
            additionalInfo: additionalInfo === null || additionalInfo === void 0 ? void 0 : additionalInfo.trim(),
            locale: (0, communicationLocale_1.normalizeCommunicationLocale)(locale),
            // status will default to "pending" from the model
        });
        const savedRequest = await projectRequest.save();
        // Construct the beautiful HTML content for the email
        const htmlContent = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>New Project Inquiry</title>
    <style>
        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            line-height: 1.6;
            margin: 0;
            padding: 0;
            background-color: #f4f7fa;
        }
        .email-container {
            max-width: 700px;
            margin: 20px auto;
            background: white;
            border-radius: 12px;
            box-shadow: 0 8px 32px rgba(0, 0, 0, 0.1);
            overflow: hidden;
        }
        .header {
            background: linear-gradient(135deg, #EEBA2B 0%, #D4A017 100%);
            color: white;
            padding: 30px;
            text-align: center;
        }
        .header h1 {
            margin: 0;
            font-size: 28px;
            font-weight: 600;
        }
        .header p {
            margin: 8px 0 0 0;
            opacity: 0.9;
            font-size: 16px;
        }
        .content {
            padding: 30px;
        }
        .info-section {
            margin-bottom: 25px;
        }
        .info-title {
            color: #EEBA2B;
            font-size: 18px;
            font-weight: 600;
            margin-bottom: 15px;
            border-bottom: 2px solid #f0f2f5;
            padding-bottom: 8px;
        }
        .info-grid {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 15px;
            margin-bottom: 20px;
        }
        .info-item {
            background: #f8fafc;
            padding: 15px;
            border-radius: 8px;
            border-left: 4px solid #EEBA2B;
        }
        .info-label {
            font-weight: 600;
            color: #374151;
            font-size: 14px;
            margin-bottom: 5px;
        }
        .info-value {
            color: #1f2937;
            font-size: 16px;
        }
        .service-type {
            background: linear-gradient(135deg, #EEBA2B, #D4A017);
            color: white;
            padding: 20px;
            border-radius: 10px;
            margin: 20px 0;
            text-align: center;
            font-size: 18px;
            font-weight: 600;
        }
        .services-list {
            background: #f8fafc;
            padding: 20px;
            border-radius: 10px;
            margin: 20px 0;
        }
        .service-item {
            background: white;
            padding: 12px 16px;
            margin: 8px 0;
            border-radius: 6px;
            border-left: 3px solid #EEBA2B;
            box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05);
        }
        .additional-info {
            background: #fef7cd;
            border: 1px solid #f59e0b;
            border-radius: 8px;
            padding: 15px;
            margin: 20px 0;
        }
        .timestamp {
            text-align: center;
            padding: 20px;
            background: #f9fafb;
            color: #6b7280;
            font-size: 14px;
            border-top: 1px solid #e5e7eb;
        }
        .request-id {
            background: #1f2937;
            color: #f9fafb;
            padding: 10px 15px;
            border-radius: 5px;
            font-family: 'Courier New', monospace;
            font-size: 14px;
            display: inline-block;
            margin-top: 10px;
        }
        @media (max-width: 600px) {
            .info-grid {
                grid-template-columns: 1fr;
            }
            .email-container {
                margin: 10px;
            }
            .content {
                padding: 20px;
            }
        }
    </style>
</head>
<body>
    <div class="email-container">
        <div class="header">
            <h1>New Project Inquiry</h1>
            <p>CreativaPoeta - Creative Solutions</p>
            <div class="request-id">Request ID: ${savedRequest._id}</div>
        </div>
        
        <div class="content">
            <div class="info-section">
                <div class="info-title">Client Information</div>
                <div class="info-grid">
                    <div class="info-item">
                        <div class="info-label">Full Name</div>
                        <div class="info-value">${name}</div>
                    </div>
                    <div class="info-item">
                        <div class="info-label">Email Address</div>
                        <div class="info-value">${email}</div>
                    </div>
                    <div class="info-item">
                        <div class="info-label">Phone Number</div>
                        <div class="info-value">${phone}</div>
                    </div>
                    <div class="info-item">
                        <div class="info-label">Company</div>
                        <div class="info-value">${company || "Not specified"}</div>
                    </div>
                </div>
            </div>

            <div class="info-section">
                <div class="info-title">Service Requirements</div>
                <div class="service-type">
                    ${serviceType}
                </div>
                
                ${selectedServices && selectedServices.length
            ? `
                <div class="services-list">
                    <div style="font-weight: 600; margin-bottom: 15px; color: #374151;">Selected Services:</div>
                    ${selectedServices
                .map((service) => `<div class="service-item">✓ ${service}</div>`)
                .join("")}
                </div>
                `
            : ""}
            </div>

            ${customServiceDescription
            ? `
            <div class="info-section">
                <div class="info-title">Custom Service Description</div>
                <div class="additional-info">
                    ${customServiceDescription}
                </div>
            </div>
            `
            : ""}

            ${customServiceNeeds
            ? `
            <div class="info-section">
                <div class="info-title">Custom Service Needs</div>
                <div class="additional-info">
                    ${customServiceNeeds}
                </div>
            </div>
            `
            : ""}

            ${serviceSpecificOtherDescription
            ? `
            <div class="info-section">
                <div class="info-title">Additional Service Details</div>
                <div class="additional-info">
                    ${serviceSpecificOtherDescription}
                </div>
            </div>
            `
            : ""}

            ${additionalInfo
            ? `
            <div class="info-section">
                <div class="info-title">Additional Information</div>
                <div class="additional-info">
                    ${additionalInfo}
                </div>
            </div>
            `
            : ""}
        </div>
        
        <div class="timestamp">
            Submitted on: ${new Date().toLocaleString("en-US", {
            weekday: "long",
            year: "numeric",
            month: "long",
            day: "numeric",
            hour: "2-digit",
            minute: "2-digit",
            timeZoneName: "short",
        })}
        </div>
    </div>
</body>
</html>
        `;
        // Send the email (optional - don't fail if email fails)
        const emailSent = await (0, adminNotificationEmail_1.sendAdminNotificationEmail)("New Project Inquiry", htmlContent);
        res.status(201).json({
            message: `Inquiry saved successfully!${emailSent ? " Email notification sent." : " (Email notification failed)"}`,
            requestId: savedRequest._id,
            status: savedRequest.status,
            emailSent,
        });
    }
    catch (error) {
        next(error);
    }
};
exports.sendProjectInquiry = sendProjectInquiry;
const getProjectRequestSummary = async (req, res, next) => {
    try {
        const requests = await ProjectDescription_1.default.find({}, "status isReplied serviceType selectedServices assignedToEmail").lean();
        const metrics = {
            projects: 0,
            visibility: 0,
            assistance: 0,
            assignedToMe: 0,
        };
        const currentEmail = getAdminEmail(req);
        requests.forEach((request) => {
            const status = String(request.status || "pending").toLowerCase();
            const needsAttention = !request.isReplied && ["pending", "in-review", "in-progress"].includes(status);
            if (needsAttention)
                metrics[getProjectBucket(request)] += 1;
            if (request.assignedToEmail && request.assignedToEmail === currentEmail && status !== "completed")
                metrics.assignedToMe += 1;
        });
        res.status(200).json({ metrics });
    }
    catch (error) {
        next(error);
    }
};
exports.getProjectRequestSummary = getProjectRequestSummary;
// Get all project requests for dashboard
const getAllProjectRequests = async (req, res, next) => {
    try {
        const { status, page = 1, limit = 10 } = req.query;
        const filter = {};
        if (status && status !== "all") {
            filter.status = status;
        }
        const skip = (Number(page) - 1) * Number(limit);
        const requests = await ProjectDescription_1.default.find(filter)
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(Number(limit));
        const total = await ProjectDescription_1.default.countDocuments(filter);
        res.status(200).json({
            message: "Project requests fetched successfully",
            requests,
            pagination: {
                currentPage: Number(page),
                totalPages: Math.ceil(total / Number(limit)),
                totalRequests: total,
                limit: Number(limit),
            },
        });
    }
    catch (error) {
        next(error);
    }
};
exports.getAllProjectRequests = getAllProjectRequests;
// Get single project request
const getProjectRequest = async (req, res, next) => {
    try {
        const { id } = req.params;
        const request = await ProjectDescription_1.default.findById(id);
        if (!request) {
            res.status(404).json({ message: "Project request not found" });
            return;
        }
        addProjectActivity(request, req, "opened", "Ticket ouvert");
        await request.save();
        res.status(200).json({
            message: "Project request fetched successfully",
            request,
        });
    }
    catch (error) {
        next(error);
    }
};
exports.getProjectRequest = getProjectRequest;
// Reply to a project request
const replyToProjectRequest = async (req, res, next) => {
    var _a, _b;
    try {
        const { id } = req.params;
        const { replyMessage, subject } = req.body;
        if (!replyMessage || !subject) {
            res
                .status(400)
                .json({ message: "Reply message and subject are required." });
            return;
        }
        const request = await ProjectDescription_1.default.findById(id);
        if (!request) {
            res.status(404).json({ message: "Project request not found" });
            return;
        }
        if (!request.assignedToEmail) {
            assignProjectToCurrentUser(request, req, "Ticket pris en charge pendant la reponse");
        }
        else if (request.assignedToEmail !== getAdminEmail(req)) {
            addProjectActivity(request, req, "replied", `Reponse envoyee alors que le ticket etait assigne a ${request.assignedToName || request.assignedToEmail}`);
        }
        // Update the request with reply information
        request.isReplied = true;
        request.replyMessage = replyMessage.trim();
        request.repliedAt = new Date();
        request.repliedBy = ((_a = req.user) === null || _a === void 0 ? void 0 : _a.name) || ((_b = req.user) === null || _b === void 0 ? void 0 : _b.email) || "Admin";
        request.status = "replied";
        addProjectActivity(request, req, "replied", `Reponse envoyee: ${subject}`);
        await request.save();
        // Keep the reply personal and readable: the shared email wrapper adds only the
        // Creativa Poeta header and signature around the administrator's message.
        const clientEmailContent = (0, exports.renderProjectReplyContent)(replyMessage);
        // Send reply email to client (optional - don't fail if email fails)
        let emailSent = false;
        try {
            await (0, sendEmail_1.default)(request.email, subject, clientEmailContent);
            emailSent = true;
            console.log(`Reply email sent to ${request.email}`);
        }
        catch (emailError) {
            console.error("Failed to send reply email:", emailError);
            // Don't fail the request if email fails
        }
        res.status(200).json({
            message: `Reply saved successfully!${emailSent ? " Email sent to client." : " (Email sending failed)"}`,
            request: {
                _id: request._id,
                status: request.status,
                isReplied: request.isReplied,
                repliedAt: request.repliedAt,
                replyMessage: request.replyMessage,
            },
            emailSent,
        });
    }
    catch (error) {
        next(error);
    }
};
exports.replyToProjectRequest = replyToProjectRequest;
// Update project request status
const updateProjectRequestStatus = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { status } = req.body;
        if (!status) {
            res.status(400).json({ message: "Status is required." });
            return;
        }
        // Map frontend status values to backend values
        const statusMapping = {
            Pending: "pending",
            pending: "pending",
            "In-Progress": "in-review",
            "in-progress": "in-review",
            "in-review": "in-review",
            Replied: "replied",
            replied: "replied",
            Completed: "completed",
            completed: "completed",
        };
        const normalizedStatus = statusMapping[status];
        if (!normalizedStatus) {
            res.status(400).json({
                message: `Invalid status value: ${status}. Valid values are: pending, in-review, replied, completed`,
            });
            return;
        }
        const request = await ProjectDescription_1.default.findById(id);
        if (!request) {
            res.status(404).json({ message: "Project request not found" });
            return;
        }
        if (request.status !== normalizedStatus) {
            request.status = normalizedStatus;
            addProjectActivity(request, req, "status", `Statut change en ${normalizedStatus}`);
            await request.save();
        }
        res.status(200).json({
            message: "Project request status updated successfully",
            request,
        });
    }
    catch (error) {
        next(error);
    }
};
exports.updateProjectRequestStatus = updateProjectRequestStatus;
const claimProjectRequest = async (req, res, next) => {
    try {
        const request = await ProjectDescription_1.default.findById(req.params.id);
        if (!request) {
            res.status(404).json({ message: "Project request not found" });
            return;
        }
        if (!canModifyProjectAssignment(req, request)) {
            res.status(409).json({
                message: `This ticket is already handled by ${request.assignedToName || request.assignedToEmail}.`,
                request,
            });
            return;
        }
        assignProjectToCurrentUser(request, req);
        await request.save();
        res.status(200).json({ message: "Project request assigned", request });
    }
    catch (error) {
        next(error);
    }
};
exports.claimProjectRequest = claimProjectRequest;
const releaseProjectRequest = async (req, res, next) => {
    try {
        const request = await ProjectDescription_1.default.findById(req.params.id);
        if (!request) {
            res.status(404).json({ message: "Project request not found" });
            return;
        }
        if (!canModifyProjectAssignment(req, request)) {
            res.status(403).json({ message: "Only the assigned admin can release this ticket." });
            return;
        }
        const previousOwner = request.assignedToName || request.assignedToEmail || "un admin";
        request.assignedToEmail = undefined;
        request.assignedToName = undefined;
        request.assignedAt = undefined;
        addProjectActivity(request, req, "released", `Ticket libere de ${previousOwner}`);
        await request.save();
        res.status(200).json({ message: "Project request released", request });
    }
    catch (error) {
        next(error);
    }
};
exports.releaseProjectRequest = releaseProjectRequest;
// Delete project request
const deleteProjectRequest = async (req, res, next) => {
    try {
        const { id } = req.params;
        const request = await ProjectDescription_1.default.findByIdAndDelete(id);
        if (!request) {
            res.status(404).json({ message: "Project request not found" });
            return;
        }
        res.status(200).json({
            message: "Project request deleted successfully",
        });
    }
    catch (error) {
        next(error);
    }
};
exports.deleteProjectRequest = deleteProjectRequest;
