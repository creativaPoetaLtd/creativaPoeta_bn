import crypto from "crypto";
import User from "../models/User";
import AdminNotification from "../models/AdminNotification";

const FRONTEND_URL = (process.env.FRONTEND_URL || "https://creativapoeta.com").replace(/\/$/, "");

const createPlainToken = () => crypto.randomBytes(32).toString("hex");
const hashToken = (token: string) => crypto.createHash("sha256").update(token).digest("hex");
const buildResetLink = (email: string, token: string) =>
  `${FRONTEND_URL}/secure-admin-login-2024?resetToken=${token}&email=${encodeURIComponent(email)}`;

const sanitizeNotification = (notification: any) => ({
  id: notification._id,
  _id: notification._id,
  type: notification.type,
  status: notification.status,
  title: notification.title,
  message: notification.message,
  targetEmail: notification.targetEmail,
  targetName: notification.targetName,
  resolvedByEmail: notification.resolvedByEmail,
  resolvedByName: notification.resolvedByName,
  resolvedAt: notification.resolvedAt,
  createdAt: notification.createdAt,
  updatedAt: notification.updatedAt,
});

export const listAdminNotifications = async (req: any, res: any): Promise<void> => {
  try {
    const status = String(req.query.status || "active");
    const filter =
      status === "all"
        ? {}
        : status === "resolved"
          ? { status: "resolved" }
          : { status: { $in: ["new", "read"] } };

    const notifications = await AdminNotification.find(filter).sort({ createdAt: -1 }).limit(100);
    res.status(200).json({ notifications: notifications.map(sanitizeNotification) });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
};

export const getAdminNotificationSummary = async (_req: any, res: any): Promise<void> => {
  try {
    const [newCount, openCount] = await Promise.all([
      AdminNotification.countDocuments({ status: "new" }),
      AdminNotification.countDocuments({ status: { $in: ["new", "read"] } }),
    ]);

    res.status(200).json({ metrics: { new: newCount, open: openCount } });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
};

export const markAdminNotificationRead = async (req: any, res: any): Promise<void> => {
  try {
    const notification = await AdminNotification.findById(req.params.id);
    if (!notification) {
      res.status(404).json({ error: "Notification not found." });
      return;
    }

    if (notification.status === "new") {
      notification.status = "read";
      await notification.save();
    }

    res.status(200).json({ notification: sanitizeNotification(notification) });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
};

export const resolvePasswordResetNotification = async (req: any, res: any): Promise<void> => {
  try {
    const notification = await AdminNotification.findById(req.params.id);
    if (!notification || notification.type !== "password_reset") {
      res.status(404).json({ error: "Password reset request not found." });
      return;
    }

    const user = notification.targetUserId
      ? await User.findById(notification.targetUserId)
      : await User.findOne({ email: notification.targetEmail });

    if (!user || !user.isActive || user.accountStatus === "disabled") {
      res.status(404).json({ error: "Admin account not found or disabled." });
      return;
    }

    const token = createPlainToken();
    user.resetTokenHash = hashToken(token);
    user.resetTokenExpiresAt = new Date(Date.now() + 60 * 60 * 1000);
    await user.save();

    notification.status = "resolved";
    notification.resolvedByEmail = req.user?.email;
    notification.resolvedByName = req.user?.name;
    notification.resolvedAt = new Date();
    await notification.save();

    res.status(200).json({
      message: "Password reset link generated.",
      resetLink: buildResetLink(user.email, token),
      notification: sanitizeNotification(notification),
    });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
};

export const archiveAdminNotification = async (req: any, res: any): Promise<void> => {
  try {
    const notification = await AdminNotification.findById(req.params.id);
    if (!notification) {
      res.status(404).json({ error: "Notification not found." });
      return;
    }

    notification.status = "archived";
    await notification.save();

    res.status(200).json({ notification: sanitizeNotification(notification) });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
};
