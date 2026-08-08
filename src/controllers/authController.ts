import { Request, Response } from "express";
import bcrypt from "bcrypt";
import crypto from "crypto";
import jwt from "jsonwebtoken";
import User, { IUser, IUserMailboxAccess } from "../models/User";
import AdminNotification from "../models/AdminNotification";
import { getEffectiveAdminRole, normalizeAdminRole } from "../middleware/authMiddleware";
import dotenv from "dotenv";

dotenv.config();

const JWT_SECRET = process.env.JWT_SECRET;
const ADMIN_BOOTSTRAP_SECRET = process.env.ADMIN_BOOTSTRAP_SECRET;
const FRONTEND_URL = (process.env.FRONTEND_URL || "https://creativapoeta.com").replace(/\/$/, "");

if (!JWT_SECRET) {
  throw new Error("JWT_SECRET is not defined in the environment variables.");
}

const allowedRoles = [
  "admin_0",
  "admin_1",
  "admin_2",
  "admin_3",
  "admin_4",
  "admin_5",
] as const;

type CreatableAdminRole = (typeof allowedRoles)[number];

const roleLabels: Record<CreatableAdminRole | "super_admin", string> = {
  super_admin: "Admin",
  admin_0: "Direction",
  admin_1: "Operations",
  admin_2: "Content & SEO",
  admin_3: "Support & Email",
  admin_4: "Reporting",
  admin_5: "Limited Access",
};

const allPermissionKeys = [
  "dashboard:read",
  "requests:projects",
  "requests:visibility",
  "requests:assistance",
  "requests:partnerships",
  "contacts:read",
  "contacts:reply",
  "email:read",
  "email:send",
  "email:manage",
  "blogs:manage",
  "seo:manage",
  "jobs:manage",
  "users:manage",
  "internal:messages",
  "reports:read",
  "analytics:read",
] as const;

const permissionCatalog = new Set<string>(allPermissionKeys);

const permissionsByRole: Record<CreatableAdminRole | "super_admin", string[]> = {
  super_admin: [...allPermissionKeys, "users:level0"],
  admin_0: [...allPermissionKeys],
  admin_1: [
    "dashboard:read",
    "requests:projects",
    "requests:visibility",
    "requests:assistance",
    "requests:partnerships",
    "contacts:read",
    "contacts:reply",
    "email:read",
    "email:send",
    "email:manage",
    "jobs:manage",
    "internal:messages",
    "reports:read",
    "analytics:read",
  ],
  admin_2: ["dashboard:read", "requests:visibility", "email:read", "blogs:manage", "seo:manage", "internal:messages", "reports:read", "analytics:read"],
  admin_3: ["dashboard:read", "requests:assistance", "contacts:read", "contacts:reply", "email:read", "email:send", "email:manage", "internal:messages"],
  admin_4: ["dashboard:read", "internal:messages", "reports:read", "analytics:read"],
  admin_5: ["dashboard:read", "email:read", "internal:messages"],
};

const PASSWORD_MIN_LENGTH = 8;
const SHARED_MAILBOXES = ["contact@creativapoeta.com", "contact@creativapoeta.be"];

const normalizeEmail = (email: unknown) => String(email || "").toLowerCase().trim();

const sanitizeMailboxAccess = (mailboxAccess: unknown, personalEmail: string): IUserMailboxAccess[] => {
  const rows = Array.isArray(mailboxAccess) ? mailboxAccess : [];
  const normalizedRows: IUserMailboxAccess[] = rows
    .map((item: any): IUserMailboxAccess => ({
      address: normalizeEmail(item?.address),
      permission: ["read", "send", "manage"].includes(item?.permission) ? item.permission : "read",
      type: item?.type === "personal" ? "personal" : "shared",
    }))
    .filter((item) => item.address);

  const byAddress = new Map<string, IUserMailboxAccess>();
  byAddress.set(personalEmail, { address: personalEmail, permission: "manage", type: "personal" });
  normalizedRows.forEach((item) => byAddress.set(item.address, item));
  return Array.from(byAddress.values());
};


const sanitizeAssignableMailboxAccess = async (
  mailboxAccess: unknown,
  personalEmail: string
): Promise<IUserMailboxAccess[]> => {
  const normalizedPersonalEmail = normalizeEmail(personalEmail);
  const reservedPersonalMailboxes = new Set(
    (
      await User.find({ email: { $ne: normalizedPersonalEmail } })
        .select("email")
        .lean()
    )
      .map((user) => normalizeEmail(user.email))
      .filter(Boolean)
  );

  const rows = sanitizeMailboxAccess(mailboxAccess, normalizedPersonalEmail).filter((mailbox) => {
    if (mailbox.address === normalizedPersonalEmail) return true;
    if (mailbox.type === "personal") return false;
    return !reservedPersonalMailboxes.has(mailbox.address);
  });

  return rows.map((mailbox) =>
    mailbox.address === normalizedPersonalEmail
      ? { ...mailbox, permission: "manage", type: "personal" }
      : { ...mailbox, type: "shared" }
  );
};
const sanitizePermissionList = (value: unknown) => {
  const rows = Array.isArray(value) ? value : [];
  return Array.from(
    new Set(
      rows
        .map((item) => String(item || "").trim())
        .filter((item) => permissionCatalog.has(item))
    )
  );
};

const cpgGroupKeys = [
  "CPG0",
  "CPG1",
  "CPG2",
  "CPG3",
  "CPG4",
  "CPG5",
  "CPG01",
  "CPG02",
  "CPG03",
  "CPG04",
  "CPG05",
  "CPG12",
  "CPG13",
  "CPG14",
  "CPG15",
  "CPG23",
  "CPG24",
  "CPG25",
  "CPG34",
  "CPG35",
  "CPG45",
];

const getCpgGroupLevels = (groupKey: string) => {
  const digits = groupKey.replace("CPG", "");
  if (digits.length === 1) return [Number(digits)];
  const start = Number(digits[0]);
  const end = Number(digits[1]);
  if (Number.isNaN(start) || Number.isNaN(end) || start > end) return [];
  return Array.from({ length: end - start + 1 }, (_, index) => start + index);
};

const getRoleInternalGroups = (role: CreatableAdminRole | "super_admin") => {
  if (role === "super_admin") return [];
  const level = Number(role.replace("admin_", ""));
  if (Number.isNaN(level)) return [];
  return cpgGroupKeys.filter((groupKey) => getCpgGroupLevels(groupKey).includes(level));
};

const getEffectivePermissions = (user: IUser, role: CreatableAdminRole | "super_admin") => {
  const base = new Set(permissionsByRole[role] || []);
  (user.permissionsAllow || []).forEach((permission) => {
    if (permissionCatalog.has(permission)) base.add(permission);
  });
  (user.permissionsDeny || []).forEach((permission) => base.delete(permission));
  return Array.from(base);
};

const sanitizeUser = (user: IUser) => {
  const normalizedRole = getEffectiveAdminRole(user.role, user.email);
  const safeRole = normalizedRole === "admin" || normalizedRole === "editor" || normalizedRole === "viewer"
    ? "admin_5"
    : normalizedRole;

  return {
    id: user._id,
    name: user.name,
    email: user.email,
    role: safeRole,
    roleLabel: roleLabels[safeRole as keyof typeof roleLabels] || safeRole,
    permissions: getEffectivePermissions(user, safeRole as CreatableAdminRole | "super_admin"),
    permissionsAllow: user.permissionsAllow || [],
    permissionsDeny: user.permissionsDeny || [],
    internalGroups: Array.from(new Set([...(user.internalGroups || []), ...getRoleInternalGroups(safeRole as CreatableAdminRole | "super_admin")])).filter((group) => cpgGroupKeys.includes(group)),
    isActive: user.isActive,
    accountStatus: user.accountStatus || (user.password ? "active" : "pending"),
    mailboxAccess: user.mailboxAccess || [],
    createdAt: user.createdAt,
  };
};

const signAdminToken = (user: IUser) => {
  const normalizedRole = getEffectiveAdminRole(user.role, user.email);
  return jwt.sign(
    {
      _id: user._id,
      name: user.name,
      email: user.email,
      role: normalizedRole,
      isActive: user.isActive,
    },
    JWT_SECRET,
    { expiresIn: "1d" }
  );
};

const createPlainToken = () => crypto.randomBytes(32).toString("hex");
const hashToken = (token: string) => crypto.createHash("sha256").update(token).digest("hex");
const buildResetLink = (email: string, token: string) =>
  `${FRONTEND_URL}/secure-admin-login-2024?resetToken=${token}&email=${encodeURIComponent(email)}`;

const validatePassword = (password: unknown, confirmPassword?: unknown) => {
  const nextPassword = String(password || "");
  if (nextPassword.length < PASSWORD_MIN_LENGTH) {
    return `Password must contain at least ${PASSWORD_MIN_LENGTH} characters.`;
  }
  if (confirmPassword !== undefined && nextPassword !== String(confirmPassword || "")) {
    return "Passwords do not match.";
  }
  return null;
};

const getBootstrapSecret = (req: Request) =>
  req.headers["x-admin-bootstrap-secret"] || req.body?.bootstrapSecret;

const hasValidBootstrapSecret = (req: Request) =>
  Boolean(ADMIN_BOOTSTRAP_SECRET) &&
  getBootstrapSecret(req) === ADMIN_BOOTSTRAP_SECRET;

const isCreatableRole = (role: string): role is CreatableAdminRole =>
  allowedRoles.includes(role as CreatableAdminRole);

const canManageTargetRole = (actorRole: string | undefined, targetRole: string) => {
  const actor = normalizeAdminRole(actorRole);
  const target = normalizeAdminRole(targetRole);

  if (actor === "super_admin") return true;
  if (actor === "admin_0") {
    return !["super_admin", "admin_0", "admin"].includes(target);
  }
  return false;
};

const canAssignRole = (actorRole: string | undefined, nextRole: string) => {
  const actor = normalizeAdminRole(actorRole);
  const next = normalizeAdminRole(nextRole);

  if (next === "super_admin") return false;
  if (actor === "super_admin") return isCreatableRole(next);
  if (actor === "admin_0") return isCreatableRole(next) && next !== "admin_0";
  return false;
};

export const signup = async (req: Request, res: Response): Promise<void> => {
  try {
    const userCount = await User.countDocuments();

    if (userCount > 0 || !hasValidBootstrapSecret(req)) {
      res.status(403).json({
        error:
          "Public signup is disabled.",
      });
      return;
    }

    const { name, email, password } = req.body;
    const normalizedEmail = normalizeEmail(email);

    if (!name || !normalizedEmail || !password) {
      res.status(400).json({ error: "Name, email and password are required." });
      return;
    }

    const passwordError = validatePassword(password);
    if (passwordError) {
      res.status(400).json({ error: passwordError });
      return;
    }

    const hashedPassword = await bcrypt.hash(password, 12);
    const newUser: IUser = new User({
      name,
      email: normalizedEmail,
      password: hashedPassword,
      role: "super_admin",
      isActive: true,
      accountStatus: "active",
      passwordSetAt: new Date(),
      mailboxAccess: sanitizeMailboxAccess(
        SHARED_MAILBOXES.map((address) => ({ address, permission: "manage", type: "shared" })),
        normalizedEmail
      ),
    });

    await newUser.save();

    res.status(201).json({
      message: "Initial admin registered successfully.",
      user: sanitizeUser(newUser),
    });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
};

export const login = async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email: normalizeEmail(email) });

    if (!user) {
      res.status(400).json({ error: "Invalid email or password." });
      return;
    }

    if (!user.isActive || user.accountStatus === "disabled") {
      res.status(403).json({ error: "This admin account is disabled." });
      return;
    }

    if (!user.password || user.accountStatus === "pending") {
      res.status(403).json({
        code: "ACCOUNT_PENDING",
        error: "This admin account has not been activated yet.",
      });
      return;
    }

    const isMatch = await bcrypt.compare(String(password || ""), user.password);
    if (!isMatch) {
      res.status(400).json({ error: "Invalid email or password." });
      return;
    }

    res.status(200).json({
      token: signAdminToken(user),
      user: sanitizeUser(user),
    });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
};

export const checkActivation = async (req: Request, res: Response): Promise<void> => {
  try {
    const email = normalizeEmail(req.body?.email);
    const user = await User.findOne({ email });

    if (!user) {
      res.status(404).json({ error: "No pending admin account found for this email." });
      return;
    }

    if (!user.isActive || user.accountStatus === "disabled") {
      res.status(403).json({ error: "This admin account is disabled." });
      return;
    }

    if (user.password && user.accountStatus === "active") {
      res.status(409).json({ error: "This admin account is already active. Please log in." });
      return;
    }

    res.status(200).json({ message: "Admin account found. You can create your password.", user: sanitizeUser(user) });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
};

export const activateAccount = async (req: Request, res: Response): Promise<void> => {
  try {
    const email = normalizeEmail(req.body?.email);
    const { password, confirmPassword } = req.body;
    const passwordError = validatePassword(password, confirmPassword);

    if (passwordError) {
      res.status(400).json({ error: passwordError });
      return;
    }

    const user = await User.findOne({ email });
    if (!user) {
      res.status(404).json({ error: "No pending admin account found for this email." });
      return;
    }

    if (!user.isActive || user.accountStatus === "disabled") {
      res.status(403).json({ error: "This admin account is disabled." });
      return;
    }

    if (user.password && user.accountStatus === "active") {
      res.status(409).json({ error: "This admin account is already active. Please log in." });
      return;
    }

    user.password = await bcrypt.hash(String(password), 12);
    user.accountStatus = "active";
    user.isActive = true;
    user.passwordSetAt = new Date();
    await user.save();

    res.status(200).json({ token: signAdminToken(user), user: sanitizeUser(user) });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
};

export const changePassword = async (req: Request, res: Response): Promise<void> => {
  try {
    const { currentPassword, password, confirmPassword } = req.body;
    const user = await User.findById(req.user?._id);

    if (!user || !user.password) {
      res.status(404).json({ error: "Admin user not found." });
      return;
    }

    const matches = await bcrypt.compare(String(currentPassword || ""), user.password);
    if (!matches) {
      res.status(400).json({ error: "Current password is incorrect." });
      return;
    }

    const passwordError = validatePassword(password, confirmPassword);
    if (passwordError) {
      res.status(400).json({ error: passwordError });
      return;
    }

    user.password = await bcrypt.hash(String(password), 12);
    user.passwordSetAt = new Date();
    await user.save();

    res.status(200).json({ message: "Password changed successfully." });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
};

export const requestPasswordReset = async (req: Request, res: Response): Promise<void> => {
  try {
    const email = normalizeEmail(req.body?.email);
    const user = await User.findOne({ email });

    if (user && user.isActive && user.accountStatus !== "disabled") {
      await AdminNotification.create({
        type: "password_reset",
        status: "new",
        title: "Password reset request",
        message: "An admin requested a new password link.",
        targetUserId: user._id,
        targetEmail: user.email,
        targetName: user.name,
        createdByEmail: user.email,
      });
    }

    res.status(200).json({
      message: "If this account exists, a reset request has been recorded.",
    });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
};

export const completePasswordReset = async (req: Request, res: Response): Promise<void> => {
  try {
    const email = normalizeEmail(req.body?.email);
    const token = String(req.body?.token || "");
    const { password, confirmPassword } = req.body;
    const passwordError = validatePassword(password, confirmPassword);

    if (passwordError) {
      res.status(400).json({ error: passwordError });
      return;
    }

    const user = await User.findOne({ email, resetTokenHash: hashToken(token) });
    if (!user || !user.resetTokenExpiresAt || user.resetTokenExpiresAt.getTime() < Date.now()) {
      res.status(400).json({ error: "Invalid or expired reset link." });
      return;
    }

    user.password = await bcrypt.hash(String(password), 12);
    user.accountStatus = "active";
    user.isActive = true;
    user.passwordSetAt = new Date();
    user.resetTokenHash = undefined;
    user.resetTokenExpiresAt = undefined;
    await user.save();

    res.status(200).json({ token: signAdminToken(user), user: sanitizeUser(user) });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
};

export const listAdmins = async (_req: Request, res: Response): Promise<void> => {
  try {
    const users = await User.find({}, "-password -resetTokenHash").sort({ createdAt: -1 });
    res.status(200).json({ users: users.map((user) => sanitizeUser(user)) });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
};

export const createAdmin = async (req: Request, res: Response): Promise<void> => {
  try {
    const { name, email, role = "admin_1", mailboxAccess } = req.body;
    const nextRole = normalizeAdminRole(String(role));
    const normalizedEmail = normalizeEmail(email);

    if (!name || !normalizedEmail) {
      res.status(400).json({ error: "Name and email are required." });
      return;
    }

    if (!canAssignRole(req.user?.role, nextRole)) {
      res.status(403).json({
        error: "You are not allowed to create an admin with this level.",
      });
      return;
    }

    const existingUser = await User.findOne({ email: normalizedEmail });
    if (existingUser) {
      res.status(400).json({ error: "Email is already in use." });
      return;
    }

    const user: IUser = new User({
      name,
      email: normalizedEmail,
      password: "",
      role: nextRole,
      isActive: true,
      accountStatus: "pending",
      mailboxAccess: await sanitizeAssignableMailboxAccess(mailboxAccess, normalizedEmail),
      permissionsAllow: sanitizePermissionList(req.body?.permissionsAllow),
      permissionsDeny: sanitizePermissionList(req.body?.permissionsDeny),
    });

    await user.save();

    res.status(201).json({
      message: "Admin user created. The user must activate their account and choose a password.",
      user: sanitizeUser(user),
    });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
};

export const updateAdmin = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { name, role, isActive, mailboxAccess, permissionsAllow, permissionsDeny } = req.body;
    const target = await User.findById(id);

    if (!target) {
      res.status(404).json({ error: "Admin user not found." });
      return;
    }

    const isSelf = String(req.user?._id) === String(target._id);
    const requestedRole = role ? normalizeAdminRole(String(role)) : normalizeAdminRole(target.role);

    if (!canManageTargetRole(req.user?.role, target.role)) {
      res.status(403).json({ error: "You are not allowed to manage this admin level." });
      return;
    }

    if (role && !canAssignRole(req.user?.role, requestedRole)) {
      res.status(403).json({ error: "You are not allowed to assign this admin level." });
      return;
    }

    if (isSelf && (typeof isActive === "boolean" || (role && requestedRole !== normalizeAdminRole(target.role)))) {
      res.status(400).json({ error: "You cannot disable your own account or change your own role." });
      return;
    }

    if (name) target.name = name;
    if (role) target.role = requestedRole;
    if (typeof isActive === "boolean") {
      target.isActive = isActive;
      target.accountStatus = isActive ? (target.password ? "active" : "pending") : "disabled";
    }
    if (mailboxAccess !== undefined) {
      target.mailboxAccess = await sanitizeAssignableMailboxAccess(mailboxAccess, target.email) as any;
    }
    if (permissionsAllow !== undefined) {
      target.permissionsAllow = sanitizePermissionList(permissionsAllow) as any;
    }
    if (permissionsDeny !== undefined) {
      target.permissionsDeny = sanitizePermissionList(permissionsDeny) as any;
    }

    await target.save();

    res.status(200).json({ message: "Admin user updated successfully.", user: sanitizeUser(target) });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
};

export const createAdminPasswordReset = async (req: Request, res: Response): Promise<void> => {
  try {
    const target = await User.findById(req.params.id);

    if (!target) {
      res.status(404).json({ error: "Admin user not found." });
      return;
    }

    if (!canManageTargetRole(req.user?.role, target.role)) {
      res.status(403).json({ error: "You are not allowed to reset this admin password." });
      return;
    }

    const token = createPlainToken();
    target.resetTokenHash = hashToken(token);
    target.resetTokenExpiresAt = new Date(Date.now() + 60 * 60 * 1000);
    await target.save();

    res.status(200).json({
      message: "Password reset link generated. It expires in 1 hour.",
      resetLink: buildResetLink(target.email, token),
    });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
};

export const deleteAdmin = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const target = await User.findById(id);

    if (!target) {
      res.status(404).json({ error: "Admin user not found." });
      return;
    }

    if (String(req.user?._id) === String(target._id)) {
      res.status(400).json({ error: "You cannot delete your own account." });
      return;
    }

    if (!canManageTargetRole(req.user?.role, target.role)) {
      res.status(403).json({ error: "You are not allowed to delete this admin level." });
      return;
    }

    await target.deleteOne();
    res.status(200).json({ message: "Admin user deleted successfully." });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
};

export const promoteExistingAdmin = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    if (!hasValidBootstrapSecret(req)) {
      res.status(403).json({ error: "Invalid bootstrap secret." });
      return;
    }

    const existingSuperAdmin = await User.findOne({ role: "super_admin" });
    if (existingSuperAdmin) {
      res.status(409).json({ error: "An initial admin already exists." });
      return;
    }

    const { email } = req.body;
    const user = await User.findOneAndUpdate(
      { email: normalizeEmail(email) },
      { role: "super_admin", isActive: true, accountStatus: "active" },
      { new: true, runValidators: true }
    ).select("-password -resetTokenHash");

    if (!user) {
      res.status(404).json({ error: "Admin user not found." });
      return;
    }

    res.status(200).json({ message: "User promoted.", user: sanitizeUser(user as IUser) });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
};

export const verifyToken = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      res.status(400).json({
        valid: false,
        error: "No token provided or invalid header format",
      });
      return;
    }

    const token = authHeader.split(" ")[1];

    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      res.status(200).json({
        valid: true,
        decoded,
        message: "Token is valid",
      });
    } catch (err: any) {
      res.status(401).json({
        valid: false,
        error: err.message,
        errorType: err.name,
      });
    }
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
};
