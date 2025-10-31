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
exports.deleteProjectRequest = exports.updateProjectRequestStatus = exports.replyToProjectRequest = exports.getProjectRequest = exports.getAllProjectRequests = exports.sendProjectInquiry = void 0;
const sendEmail_1 = __importDefault(require("../utils/sendEmail"));
const ProjectDescription_1 = __importDefault(require("../models/ProjectDescription"));
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
const sendProjectInquiry = (req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { name, email, phone, company, serviceType, selectedServices, customServiceDescription, customServiceNeeds, serviceSpecificOtherDescription, additionalInfo, } = req.body;
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
            // status will default to "pending" from the model
        });
        const savedRequest = yield projectRequest.save();
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
        const emailUser = process.env.EMAIL_USER;
        let emailSent = false;
        if (emailUser) {
            try {
                yield (0, sendEmail_1.default)(emailUser, "New Project Inquiry", htmlContent);
                emailSent = true;
                console.log("Email notification sent successfully");
            }
            catch (emailError) {
                console.error("Failed to send email notification:", emailError);
                // Don't fail the request if email fails
            }
        }
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
});
exports.sendProjectInquiry = sendProjectInquiry;
// Get all project requests for dashboard
const getAllProjectRequests = (req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { status, page = 1, limit = 10 } = req.query;
        const filter = {};
        if (status && status !== "all") {
            filter.status = status;
        }
        const skip = (Number(page) - 1) * Number(limit);
        const requests = yield ProjectDescription_1.default.find(filter)
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(Number(limit));
        const total = yield ProjectDescription_1.default.countDocuments(filter);
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
});
exports.getAllProjectRequests = getAllProjectRequests;
// Get single project request
const getProjectRequest = (req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { id } = req.params;
        const request = yield ProjectDescription_1.default.findById(id);
        if (!request) {
            res.status(404).json({ message: "Project request not found" });
            return;
        }
        res.status(200).json({
            message: "Project request fetched successfully",
            request,
        });
    }
    catch (error) {
        next(error);
    }
});
exports.getProjectRequest = getProjectRequest;
// Reply to a project request
const replyToProjectRequest = (req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
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
        const request = yield ProjectDescription_1.default.findById(id);
        if (!request) {
            res.status(404).json({ message: "Project request not found" });
            return;
        }
        // Update the request with reply information
        request.isReplied = true;
        request.replyMessage = replyMessage.trim();
        request.repliedAt = new Date();
        request.repliedBy = ((_a = req.user) === null || _a === void 0 ? void 0 : _a.name) || ((_b = req.user) === null || _b === void 0 ? void 0 : _b.email) || "Admin";
        request.status = "replied";
        yield request.save();
        // Prepare beautiful email content for the client
        const clientEmailContent = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Response to Your Project Inquiry</title>
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
        .greeting {
            font-size: 18px;
            color: #374151;
            margin-bottom: 20px;
        }
        .section {
            margin-bottom: 30px;
        }
        .section-title {
            color: #EEBA2B;
            font-size: 20px;
            font-weight: 600;
            margin-bottom: 15px;
            border-bottom: 2px solid #f0f2f5;
            padding-bottom: 8px;
        }
        .original-request {
            background: #f8fafc;
            padding: 20px;
            border-radius: 10px;
            border: 1px solid #e5e7eb;
        }
        .service-type {
            background: linear-gradient(135deg, #EEBA2B, #D4A017);
            color: white;
            padding: 15px;
            border-radius: 8px;
            margin: 15px 0;
            text-align: center;
            font-weight: 600;
        }
        .services-grid {
            display: grid;
            gap: 10px;
            margin: 15px 0;
        }
        .service-item {
            background: white;
            padding: 10px 15px;
            border-radius: 6px;
            border-left: 3px solid #EEBA2B;
            box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05);
        }
        .response-section {
            background: linear-gradient(135deg, #fef3c7, #fed7aa);
            border: 2px solid #f59e0b;
            border-radius: 12px;
            padding: 25px;
            margin: 20px 0;
        }
        .response-content {
            font-size: 16px;
            line-height: 1.7;
            color: #374151;
        }
        .footer {
            background: #f9fafb;
            padding: 25px;
            text-align: center;
            border-top: 1px solid #e5e7eb;
        }
        .company-name {
            color: #EEBA2B;
            font-weight: 600;
            font-size: 18px;
        }
        .reference-id {
            background: #1f2937;
            color: #f9fafb;
            padding: 8px 12px;
            border-radius: 5px;
            font-family: 'Courier New', monospace;
            font-size: 12px;
            display: inline-block;
            margin-top: 15px;
        }
        .custom-info {
            background: #fef7cd;
            border: 1px solid #f59e0b;
            border-radius: 8px;
            padding: 15px;
            margin: 15px 0;
        }
        @media (max-width: 600px) {
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
            <h1>Response to Your Inquiry</h1>
            <p>CreativaPoeta - Your Creative Partner</p>
        </div>
        
        <div class="content">
            <div class="greeting">
                Dear <strong>${request.name}</strong>,
            </div>
            
            <p>Thank you for your project inquiry submitted on <strong>${request.createdAt.toLocaleDateString("en-US", {
            weekday: "long",
            year: "numeric",
            month: "long",
            day: "numeric",
        })}</strong>. We appreciate your interest in our services!</p>
            
            <div class="section">
                <div class="section-title">Your Original Request Summary</div>
                <div class="original-request">
                    <div class="service-type">
                        ${request.serviceType}
                    </div>
                    
                    ${request.selectedServices &&
            request.selectedServices.length
            ? `
                    <div style="font-weight: 600; margin: 15px 0 10px 0; color: #374151;">Selected Services:</div>
                    <div class="services-grid">
                        ${request.selectedServices
                .map((service) => `<div class="service-item">✓ ${service}</div>`)
                .join("")}
                    </div>
                    `
            : ""}
                    
                    ${request.customServiceDescription
            ? `
                    <div class="custom-info">
                        <strong>Custom Service Description:</strong><br>
                        ${request.customServiceDescription}
                    </div>
                    `
            : ""}
                    
                    ${request.customServiceNeeds
            ? `
                    <div class="custom-info">
                        <strong>Custom Service Needs:</strong><br>
                        ${request.customServiceNeeds}
                    </div>
                    `
            : ""}
                    
                    ${request.serviceSpecificOtherDescription
            ? `
                    <div class="custom-info">
                        <strong>Additional Service Details:</strong><br>
                        ${request.serviceSpecificOtherDescription}
                    </div>
                    `
            : ""}
                </div>
            </div>
            
            <div class="section">
                <div class="section-title">Our Response</div>
                <div class="response-section">
                    <div class="response-content">
                        ${replyMessage.replace(/\n/g, "<br>")}
                    </div>
                </div>
            </div>
            
            <p>We look forward to working with you and bringing your creative vision to life!</p>
        </div>
        
        <div class="footer">
            <p>Best regards,</p>
            <div class="company-name">CreativaPoeta Team</div>
            <p style="color: #6b7280; margin-top: 15px;">Your trusted partner for creative solutions</p>
            <div class="reference-id">Reference ID: ${request._id}</div>
        </div>
    </div>
</body>
</html>
        `;
        // Send reply email to client (optional - don't fail if email fails)
        let emailSent = false;
        try {
            yield (0, sendEmail_1.default)(request.email, subject, clientEmailContent);
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
});
exports.replyToProjectRequest = replyToProjectRequest;
// Update project request status
const updateProjectRequestStatus = (req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
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
        const request = yield ProjectDescription_1.default.findByIdAndUpdate(id, { status: normalizedStatus, updatedAt: new Date() }, { new: true });
        if (!request) {
            res.status(404).json({ message: "Project request not found" });
            return;
        }
        res.status(200).json({
            message: "Project request status updated successfully",
            request,
        });
    }
    catch (error) {
        next(error);
    }
});
exports.updateProjectRequestStatus = updateProjectRequestStatus;
// Delete project request
const deleteProjectRequest = (req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { id } = req.params;
        const request = yield ProjectDescription_1.default.findByIdAndDelete(id);
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
});
exports.deleteProjectRequest = deleteProjectRequest;
