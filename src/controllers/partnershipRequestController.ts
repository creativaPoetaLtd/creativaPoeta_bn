import { NextFunction, Request, Response } from "express";
import PartnershipRequest, {
  PartnershipRequestStatus,
} from "../models/PartnershipRequest";
import sendEmail from "../utils/sendEmail";
import { sendAdminNotificationEmail } from "../utils/adminNotificationEmail";

const validStatuses: PartnershipRequestStatus[] = [
  "pending",
  "in_progress",
  "replied",
  "closed",
];

const clean = (value: unknown, maxLength = 5000) =>
  String(value || "").trim().slice(0, maxLength);

const escapeHtml = (value: unknown) =>
  clean(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");

const getAdminEmail = (req: Request) => clean(req.user?.email, 320).toLowerCase();
const getAdminName = (req: Request) => clean(req.user?.name || req.user?.email || "Admin", 200);

const addActivity = (
  request: any,
  req: Request,
  type: "assigned" | "released" | "opened" | "replied" | "status",
  message: string
) => {
  request.activity = request.activity || [];
  request.activity.push({
    type,
    message,
    actorEmail: getAdminEmail(req),
    actorName: getAdminName(req),
    at: new Date(),
  });
};

const assignToCurrentAdmin = (request: any, req: Request, message: string) => {
  request.assignedToEmail = getAdminEmail(req);
  request.assignedToName = getAdminName(req);
  request.assignedAt = new Date();
  addActivity(request, req, "assigned", message);
};

export const createPartnershipRequest = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const name = clean(req.body?.name, 200);
    const company = clean(req.body?.company, 200);
    const email = clean(req.body?.email, 320).toLowerCase();
    const phone = clean(req.body?.phone, 80);
    const partnershipType = clean(req.body?.partnershipType, 160);
    const locale = clean(req.body?.locale, 12) || "fr";
    const message = clean(req.body?.message, 5000);

    if (!name || !email || !partnershipType || !message) {
      res.status(400).json({ message: "Required fields are missing." });
      return;
    }

    const request = await PartnershipRequest.create({
      name,
      company,
      email,
      phone,
      partnershipType,
      locale,
      message,
    });

    const emailSent = await sendAdminNotificationEmail(
      `New partnership request - ${company || name}`,
      `<h2>New partnership request</h2>
           <p><strong>Name:</strong> ${escapeHtml(name)}</p>
           <p><strong>Company:</strong> ${escapeHtml(company || "-")}</p>
           <p><strong>Email:</strong> ${escapeHtml(email)}</p>
           <p><strong>Phone:</strong> ${escapeHtml(phone || "-")}</p>
           <p><strong>Type:</strong> ${escapeHtml(partnershipType)}</p>
           <p><strong>Language:</strong> ${escapeHtml(locale)}</p>
           <p><strong>Message:</strong><br>${escapeHtml(message).replace(/\n/g, "<br>")}</p>`
    );

    res.status(201).json({
      message: "Partnership request submitted successfully.",
      requestId: request._id,
      status: request.status,
      emailSent,
    });
  } catch (error) {
    next(error);
  }
};

export const getPartnershipRequestSummary = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const currentEmail = getAdminEmail(req);
    const [pending, inProgress, assignedToMe] = await Promise.all([
      PartnershipRequest.countDocuments({ status: "pending" }),
      PartnershipRequest.countDocuments({ status: "in_progress" }),
      PartnershipRequest.countDocuments({
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
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch partnership request summary." });
  }
};

export const getPartnershipRequests = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 25));
    const status = clean(req.query.status, 40);
    const filter: Record<string, unknown> = {};

    if (status && status !== "all" && validStatuses.includes(status as PartnershipRequestStatus)) {
      filter.status = status;
    }

    const [requests, totalRequests] = await Promise.all([
      PartnershipRequest.find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit),
      PartnershipRequest.countDocuments(filter),
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
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch partnership requests." });
  }
};

export const getPartnershipRequest = async (req: Request, res: Response): Promise<void> => {
  try {
    const request = await PartnershipRequest.findById(req.params.id);
    if (!request) {
      res.status(404).json({ message: "Partnership request not found." });
      return;
    }

    addActivity(request, req, "opened", "Partnership request opened");
    await request.save();
    res.status(200).json({ request });
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch partnership request." });
  }
};

export const claimPartnershipRequest = async (req: Request, res: Response): Promise<void> => {
  try {
    const request = await PartnershipRequest.findById(req.params.id);
    if (!request) {
      res.status(404).json({ message: "Partnership request not found." });
      return;
    }

    if (request.assignedToEmail && request.assignedToEmail !== getAdminEmail(req)) {
      res.status(409).json({ message: "This request is already assigned." });
      return;
    }

    assignToCurrentAdmin(request, req, "Partnership request assigned");
    if (request.status === "pending") request.status = "in_progress";
    await request.save();
    res.status(200).json({ request });
  } catch (error) {
    res.status(500).json({ message: "Failed to assign partnership request." });
  }
};

export const releasePartnershipRequest = async (req: Request, res: Response): Promise<void> => {
  try {
    const request = await PartnershipRequest.findById(req.params.id);
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
  } catch (error) {
    res.status(500).json({ message: "Failed to release partnership request." });
  }
};

export const updatePartnershipRequestStatus = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const status = clean(req.body?.status, 40) as PartnershipRequestStatus;
    if (!validStatuses.includes(status)) {
      res.status(400).json({ message: "Invalid status." });
      return;
    }

    const request = await PartnershipRequest.findById(req.params.id);
    if (!request) {
      res.status(404).json({ message: "Partnership request not found." });
      return;
    }

    request.status = status;
    addActivity(request, req, "status", `Status changed to ${status}`);
    await request.save();
    res.status(200).json({ request });
  } catch (error) {
    res.status(500).json({ message: "Failed to update partnership request." });
  }
};

export const replyToPartnershipRequest = async (req: Request, res: Response): Promise<void> => {
  try {
    const replyMessage = clean(req.body?.replyMessage, 10000);
    const subject = clean(req.body?.subject, 300) || "Re: Partnership with Creativa Poeta";
    if (!replyMessage) {
      res.status(400).json({ message: "Reply message is required." });
      return;
    }

    const request = await PartnershipRequest.findById(req.params.id);
    if (!request) {
      res.status(404).json({ message: "Partnership request not found." });
      return;
    }

    if (!request.assignedToEmail) {
      assignToCurrentAdmin(request, req, "Partnership request assigned while replying");
    }

    await sendEmail(
      request.email,
      subject,
      `<p>Hello ${escapeHtml(request.name)},</p>
       <div>${escapeHtml(replyMessage).replace(/\n/g, "<br>")}</div>
       <p>Creativa Poeta</p>`
    );

    request.replyMessage = replyMessage;
    request.repliedAt = new Date();
    request.repliedBy = getAdminEmail(req);
    request.status = "replied";
    addActivity(request, req, "replied", `Reply sent: ${subject}`);
    await request.save();

    res.status(200).json({ request, emailSent: true });
  } catch (error) {
    console.error("Partnership reply failed:", error);
    res.status(500).json({ message: "Failed to send partnership reply." });
  }
};

export const deletePartnershipRequest = async (req: Request, res: Response): Promise<void> => {
  try {
    const request = await PartnershipRequest.findByIdAndDelete(req.params.id);
    if (!request) {
      res.status(404).json({ message: "Partnership request not found." });
      return;
    }
    res.status(200).json({ message: "Partnership request deleted." });
  } catch (error) {
    res.status(500).json({ message: "Failed to delete partnership request." });
  }
};
