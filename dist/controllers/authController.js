"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.verifyToken = exports.promoteExistingAdmin = exports.deleteAdmin = exports.createAdminPasswordReset = exports.updateAdmin = exports.createAdmin = exports.listAdmins = exports.completePasswordReset = exports.requestPasswordReset = exports.changePassword = exports.activateAccount = exports.checkActivation = exports.login = exports.signup = void 0;
const bcrypt_1 = __importDefault(require("bcrypt"));
const crypto_1 = __importDefault(require("crypto"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const User_1 = __importDefault(require("../models/User"));
const AdminNotification_1 = __importDefault(require("../models/AdminNotification"));
const authMiddleware_1 = require("../middleware/authMiddleware");
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
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
];
const roleLabels = {
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
];
const permissionCatalog = new Set(allPermissionKeys);
const permissionsByRole = {
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
    ],
    admin_2: ["dashboard:read", "requests:visibility", "email:read", "blogs:manage", "seo:manage", "internal:messages", "reports:read"],
    admin_3: ["dashboard:read", "requests:assistance", "contacts:read", "contacts:reply", "email:read", "email:send", "email:manage", "internal:messages"],
    admin_4: ["dashboard:read", "internal:messages", "reports:read"],
    admin_5: ["dashboard:read", "email:read", "internal:messages"],
};
const PASSWORD_MIN_LENGTH = 8;
const SHARED_MAILBOXES = ["contact@creativapoeta.com", "contact@creativapoeta.be"];
const normalizeEmail = (email) => String(email || "").toLowerCase().trim();
const sanitizeMailboxAccess = (mailboxAccess, personalEmail) => {
    const rows = Array.isArray(mailboxAccess) ? mailboxAccess : [];
    const normalizedRows = rows
        .map((item) => ({
        address: normalizeEmail(item === null || item === void 0 ? void 0 : item.address),
        permission: ["read", "send", "manage"].includes(item === null || item === void 0 ? void 0 : item.permission) ? item.permission : "read",
        type: (item === null || item === void 0 ? void 0 : item.type) === "personal" ? "personal" : "shared",
    }))
        .filter((item) => item.address);
    const byAddress = new Map();
    byAddress.set(personalEmail, { address: personalEmail, permission: "manage", type: "personal" });
    normalizedRows.forEach((item) => byAddress.set(item.address, item));
    return Array.from(byAddress.values());
};
const sanitizeAssignableMailboxAccess = async (mailboxAccess, personalEmail) => {
    const normalizedPersonalEmail = normalizeEmail(personalEmail);
    const reservedPersonalMailboxes = new Set((await User_1.default.find({ email: { $ne: normalizedPersonalEmail } })
        .select("email")
        .lean())
        .map((user) => normalizeEmail(user.email))
        .filter(Boolean));
    const rows = sanitizeMailboxAccess(mailboxAccess, normalizedPersonalEmail).filter((mailbox) => {
        if (mailbox.address === normalizedPersonalEmail)
            return true;
        if (mailbox.type === "personal")
            return false;
        return !reservedPersonalMailboxes.has(mailbox.address);
    });
    return rows.map((mailbox) => mailbox.address === normalizedPersonalEmail
        ? { ...mailbox, permission: "manage", type: "personal" }
        : { ...mailbox, type: "shared" });
};
const sanitizePermissionList = (value) => {
    const rows = Array.isArray(value) ? value : [];
    return Array.from(new Set(rows
        .map((item) => String(item || "").trim())
        .filter((item) => permissionCatalog.has(item))));
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
const getCpgGroupLevels = (groupKey) => {
    const digits = groupKey.replace("CPG", "");
    if (digits.length === 1)
        return [Number(digits)];
    const start = Number(digits[0]);
    const end = Number(digits[1]);
    if (Number.isNaN(start) || Number.isNaN(end) || start > end)
        return [];
    return Array.from({ length: end - start + 1 }, (_, index) => start + index);
};
const getRoleInternalGroups = (role) => {
    if (role === "super_admin")
        return [];
    const level = Number(role.replace("admin_", ""));
    if (Number.isNaN(level))
        return [];
    return cpgGroupKeys.filter((groupKey) => getCpgGroupLevels(groupKey).includes(level));
};
const getEffectivePermissions = (user, role) => {
    const base = new Set(permissionsByRole[role] || []);
    (user.permissionsAllow || []).forEach((permission) => {
        if (permissionCatalog.has(permission))
            base.add(permission);
    });
    (user.permissionsDeny || []).forEach((permission) => base.delete(permission));
    return Array.from(base);
};
const sanitizeUser = (user) => {
    const normalizedRole = (0, authMiddleware_1.getEffectiveAdminRole)(user.role, user.email);
    const safeRole = normalizedRole === "admin" || normalizedRole === "editor" || normalizedRole === "viewer"
        ? "admin_5"
        : normalizedRole;
    return {
        id: user._id,
        name: user.name,
        email: user.email,
        role: safeRole,
        roleLabel: roleLabels[safeRole] || safeRole,
        permissions: getEffectivePermissions(user, safeRole),
        permissionsAllow: user.permissionsAllow || [],
        permissionsDeny: user.permissionsDeny || [],
        internalGroups: Array.from(new Set([...(user.internalGroups || []), ...getRoleInternalGroups(safeRole)])).filter((group) => cpgGroupKeys.includes(group)),
        isActive: user.isActive,
        accountStatus: user.accountStatus || (user.password ? "active" : "pending"),
        mailboxAccess: user.mailboxAccess || [],
        createdAt: user.createdAt,
    };
};
const signAdminToken = (user) => {
    const normalizedRole = (0, authMiddleware_1.getEffectiveAdminRole)(user.role, user.email);
    return jsonwebtoken_1.default.sign({
        _id: user._id,
        name: user.name,
        email: user.email,
        role: normalizedRole,
        isActive: user.isActive,
    }, JWT_SECRET, { expiresIn: "1d" });
};
const createPlainToken = () => crypto_1.default.randomBytes(32).toString("hex");
const hashToken = (token) => crypto_1.default.createHash("sha256").update(token).digest("hex");
const buildResetLink = (email, token) => `${FRONTEND_URL}/secure-admin-login-2024?resetToken=${token}&email=${encodeURIComponent(email)}`;
const validatePassword = (password, confirmPassword) => {
    const nextPassword = String(password || "");
    if (nextPassword.length < PASSWORD_MIN_LENGTH) {
        return `Password must contain at least ${PASSWORD_MIN_LENGTH} characters.`;
    }
    if (confirmPassword !== undefined && nextPassword !== String(confirmPassword || "")) {
        return "Passwords do not match.";
    }
    return null;
};
const getBootstrapSecret = (req) => { var _a; return req.headers["x-admin-bootstrap-secret"] || ((_a = req.body) === null || _a === void 0 ? void 0 : _a.bootstrapSecret); };
const hasValidBootstrapSecret = (req) => Boolean(ADMIN_BOOTSTRAP_SECRET) &&
    getBootstrapSecret(req) === ADMIN_BOOTSTRAP_SECRET;
const isCreatableRole = (role) => allowedRoles.includes(role);
const canManageTargetRole = (actorRole, targetRole) => {
    const actor = (0, authMiddleware_1.normalizeAdminRole)(actorRole);
    const target = (0, authMiddleware_1.normalizeAdminRole)(targetRole);
    if (actor === "super_admin")
        return true;
    if (actor === "admin_0") {
        return !["super_admin", "admin_0", "admin"].includes(target);
    }
    return false;
};
const canAssignRole = (actorRole, nextRole) => {
    const actor = (0, authMiddleware_1.normalizeAdminRole)(actorRole);
    const next = (0, authMiddleware_1.normalizeAdminRole)(nextRole);
    if (next === "super_admin")
        return false;
    if (actor === "super_admin")
        return isCreatableRole(next);
    if (actor === "admin_0")
        return isCreatableRole(next) && next !== "admin_0";
    return false;
};
const signup = async (req, res) => {
    try {
        const userCount = await User_1.default.countDocuments();
        if (userCount > 0 || !hasValidBootstrapSecret(req)) {
            res.status(403).json({
                error: "Public signup is disabled.",
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
        const hashedPassword = await bcrypt_1.default.hash(password, 12);
        const newUser = new User_1.default({
            name,
            email: normalizedEmail,
            password: hashedPassword,
            role: "super_admin",
            isActive: true,
            accountStatus: "active",
            passwordSetAt: new Date(),
            mailboxAccess: sanitizeMailboxAccess(SHARED_MAILBOXES.map((address) => ({ address, permission: "manage", type: "shared" })), normalizedEmail),
        });
        await newUser.save();
        res.status(201).json({
            message: "Initial admin registered successfully.",
            user: sanitizeUser(newUser),
        });
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
};
exports.signup = signup;
const login = async (req, res) => {
    try {
        const { email, password } = req.body;
        const user = await User_1.default.findOne({ email: normalizeEmail(email) });
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
        const isMatch = await bcrypt_1.default.compare(String(password || ""), user.password);
        if (!isMatch) {
            res.status(400).json({ error: "Invalid email or password." });
            return;
        }
        res.status(200).json({
            token: signAdminToken(user),
            user: sanitizeUser(user),
        });
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
};
exports.login = login;
const checkActivation = async (req, res) => {
    var _a;
    try {
        const email = normalizeEmail((_a = req.body) === null || _a === void 0 ? void 0 : _a.email);
        const user = await User_1.default.findOne({ email });
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
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
};
exports.checkActivation = checkActivation;
const activateAccount = async (req, res) => {
    var _a;
    try {
        const email = normalizeEmail((_a = req.body) === null || _a === void 0 ? void 0 : _a.email);
        const { password, confirmPassword } = req.body;
        const passwordError = validatePassword(password, confirmPassword);
        if (passwordError) {
            res.status(400).json({ error: passwordError });
            return;
        }
        const user = await User_1.default.findOne({ email });
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
        user.password = await bcrypt_1.default.hash(String(password), 12);
        user.accountStatus = "active";
        user.isActive = true;
        user.passwordSetAt = new Date();
        await user.save();
        res.status(200).json({ token: signAdminToken(user), user: sanitizeUser(user) });
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
};
exports.activateAccount = activateAccount;
const changePassword = async (req, res) => {
    var _a;
    try {
        const { currentPassword, password, confirmPassword } = req.body;
        const user = await User_1.default.findById((_a = req.user) === null || _a === void 0 ? void 0 : _a._id);
        if (!user || !user.password) {
            res.status(404).json({ error: "Admin user not found." });
            return;
        }
        const matches = await bcrypt_1.default.compare(String(currentPassword || ""), user.password);
        if (!matches) {
            res.status(400).json({ error: "Current password is incorrect." });
            return;
        }
        const passwordError = validatePassword(password, confirmPassword);
        if (passwordError) {
            res.status(400).json({ error: passwordError });
            return;
        }
        user.password = await bcrypt_1.default.hash(String(password), 12);
        user.passwordSetAt = new Date();
        await user.save();
        res.status(200).json({ message: "Password changed successfully." });
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
};
exports.changePassword = changePassword;
const requestPasswordReset = async (req, res) => {
    var _a;
    try {
        const email = normalizeEmail((_a = req.body) === null || _a === void 0 ? void 0 : _a.email);
        const user = await User_1.default.findOne({ email });
        if (user && user.isActive && user.accountStatus !== "disabled") {
            await AdminNotification_1.default.create({
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
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
};
exports.requestPasswordReset = requestPasswordReset;
const completePasswordReset = async (req, res) => {
    var _a, _b;
    try {
        const email = normalizeEmail((_a = req.body) === null || _a === void 0 ? void 0 : _a.email);
        const token = String(((_b = req.body) === null || _b === void 0 ? void 0 : _b.token) || "");
        const { password, confirmPassword } = req.body;
        const passwordError = validatePassword(password, confirmPassword);
        if (passwordError) {
            res.status(400).json({ error: passwordError });
            return;
        }
        const user = await User_1.default.findOne({ email, resetTokenHash: hashToken(token) });
        if (!user || !user.resetTokenExpiresAt || user.resetTokenExpiresAt.getTime() < Date.now()) {
            res.status(400).json({ error: "Invalid or expired reset link." });
            return;
        }
        user.password = await bcrypt_1.default.hash(String(password), 12);
        user.accountStatus = "active";
        user.isActive = true;
        user.passwordSetAt = new Date();
        user.resetTokenHash = undefined;
        user.resetTokenExpiresAt = undefined;
        await user.save();
        res.status(200).json({ token: signAdminToken(user), user: sanitizeUser(user) });
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
};
exports.completePasswordReset = completePasswordReset;
const listAdmins = async (_req, res) => {
    try {
        const users = await User_1.default.find({}, "-password -resetTokenHash").sort({ createdAt: -1 });
        res.status(200).json({ users: users.map((user) => sanitizeUser(user)) });
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
};
exports.listAdmins = listAdmins;
const createAdmin = async (req, res) => {
    var _a, _b, _c;
    try {
        const { name, email, role = "admin_1", mailboxAccess } = req.body;
        const nextRole = (0, authMiddleware_1.normalizeAdminRole)(String(role));
        const normalizedEmail = normalizeEmail(email);
        if (!name || !normalizedEmail) {
            res.status(400).json({ error: "Name and email are required." });
            return;
        }
        if (!canAssignRole((_a = req.user) === null || _a === void 0 ? void 0 : _a.role, nextRole)) {
            res.status(403).json({
                error: "You are not allowed to create an admin with this level.",
            });
            return;
        }
        const existingUser = await User_1.default.findOne({ email: normalizedEmail });
        if (existingUser) {
            res.status(400).json({ error: "Email is already in use." });
            return;
        }
        const user = new User_1.default({
            name,
            email: normalizedEmail,
            password: "",
            role: nextRole,
            isActive: true,
            accountStatus: "pending",
            mailboxAccess: await sanitizeAssignableMailboxAccess(mailboxAccess, normalizedEmail),
            permissionsAllow: sanitizePermissionList((_b = req.body) === null || _b === void 0 ? void 0 : _b.permissionsAllow),
            permissionsDeny: sanitizePermissionList((_c = req.body) === null || _c === void 0 ? void 0 : _c.permissionsDeny),
        });
        await user.save();
        res.status(201).json({
            message: "Admin user created. The user must activate their account and choose a password.",
            user: sanitizeUser(user),
        });
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
};
exports.createAdmin = createAdmin;
const updateAdmin = async (req, res) => {
    var _a, _b, _c;
    try {
        const { id } = req.params;
        const { name, role, isActive, mailboxAccess, permissionsAllow, permissionsDeny } = req.body;
        const target = await User_1.default.findById(id);
        if (!target) {
            res.status(404).json({ error: "Admin user not found." });
            return;
        }
        const isSelf = String((_a = req.user) === null || _a === void 0 ? void 0 : _a._id) === String(target._id);
        const requestedRole = role ? (0, authMiddleware_1.normalizeAdminRole)(String(role)) : (0, authMiddleware_1.normalizeAdminRole)(target.role);
        if (!canManageTargetRole((_b = req.user) === null || _b === void 0 ? void 0 : _b.role, target.role)) {
            res.status(403).json({ error: "You are not allowed to manage this admin level." });
            return;
        }
        if (role && !canAssignRole((_c = req.user) === null || _c === void 0 ? void 0 : _c.role, requestedRole)) {
            res.status(403).json({ error: "You are not allowed to assign this admin level." });
            return;
        }
        if (isSelf && (typeof isActive === "boolean" || (role && requestedRole !== (0, authMiddleware_1.normalizeAdminRole)(target.role)))) {
            res.status(400).json({ error: "You cannot disable your own account or change your own role." });
            return;
        }
        if (name)
            target.name = name;
        if (role)
            target.role = requestedRole;
        if (typeof isActive === "boolean") {
            target.isActive = isActive;
            target.accountStatus = isActive ? (target.password ? "active" : "pending") : "disabled";
        }
        if (mailboxAccess !== undefined) {
            target.mailboxAccess = await sanitizeAssignableMailboxAccess(mailboxAccess, target.email);
        }
        if (permissionsAllow !== undefined) {
            target.permissionsAllow = sanitizePermissionList(permissionsAllow);
        }
        if (permissionsDeny !== undefined) {
            target.permissionsDeny = sanitizePermissionList(permissionsDeny);
        }
        await target.save();
        res.status(200).json({ message: "Admin user updated successfully.", user: sanitizeUser(target) });
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
};
exports.updateAdmin = updateAdmin;
const createAdminPasswordReset = async (req, res) => {
    var _a;
    try {
        const target = await User_1.default.findById(req.params.id);
        if (!target) {
            res.status(404).json({ error: "Admin user not found." });
            return;
        }
        if (!canManageTargetRole((_a = req.user) === null || _a === void 0 ? void 0 : _a.role, target.role)) {
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
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
};
exports.createAdminPasswordReset = createAdminPasswordReset;
const deleteAdmin = async (req, res) => {
    var _a, _b;
    try {
        const { id } = req.params;
        const target = await User_1.default.findById(id);
        if (!target) {
            res.status(404).json({ error: "Admin user not found." });
            return;
        }
        if (String((_a = req.user) === null || _a === void 0 ? void 0 : _a._id) === String(target._id)) {
            res.status(400).json({ error: "You cannot delete your own account." });
            return;
        }
        if (!canManageTargetRole((_b = req.user) === null || _b === void 0 ? void 0 : _b.role, target.role)) {
            res.status(403).json({ error: "You are not allowed to delete this admin level." });
            return;
        }
        await target.deleteOne();
        res.status(200).json({ message: "Admin user deleted successfully." });
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
};
exports.deleteAdmin = deleteAdmin;
const promoteExistingAdmin = async (req, res) => {
    try {
        if (!hasValidBootstrapSecret(req)) {
            res.status(403).json({ error: "Invalid bootstrap secret." });
            return;
        }
        const existingSuperAdmin = await User_1.default.findOne({ role: "super_admin" });
        if (existingSuperAdmin) {
            res.status(409).json({ error: "An initial admin already exists." });
            return;
        }
        const { email } = req.body;
        const user = await User_1.default.findOneAndUpdate({ email: normalizeEmail(email) }, { role: "super_admin", isActive: true, accountStatus: "active" }, { new: true, runValidators: true }).select("-password -resetTokenHash");
        if (!user) {
            res.status(404).json({ error: "Admin user not found." });
            return;
        }
        res.status(200).json({ message: "User promoted.", user: sanitizeUser(user) });
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
};
exports.promoteExistingAdmin = promoteExistingAdmin;
const verifyToken = async (req, res) => {
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
            const decoded = jsonwebtoken_1.default.verify(token, JWT_SECRET);
            res.status(200).json({
                valid: true,
                decoded,
                message: "Token is valid",
            });
        }
        catch (err) {
            res.status(401).json({
                valid: false,
                error: err.message,
                errorType: err.name,
            });
        }
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
};
exports.verifyToken = verifyToken;
