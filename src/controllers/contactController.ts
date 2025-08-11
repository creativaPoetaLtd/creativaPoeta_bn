import { Request, Response, NextFunction } from "express";
import sendEmail from "../utils/sendEmail";
import Query, { IQuery } from "../models/Query";

// Submit contact form (public endpoint)
export const sendContactDetails = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { fullName, email, message } = req.body;

    if (!fullName || !email || !message) {
      res.status(400).json({ message: "Required fields are missing." });
      return;
    }

    // Save to database
    const newQuery = new Query({
      name: fullName,
      email,
      message,
      status: "pending",
      isReplied: false,
    });

    const savedQuery = await newQuery.save();

    // Send email notification
    let emailSent = false;
    try {
      const htmlContent = `
                <h2>New Contact Form Submission</h2>
                <p><strong>Query ID:</strong> ${savedQuery._id}</p>
                <p><strong>Full Name:</strong> ${fullName}</p>
                <p><strong>Email:</strong> ${email}</p>
                <p><strong>Message:</strong> ${message}</p>
                <p><strong>Submitted At:</strong> ${savedQuery.createdAt}</p>
            `;

      const recipientEmail = process.env.EMAIL_USER;
      if (recipientEmail) {
        await sendEmail(
          recipientEmail,
          "New Contact Form Submission",
          htmlContent
        );
        emailSent = true;
      }
    } catch (emailError) {
      console.error("Email sending failed:", emailError);
      // Don't fail the request if email fails
    }

    res.status(200).json({
      message: "Contact form submitted successfully!",
      queryId: savedQuery._id,
      status: "pending",
      emailSent,
    });
  } catch (error) {
    next(error);
  }
};

// Get all contact queries (admin only)
export const getAllQueries = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const status = req.query.status as string;

    // Build filter
    const filter: any = {};
    if (status && status !== "all") {
      filter.status = status;
    }

    // Get queries with pagination
    const skip = (page - 1) * limit;
    const queries = await Query.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const totalQueries = await Query.countDocuments(filter);
    const totalPages = Math.ceil(totalQueries / limit);

    res.status(200).json({
      message: "Queries fetched successfully",
      queries,
      pagination: {
        currentPage: page,
        totalPages,
        totalQueries,
        limit,
      },
    });
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch queries" });
  }
};

// Get single contact query (admin only)
export const getQuery = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    const query = await Query.findById(id);
    if (!query) {
      res.status(404).json({ message: "Query not found" });
      return;
    }

    res.status(200).json({
      message: "Query fetched successfully",
      query,
    });
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch query" });
  }
};

// Reply to contact query (admin only)
export const replyToQuery = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { id } = req.params;
    const { replyMessage, subject } = req.body;
    const userEmail = (req.user as any)?.email;

    if (!replyMessage) {
      res.status(400).json({ message: "Reply message is required" });
      return;
    }

    const query = await Query.findById(id);
    if (!query) {
      res.status(404).json({ message: "Query not found" });
      return;
    }

    // Update query with reply
    query.replyMessage = replyMessage;
    query.isReplied = true;
    query.repliedAt = new Date();
    query.repliedBy = userEmail;
    query.status = "replied";
    await query.save();

    // Send reply email
    let emailSent = false;
    try {
      const emailSubject = subject || `Re: Your Contact Form Inquiry`;
      const htmlContent = `
                <h2>Reply to Your Contact Form Inquiry</h2>
                <p>Dear ${query.name},</p>
                <p>Thank you for contacting us. Here is our response:</p>
                <div style="background-color: #f5f5f5; padding: 15px; margin: 10px 0; border-left: 4px solid #007bff;">
                    ${replyMessage.replace(/\n/g, "<br>")}
                </div>
                <p>If you have any further questions, please don't hesitate to reach out.</p>
                <p>Best regards,<br>Creativa Poeta Team</p>
                
                <hr style="margin: 20px 0;">
                <h3>Original Message:</h3>
                <p><strong>Your Message:</strong> ${query.message}</p>
                <p><strong>Submitted:</strong> ${query.createdAt}</p>
            `;

      await sendEmail(query.email, emailSubject, htmlContent);
      emailSent = true;
    } catch (emailError) {
      console.error("Reply email sending failed:", emailError);
      // Don't fail the request if email fails
    }

    res.status(200).json({
      message: "Reply sent successfully",
      query,
      emailSent,
    });
  } catch (error) {
    res.status(500).json({ message: "Failed to send reply" });
  }
};

// Update query status (admin only)
export const updateQueryStatus = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!["pending", "replied", "closed"].includes(status)) {
      res.status(400).json({ message: "Invalid status" });
      return;
    }

    const query = await Query.findByIdAndUpdate(id, { status }, { new: true });

    if (!query) {
      res.status(404).json({ message: "Query not found" });
      return;
    }

    res.status(200).json({
      message: "Query status updated successfully",
      query,
    });
  } catch (error) {
    res.status(500).json({ message: "Failed to update query status" });
  }
};

// Delete contact query (admin only)
export const deleteQuery = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { id } = req.params;

    const query = await Query.findByIdAndDelete(id);
    if (!query) {
      res.status(404).json({ message: "Query not found" });
      return;
    }

    res.status(200).json({
      message: "Query deleted successfully",
    });
  } catch (error) {
    res.status(500).json({ message: "Failed to delete query" });
  }
};
