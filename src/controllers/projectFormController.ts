import { Request, Response, NextFunction } from "express";
import sendEmail from "../utils/sendEmail";
import { sendAdminNotificationEmail } from "../utils/adminNotificationEmail";
import { formatParagraphs } from "../utils/emailTemplate";
import ProjectRequest from "../models/ProjectDescription";
import dotenv from "dotenv";
import { normalizeCommunicationLocale } from "../utils/communicationLocale";
import { moveDocumentToTrash } from "../services/trashService";

dotenv.config();

export const renderProjectReplyContent = (replyMessage: string) =>
  formatParagraphs(String(replyMessage || "").trim());

export const getImpactAcknowledgement = (locale: unknown) => {
  const normalizedLocale = normalizeCommunicationLocale(locale);
  const language = normalizedLocale === "fr" || normalizedLocale === "nl" ? normalizedLocale : "en";
  const messages = {
    fr: {
      subject: "Votre candidature Creativa Poeta Impact est bien arrivée",
      preheader: "Nous avons bien reçu votre projet et allons l'étudier.",
      signature: "L'équipe Creativa Poeta Impact",
      content: `
        <p style="margin:0 0 14px;">Bonjour,</p>
        <p style="margin:0 0 14px;">Merci de nous avoir présenté votre organisation et sa mission. Votre candidature au programme <strong>Creativa Poeta Impact</strong> est bien enregistrée.</p>
        <div style="margin:20px 0;padding:16px 18px;border-left:4px solid #EEBA2B;background:#f8faf9;">
          <strong style="color:#071a33;">Prochaine étape</strong><br>
          <span>Notre équipe étudie l'impact, le besoin et la faisabilité du projet. Nous vous répondrons, dans la mesure du possible, sous 7 à 14 jours.</span>
        </div>
        <p style="margin:0 0 14px;"><strong>Aucun paiement ne sera demandé pour l'examen de cette demande.</strong></p>
        <p style="margin:0;">Vous pouvez répondre directement à cet email si une précision importante doit être ajoutée.</p>`,
    },
    nl: {
      subject: "Uw aanvraag voor Creativa Poeta Impact is goed aangekomen",
      preheader: "We hebben uw project ontvangen en zullen het beoordelen.",
      signature: "Het Creativa Poeta Impact-team",
      content: `
        <p style="margin:0 0 14px;">Hallo,</p>
        <p style="margin:0 0 14px;">Bedankt om uw organisatie en missie voor te stellen. Uw aanvraag voor <strong>Creativa Poeta Impact</strong> is geregistreerd.</p>
        <div style="margin:20px 0;padding:16px 18px;border-left:4px solid #EEBA2B;background:#f8faf9;">
          <strong style="color:#071a33;">Volgende stap</strong><br>
          <span>Ons team beoordeelt de impact, de behoefte en de haalbaarheid. Waar mogelijk antwoorden we binnen 7 tot 14 dagen.</span>
        </div>
        <p style="margin:0 0 14px;"><strong>Voor de beoordeling van deze aanvraag wordt geen betaling gevraagd.</strong></p>
        <p style="margin:0;">U kunt rechtstreeks op deze e-mail antwoorden als u een belangrijke aanvulling hebt.</p>`,
    },
    en: {
      subject: "Your Creativa Poeta Impact application has arrived",
      preheader: "We have received your project and will review it.",
      signature: "The Creativa Poeta Impact team",
      content: `
        <p style="margin:0 0 14px;">Hello,</p>
        <p style="margin:0 0 14px;">Thank you for presenting your organization and mission. Your application to <strong>Creativa Poeta Impact</strong> has been recorded.</p>
        <div style="margin:20px 0;padding:16px 18px;border-left:4px solid #EEBA2B;background:#f8faf9;">
          <strong style="color:#071a33;">Next step</strong><br>
          <span>Our team will review the impact, need and feasibility of the project. Where possible, we will reply within 7 to 14 days.</span>
        </div>
        <p style="margin:0 0 14px;"><strong>No payment will be requested to review this application.</strong></p>
        <p style="margin:0;">You can reply directly to this email if you need to add an important detail.</p>`,
    },
  };
  return messages[language];
};

const getAdminEmail = (req: Request) => String((req.user as any)?.email || "").toLowerCase().trim();
const getAdminName = (req: Request) => String((req.user as any)?.name || (req.user as any)?.email || "Admin").trim();

const addProjectActivity = (request: any, req: Request, type: "assigned" | "released" | "opened" | "replied" | "status", message: string) => {
  request.activity = request.activity || [];
  request.activity.push({
    type,
    message,
    actorEmail: getAdminEmail(req),
    actorName: getAdminName(req),
    at: new Date(),
  });
};

const assignProjectToCurrentUser = (request: any, req: Request, message = "Ticket pris en charge") => {
  request.assignedToEmail = getAdminEmail(req);
  request.assignedToName = getAdminName(req);
  request.assignedAt = new Date();
  addProjectActivity(request, req, "assigned", message);
};

const canModifyProjectAssignment = (req: Request, request: any) =>
  !request.assignedToEmail || request.assignedToEmail === getAdminEmail(req);

const getProjectBucket = (request: any) => {
  const serviceType = String(request.serviceType || "").toLowerCase();
  const selected = Array.isArray(request.selectedServices) ? request.selectedServices.join(" ").toLowerCase() : "";
  if (serviceType.includes("creativa poeta impact")) return "impact";
  if (serviceType.includes("diagnostic visibilite") || serviceType.includes("visibility test") || selected.includes("test visibilite")) return "visibility";
  if (serviceType.includes("assistance numerique") || serviceType.includes("digital assistance") || serviceType.includes("depannage") || selected.includes("depannage") || selected.includes("troubleshooting")) return "assistance";
  return "projects";
};

const bucketMatchers = {
  impact: [{ serviceType: /creativa poeta impact/i }],
  visibility: [{ serviceType: /diagnostic visibilit/i }, { serviceType: /visibility test/i }, { selectedServices: /test visibilit/i }],
  assistance: [
    { serviceType: /assistance num[eé]rique/i },
    { serviceType: /digital assistance/i },
    { serviceType: /depannage|d[eé]pannage/i },
    { selectedServices: /depannage|d[eé]pannage|troubleshooting/i },
  ],
};

const getProjectBucketFilter = (kind: unknown) => {
  const bucket = String(kind || "").toLowerCase();
  if (bucket === "projects") return { $nor: [...bucketMatchers.impact, ...bucketMatchers.visibility, ...bucketMatchers.assistance] };
  if (bucket === "impact" || bucket === "visibility" || bucket === "assistance") return { $or: bucketMatchers[bucket] };
  return {};
};

export const sendProjectInquiry = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const {
      name,
      email,
      phone,
      company,
      serviceType,
      selectedServices,
      customServiceDescription,
      customServiceNeeds,
      serviceSpecificOtherDescription,
      additionalInfo,
      locale,
    } = req.body;

    // Basic required field validation
    if (!name || !email || !phone || !serviceType) {
      res.status(400).json({
        message: "Name, email, phone, and service type are required.",
      });
      return;
    }

    // Create and save project request to database
    const projectRequest = new ProjectRequest({
      name: name.trim(),
      email: email.trim().toLowerCase(),
      phone: phone.trim(),
      company: company?.trim(),
      serviceType: serviceType.trim(),
      selectedServices: Array.isArray(selectedServices)
        ? selectedServices.map((s: string) => s.trim())
        : selectedServices
        ? [selectedServices.trim()]
        : [],
      customServiceDescription: customServiceDescription?.trim(),
      customServiceNeeds: customServiceNeeds?.trim(),
      serviceSpecificOtherDescription: serviceSpecificOtherDescription?.trim(),
      additionalInfo: additionalInfo?.trim(),
      locale: normalizeCommunicationLocale(locale),
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
                        <div class="info-value">${
                          company || "Not specified"
                        }</div>
                    </div>
                </div>
            </div>

            <div class="info-section">
                <div class="info-title">Service Requirements</div>
                <div class="service-type">
                    ${serviceType}
                </div>
                
                ${
                  selectedServices && selectedServices.length
                    ? `
                <div class="services-list">
                    <div style="font-weight: 600; margin-bottom: 15px; color: #374151;">Selected Services:</div>
                    ${selectedServices
                      .map(
                        (service: string) =>
                          `<div class="service-item">✓ ${service}</div>`
                      )
                      .join("")}
                </div>
                `
                    : ""
                }
            </div>

            ${
              customServiceDescription
                ? `
            <div class="info-section">
                <div class="info-title">Custom Service Description</div>
                <div class="additional-info">
                    ${customServiceDescription}
                </div>
            </div>
            `
                : ""
            }

            ${
              customServiceNeeds
                ? `
            <div class="info-section">
                <div class="info-title">Custom Service Needs</div>
                <div class="additional-info">
                    ${customServiceNeeds}
                </div>
            </div>
            `
                : ""
            }

            ${
              serviceSpecificOtherDescription
                ? `
            <div class="info-section">
                <div class="info-title">Additional Service Details</div>
                <div class="additional-info">
                    ${serviceSpecificOtherDescription}
                </div>
            </div>
            `
                : ""
            }

            ${
              additionalInfo
                ? `
            <div class="info-section">
                <div class="info-title">Additional Information</div>
                <div class="additional-info">
                    ${additionalInfo}
                </div>
            </div>
            `
                : ""
            }
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
    const emailSent = await sendAdminNotificationEmail(
      "New Project Inquiry",
      htmlContent
    );

    let confirmationSent = false;
    if (String(serviceType).toLowerCase().includes("creativa poeta impact")) {
      try {
        const acknowledgement = getImpactAcknowledgement(locale);
        await sendEmail(
          email.trim().toLowerCase(),
          acknowledgement.subject,
          acknowledgement.content,
          {
            title: acknowledgement.subject,
            preheader: acknowledgement.preheader,
            signature: acknowledgement.signature,
            replyTo: process.env.REPLY_TO_EMAIL || "contact@creativapoeta.com",
          }
        );
        confirmationSent = true;
      } catch (confirmationError) {
        console.error("Impact acknowledgement email failed:", confirmationError);
      }
    }

    res.status(201).json({
      message: `Inquiry saved successfully!${
        emailSent ? " Email notification sent." : " (Email notification failed)"
      }`,
      requestId: savedRequest._id,
      status: savedRequest.status,
      emailSent,
      confirmationSent,
    });
  } catch (error) {
    next(error);
  }
};

export const getProjectRequestSummary = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const requests = await ProjectRequest.find({}, "status isReplied serviceType selectedServices assignedToEmail").lean();
    const metrics = {
      projects: 0,
      impact: 0,
      visibility: 0,
      assistance: 0,
      assignedToMe: 0,
    };
    const currentEmail = getAdminEmail(req);

    requests.forEach((request: any) => {
      const status = String(request.status || "pending").toLowerCase();
      const needsAttention = !request.isReplied && ["pending", "in-review", "in-progress"].includes(status);
      if (needsAttention) metrics[getProjectBucket(request) as "projects" | "impact" | "visibility" | "assistance"] += 1;
      if (request.assignedToEmail && request.assignedToEmail === currentEmail && status !== "completed") metrics.assignedToMe += 1;
    });

    res.status(200).json({ metrics });
  } catch (error) {
    next(error);
  }
};

// Get all project requests for dashboard
export const getAllProjectRequests = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { status, kind, page = 1, limit = 10 } = req.query;

    const filter: any = {};
    if (status && status !== "all") {
      filter.status = status;
    }
    Object.assign(filter, getProjectBucketFilter(kind));

    const skip = (Number(page) - 1) * Number(limit);

    const requests = await ProjectRequest.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(Number(limit));

    const total = await ProjectRequest.countDocuments(filter);

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
  } catch (error) {
    next(error);
  }
};

// Get single project request
export const getProjectRequest = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { id } = req.params;

    const request = await ProjectRequest.findById(id);

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
  } catch (error) {
    next(error);
  }
};

// Reply to a project request
export const replyToProjectRequest = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { id } = req.params;
    const { replyMessage, subject } = req.body;

    if (!replyMessage || !subject) {
      res
        .status(400)
        .json({ message: "Reply message and subject are required." });
      return;
    }

    const request = await ProjectRequest.findById(id);

    if (!request) {
      res.status(404).json({ message: "Project request not found" });
      return;
    }

    if (!request.assignedToEmail) {
      assignProjectToCurrentUser(request, req, "Ticket pris en charge pendant la reponse");
    } else if (request.assignedToEmail !== getAdminEmail(req)) {
      addProjectActivity(request, req, "replied", `Reponse envoyee alors que le ticket etait assigne a ${request.assignedToName || request.assignedToEmail}`);
    }

    // Update the request with reply information
    request.isReplied = true;
    request.replyMessage = replyMessage.trim();
    request.repliedAt = new Date();
    request.repliedBy = req.user?.name || req.user?.email || "Admin";
    request.status = "replied";
    addProjectActivity(request, req, "replied", `Reponse envoyee: ${subject}`);

    await request.save();

    // Keep the reply personal and readable: the shared email wrapper adds only the
    // Creativa Poeta header and signature around the administrator's message.
    const clientEmailContent = renderProjectReplyContent(replyMessage);

    // Send reply email to client (optional - don't fail if email fails)
    let emailSent = false;
    try {
      await sendEmail(request.email, subject, clientEmailContent);
      emailSent = true;
      console.log(`Reply email sent to ${request.email}`);
    } catch (emailError) {
      console.error("Failed to send reply email:", emailError);
      // Don't fail the request if email fails
    }

    res.status(200).json({
      message: `Reply saved successfully!${
        emailSent ? " Email sent to client." : " (Email sending failed)"
      }`,
      request: {
        _id: request._id,
        status: request.status,
        isReplied: request.isReplied,
        repliedAt: request.repliedAt,
        replyMessage: request.replyMessage,
      },
      emailSent,
    });
  } catch (error) {
    next(error);
  }
};

// Update project request status
export const updateProjectRequestStatus = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!status) {
      res.status(400).json({ message: "Status is required." });
      return;
    }

    // Map frontend status values to backend values
    const statusMapping: { [key: string]: string } = {
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

    const request = await ProjectRequest.findById(id);

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
  } catch (error) {
    next(error);
  }
};

export const claimProjectRequest = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const request = await ProjectRequest.findById(req.params.id);
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
  } catch (error) {
    next(error);
  }
};

export const releaseProjectRequest = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const request = await ProjectRequest.findById(req.params.id);
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
  } catch (error) {
    next(error);
  }
};

// Delete project request
export const deleteProjectRequest = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { id } = req.params;

    const request = await ProjectRequest.findById(id);

    if (!request) {
      res.status(404).json({ message: "Project request not found" });
      return;
    }

    await moveDocumentToTrash({
      entityType: "project_request",
      document: request,
      label: `${request.name || "Project request"} · ${request.email || request._id}`,
      req,
    });

    res.status(200).json({
      message: "Project request deleted successfully",
    });
  } catch (error) {
    next(error);
  }
};
