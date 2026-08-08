"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.spamMessageMongoFilter = exports.isSpamMessage = exports.isDmarcReport = exports.SPAM_FOLDER = void 0;
exports.SPAM_FOLDER = "spam";
const normalize = (value) => String(value || "").trim().toLowerCase();
const isDmarcReport = (input) => {
    const fromEmail = normalize(input.fromEmail);
    const fromName = normalize(input.fromName);
    const subject = normalize(input.subject);
    const body = normalize(`${input.text || ""} ${input.html || ""}`).slice(0, 3000);
    if (fromEmail.includes("dmarc") || fromName.includes("dmarc"))
        return true;
    if (/\breport domain:\s*creativapoeta\.(com|be)\b/i.test(input.subject || ""))
        return true;
    if (subject.includes("dmarc aggregate report"))
        return true;
    if (subject.includes("submitter:") && subject.includes("report-id"))
        return true;
    if (body.includes("dmarc aggregate report") && body.includes("rua"))
        return true;
    return false;
};
exports.isDmarcReport = isDmarcReport;
const getConfiguredSpamSenders = () => String(process.env.EMAIL_SPAM_SENDERS || "")
    .split(/[,;\n]/)
    .map(normalize)
    .filter(Boolean);
const getConfiguredSpamSubjects = () => String(process.env.EMAIL_SPAM_SUBJECTS || "")
    .split(/[,;\n]/)
    .map(normalize)
    .filter(Boolean);
const isSpamMessage = (input) => {
    if ((0, exports.isDmarcReport)(input))
        return true;
    const fromEmail = normalize(input.fromEmail);
    const fromName = normalize(input.fromName);
    const subject = normalize(input.subject);
    const sourceFolder = normalize(input.sourceFolder);
    const sourceSpecialUse = normalize(input.sourceSpecialUse);
    const senderDomain = fromEmail.split("@").pop() || "";
    if (sourceSpecialUse === "\\junk")
        return true;
    if (/(^|[\/._ -])(spam|junk|promotions?|ind[eé]sirables?|courrier ind[eé]sirable)([\/._ -]|$)/i.test(sourceFolder)) {
        return true;
    }
    // Infomaniak's automated reports are operational noise for CP Mail and are
    // intentionally grouped with spam, as requested by the mailbox owner.
    if (senderDomain === "infomaniak.com" || senderDomain.endsWith(".infomaniak.com"))
        return true;
    if (fromName.includes("infomaniak") && /(report|rapport|dmarc|security|securite|sécurité)/i.test(subject)) {
        return true;
    }
    if (getConfiguredSpamSenders().some((entry) => fromEmail === entry || fromEmail.endsWith(`@${entry}`))) {
        return true;
    }
    return getConfiguredSpamSubjects().some((entry) => subject.includes(entry));
};
exports.isSpamMessage = isSpamMessage;
exports.spamMessageMongoFilter = {
    $or: [
        { folder: "dmarc" },
        { fromEmail: { $regex: "dmarc", $options: "i" } },
        { fromName: { $regex: "dmarc", $options: "i" } },
        { fromEmail: { $regex: "@([^.]+\\.)*infomaniak\\.com$", $options: "i" } },
        { subject: { $regex: "(dmarc aggregate report|report domain:|submitter:.*report-id)", $options: "i" } },
        { text: { $regex: "dmarc aggregate report", $options: "i" } },
    ],
};
