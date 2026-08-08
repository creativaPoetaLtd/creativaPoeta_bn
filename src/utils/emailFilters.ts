export const DMARC_REPORT_FOLDER = "dmarc";

const normalize = (value?: string) => String(value || "").trim().toLowerCase();

export const isDmarcReport = (input: {
  fromName?: string;
  fromEmail?: string;
  subject?: string;
  text?: string;
  html?: string;
}) => {
  const fromEmail = normalize(input.fromEmail);
  const fromName = normalize(input.fromName);
  const subject = normalize(input.subject);
  const body = normalize(`${input.text || ""} ${input.html || ""}`).slice(0, 3000);

  if (fromEmail.includes("dmarc") || fromName.includes("dmarc")) return true;
  if (/\breport domain:\s*creativapoeta\.(com|be)\b/i.test(input.subject || "")) return true;
  if (subject.includes("dmarc aggregate report")) return true;
  if (subject.includes("submitter:") && subject.includes("report-id")) return true;
  if (body.includes("dmarc aggregate report") && body.includes("rua")) return true;

  return false;
};

export const dmarcReportMongoFilter = {
  $or: [
    { fromEmail: { $regex: "dmarc", $options: "i" } },
    { fromName: { $regex: "dmarc", $options: "i" } },
    { subject: { $regex: "(dmarc aggregate report|report domain:|submitter:.*report-id)", $options: "i" } },
    { text: { $regex: "dmarc aggregate report", $options: "i" } },
  ],
};
