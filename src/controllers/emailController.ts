import { Request, Response } from "express";
import EmailMessage from "../models/EmailMessage";
import { syncConfiguredMailboxes } from "../services/emailSyncService";

const allowedStatuses = ["new", "read", "replied", "archived"];

export const syncEmails = async (req: Request, res: Response): Promise<void> => {
  try {
    const limit = Number(req.body?.limit || req.query.limit || 50);
    const result = await syncConfiguredMailboxes(limit);
    res.status(200).json({
      message: "Email sync completed",
      ...result,
    });
  } catch (error: any) {
    res.status(500).json({
      message: "Failed to sync emails",
      error: error?.message || "Unknown error",
    });
  }
};

export const getEmails = async (req: Request, res: Response): Promise<void> => {
  try {
    const page = Math.max(1, Number(req.query.page || 1));
    const limit = Math.max(1, Math.min(Number(req.query.limit || 25), 100));
    const status = String(req.query.status || "all");
    const mailbox = String(req.query.mailbox || "all");
    const search = String(req.query.search || "").trim();

    const filter: any = {};

    if (allowedStatuses.includes(status)) {
      filter.status = status;
    }

    if (mailbox !== "all") {
      filter.mailbox = mailbox;
    }

    if (search) {
      filter.$or = [
        { subject: { $regex: search, $options: "i" } },
        { preview: { $regex: search, $options: "i" } },
        { text: { $regex: search, $options: "i" } },
        { fromName: { $regex: search, $options: "i" } },
        { fromEmail: { $regex: search, $options: "i" } },
      ];
    }

    const skip = (page - 1) * limit;
    const [emails, totalEmails, counts] = await Promise.all([
      EmailMessage.find(filter).sort({ receivedAt: -1 }).skip(skip).limit(limit),
      EmailMessage.countDocuments(filter),
      EmailMessage.aggregate([{ $group: { _id: "$status", count: { $sum: 1 } } }]),
    ]);

    res.status(200).json({
      message: "Emails fetched successfully",
      emails,
      metrics: counts.reduce(
        (acc: Record<string, number>, item: { _id: string; count: number }) => {
          acc[item._id] = item.count;
          return acc;
        },
        {}
      ),
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(totalEmails / limit) || 1,
        totalEmails,
        limit,
      },
    });
  } catch (error: any) {
    res.status(500).json({
      message: "Failed to fetch emails",
      error: error?.message || "Unknown error",
    });
  }
};

export const getEmail = async (req: Request, res: Response): Promise<void> => {
  try {
    const email = await EmailMessage.findById(req.params.id);

    if (!email) {
      res.status(404).json({ message: "Email not found" });
      return;
    }

    if (email.status === "new") {
      email.status = "read";
      await email.save();
    }

    res.status(200).json({ message: "Email fetched successfully", email });
  } catch (error: any) {
    res.status(500).json({
      message: "Failed to fetch email",
      error: error?.message || "Unknown error",
    });
  }
};

export const updateEmailStatus = async (req: Request, res: Response): Promise<void> => {
  try {
    const status = String(req.body?.status || "");

    if (!allowedStatuses.includes(status)) {
      res.status(400).json({ message: "Invalid email status" });
      return;
    }

    const email = await EmailMessage.findByIdAndUpdate(
      req.params.id,
      { status },
      { new: true }
    );

    if (!email) {
      res.status(404).json({ message: "Email not found" });
      return;
    }

    res.status(200).json({ message: "Email status updated", email });
  } catch (error: any) {
    res.status(500).json({
      message: "Failed to update email status",
      error: error?.message || "Unknown error",
    });
  }
};

export const deleteEmail = async (req: Request, res: Response): Promise<void> => {
  try {
    const email = await EmailMessage.findByIdAndDelete(req.params.id);

    if (!email) {
      res.status(404).json({ message: "Email not found" });
      return;
    }

    res.status(200).json({
      message: "Email deleted from dashboard copy",
    });
  } catch (error: any) {
    res.status(500).json({
      message: "Failed to delete email",
      error: error?.message || "Unknown error",
    });
  }
};
