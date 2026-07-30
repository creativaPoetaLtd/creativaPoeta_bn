import { Request, Response } from "express";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import User, { IUser } from "../models/User";
import { AdminRole, normalizeAdminRole } from "../middleware/authMiddleware";
import dotenv from "dotenv";

dotenv.config();

const JWT_SECRET = process.env.JWT_SECRET;
const ADMIN_BOOTSTRAP_SECRET = process.env.ADMIN_BOOTSTRAP_SECRET;

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
  super_admin: "Superadmin",
  admin_0: "Niveau 0 - Direction",
  admin_1: "Niveau 1 - Operations",
  admin_2: "Niveau 2 - Contenu & SEO",
  admin_3: "Niveau 3 - Support & email",
  admin_4: "Niveau 4 - Lecture & reporting",
  admin_5: "Niveau 5 - Acces limite",
};

const permissionsByRole: Record<CreatableAdminRole | "super_admin", string[]> = {
  super_admin: ["all", "manage_admin_0"],
  admin_0: ["all_except_admin_0_management"],
  admin_1: ["requests:manage", "email:send", "email:read", "jobs:manage"],
  admin_2: ["blogs:manage", "seo:manage", "email:read"],
  admin_3: ["email:manage", "contacts:reply", "assistance:reply"],
  admin_4: ["dashboard:read", "reports:read"],
  admin_5: ["assigned:read", "assigned:reply"],
};

const sanitizeUser = (user: IUser) => {
  const normalizedRole = normalizeAdminRole(user.role);
  const safeRole = normalizedRole === "admin" || normalizedRole === "editor" || normalizedRole === "viewer"
    ? "admin_5"
    : normalizedRole;

  return {
    id: user._id,
    name: user.name,
    email: user.email,
    role: safeRole,
    roleLabel: roleLabels[safeRole as keyof typeof roleLabels] || safeRole,
    permissions: permissionsByRole[safeRole as keyof typeof permissionsByRole] || [],
    isActive: user.isActive,
    createdAt: user.createdAt,
  };
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
          "Public signup is disabled. Admin users must be created by a super admin.",
      });
      return;
    }

    const { name, email, password } = req.body;

    if (!name || !email || !password) {
      res.status(400).json({ error: "Name, email and password are required." });
      return;
    }

    const hashedPassword = await bcrypt.hash(password, 12);
    const newUser: IUser = new User({
      name,
      email: String(email).toLowerCase().trim(),
      password: hashedPassword,
      role: "super_admin",
      isActive: true,
    });

    await newUser.save();

    res.status(201).json({
      message: "Initial super admin registered successfully.",
      user: sanitizeUser(newUser),
    });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
};

export const login = async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, password } = req.body;

    const user = await User.findOne({ email: String(email || "").toLowerCase().trim() });
    if (!user) {
      res.status(400).json({ error: "Invalid email or password." });
      return;
    }

    if (!user.isActive) {
      res.status(403).json({ error: "This admin account is disabled." });
      return;
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      res.status(400).json({ error: "Invalid email or password." });
      return;
    }

    const normalizedRole = normalizeAdminRole(user.role);
    const token = jwt.sign(
      {
        _id: user._id,
        email: user.email,
        role: normalizedRole,
        isActive: user.isActive,
      },
      JWT_SECRET,
      { expiresIn: "1d" }
    );

    res.status(200).json({
      token,
      user: sanitizeUser(user),
    });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
};

export const listAdmins = async (_req: Request, res: Response): Promise<void> => {
  try {
    const users = await User.find({}, "-password").sort({ createdAt: -1 });
    res.status(200).json({ users: users.map((user) => sanitizeUser(user)) });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
};

export const createAdmin = async (req: Request, res: Response): Promise<void> => {
  try {
    const { name, email, password, role = "admin_1" } = req.body;
    const nextRole = normalizeAdminRole(String(role));

    if (!name || !email || !password) {
      res.status(400).json({ error: "Name, email and password are required." });
      return;
    }

    if (!canAssignRole(req.user?.role, nextRole)) {
      res.status(403).json({
        error: "You are not allowed to create an admin with this level.",
      });
      return;
    }

    const normalizedEmail = String(email).toLowerCase().trim();
    const existingUser = await User.findOne({ email: normalizedEmail });
    if (existingUser) {
      res.status(400).json({ error: "Email is already in use." });
      return;
    }

    const hashedPassword = await bcrypt.hash(password, 12);
    const user: IUser = new User({
      name,
      email: normalizedEmail,
      password: hashedPassword,
      role: nextRole,
      isActive: true,
    });

    await user.save();

    res.status(201).json({
      message: "Admin user created successfully.",
      user: sanitizeUser(user),
    });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
};

export const updateAdmin = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { name, role, isActive, password } = req.body;
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
    if (typeof isActive === "boolean") target.isActive = isActive;
    if (password) target.password = await bcrypt.hash(password, 12);

    await target.save();

    res.status(200).json({ message: "Admin user updated successfully.", user: sanitizeUser(target) });
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
      res.status(409).json({ error: "A super admin already exists." });
      return;
    }

    const { email } = req.body;
    const user = await User.findOneAndUpdate(
      { email: String(email || "").toLowerCase().trim() },
      { role: "super_admin", isActive: true },
      { new: true, runValidators: true }
    ).select("-password");

    if (!user) {
      res.status(404).json({ error: "Admin user not found." });
      return;
    }

    res.status(200).json({ message: "User promoted to super admin.", user: sanitizeUser(user as IUser) });
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
