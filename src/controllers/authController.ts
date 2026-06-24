import { Request, Response } from "express";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import User, { IUser } from "../models/User";
import dotenv from "dotenv";

dotenv.config();

const JWT_SECRET = process.env.JWT_SECRET;
const ADMIN_BOOTSTRAP_SECRET = process.env.ADMIN_BOOTSTRAP_SECRET;

if (!JWT_SECRET) {
  throw new Error("JWT_SECRET is not defined in the environment variables.");
}

const allowedRoles = ["super_admin", "admin", "editor", "viewer"] as const;
type AdminRole = (typeof allowedRoles)[number];

const sanitizeUser = (user: IUser) => ({
  id: user._id,
  name: user.name,
  email: user.email,
  role: user.role,
  isActive: user.isActive,
  createdAt: user.createdAt,
});

const getBootstrapSecret = (req: Request) =>
  req.headers["x-admin-bootstrap-secret"] || req.body?.bootstrapSecret;

const hasValidBootstrapSecret = (req: Request) =>
  Boolean(ADMIN_BOOTSTRAP_SECRET) &&
  getBootstrapSecret(req) === ADMIN_BOOTSTRAP_SECRET;

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
      email: email.toLowerCase().trim(),
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

    const token = jwt.sign(
      {
        _id: user._id,
        email: user.email,
        role: user.role,
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
    res.status(200).json({ users });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
};

export const createAdmin = async (req: Request, res: Response): Promise<void> => {
  try {
    const { name, email, password, role = "admin" } = req.body;

    if (!name || !email || !password) {
      res.status(400).json({ error: "Name, email and password are required." });
      return;
    }

    if (!allowedRoles.includes(role as AdminRole)) {
      res.status(400).json({ error: "Invalid role." });
      return;
    }

    const existingUser = await User.findOne({ email: email.toLowerCase().trim() });
    if (existingUser) {
      res.status(400).json({ error: "Email is already in use." });
      return;
    }

    const hashedPassword = await bcrypt.hash(password, 12);
    const user: IUser = new User({
      name,
      email: email.toLowerCase().trim(),
      password: hashedPassword,
      role,
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
    const update: Partial<Pick<IUser, "name" | "role" | "isActive" | "password">> = {};

    if (name) update.name = name;
    if (typeof isActive === "boolean") update.isActive = isActive;
    if (role) {
      if (!allowedRoles.includes(role as AdminRole)) {
        res.status(400).json({ error: "Invalid role." });
        return;
      }
      update.role = role;
    }
    if (password) update.password = await bcrypt.hash(password, 12);

    const user = await User.findByIdAndUpdate(id, update, {
      new: true,
      runValidators: true,
    }).select("-password");

    if (!user) {
      res.status(404).json({ error: "Admin user not found." });
      return;
    }

    res.status(200).json({ message: "Admin user updated successfully.", user });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
};

export const deleteAdmin = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    if (req.user?._id === id) {
      res.status(400).json({ error: "You cannot delete your own account." });
      return;
    }

    const user = await User.findByIdAndDelete(id);
    if (!user) {
      res.status(404).json({ error: "Admin user not found." });
      return;
    }

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

    res.status(200).json({ message: "User promoted to super admin.", user });
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
