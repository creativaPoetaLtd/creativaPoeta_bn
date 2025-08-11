import { Request, Response, NextFunction } from "express";
import sendEmail from "../utils/sendEmail";
import ProjectRequest from "../models/ProjectDescription";
import dotenv from "dotenv";

dotenv.config();

export const sendProjectInquiry = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const {
      name,
      email,
      phone,
      company,
      projectType,
      deliverables,
      mainGoal,
      audience,
      stylePreference,
      contentElements,
      budget,
      timeline,
      status,
      projectPurpose,
      additionalInfo,
    } = req.body;

    if (
      !name ||
      !email ||
      !phone ||
      !projectType ||
      !deliverables ||
      !audience ||
      !contentElements ||
      !projectPurpose ||
      !mainGoal ||
      !stylePreference ||
      !budget ||
      !timeline
    ) {
      res.status(400).json({ message: "Required fields are missing." });
      return;
    }

    // Create and save project request to database
    const projectRequest = new ProjectRequest({
      name: name.trim(),
      email: email.trim().toLowerCase(),
      phone: phone.trim(),
      company: company?.trim(),
      projectType: projectType.trim(),
      deliverables: Array.isArray(deliverables)
        ? deliverables.map((d: string) => d.trim())
        : [deliverables.trim()],
      mainGoal: mainGoal.trim(),
      audience: Array.isArray(audience)
        ? audience.map((a: string) => a.trim())
        : [audience.trim()],
      stylePreference: stylePreference.trim(),
      contentElements: Array.isArray(contentElements)
        ? contentElements.map((c: string) => c.trim())
        : [contentElements.trim()],
      budget: Number(budget),
      timeline: timeline.trim(),
      projectPurpose: Array.isArray(projectPurpose)
        ? projectPurpose.map((p: string) => p.trim())
        : [projectPurpose.trim()],
      additionalInfo: additionalInfo?.trim(),
      status: status || "pending",
    });

    const savedRequest = await projectRequest.save();

    // Construct the HTML content for the email
    const htmlContent = `
            <h2>New Project Inquiry</h2>
            <p><strong>Request ID:</strong> ${savedRequest._id}</p>
            <p><strong>Name:</strong> ${name}</p>
            <p><strong>Email:</strong> ${email}</p>
            <p><strong>Phone:</strong> ${phone}</p>
            <p><strong>Company:</strong> ${company || "N/A"}</p>
            <p><strong>Project Type:</strong> ${projectType}</p>
            <p><strong>Deliverables:</strong> ${
              deliverables.length ? deliverables.join(", ") : "N/A"
            }</p>
            <p><strong>Main Goal:</strong> ${mainGoal || "N/A"}</p>
            <p><strong>Audience:</strong> ${
              audience.length ? audience.join(", ") : "N/A"
            }</p>
            <p><strong>Style Preference:</strong> ${
              stylePreference || "N/A"
            }</p>
            <p><strong>Content Elements:</strong> ${
              contentElements.length ? contentElements.join(", ") : "N/A"
            }</p>
            <p><strong>Budget:</strong> ${budget || "N/A"}</p>
            <p><strong>Timeline:</strong> ${timeline || "N/A"}</p>
            <p><strong>Project Purpose:</strong> ${
              projectPurpose.length ? projectPurpose.join(", ") : "N/A"
            }</p>
            <p><strong>Additional Information:</strong> ${
              additionalInfo || "N/A"
            }</p>
            <p><strong>Submitted:</strong> ${new Date().toLocaleString()}</p>
        `;

    // Send the email
    const emailUser = process.env.EMAIL_USER;
    if (!emailUser) {
      res.status(500).json({ message: "Email user is not defined." });
      return;
    }

    await sendEmail(emailUser, "New Project Inquiry", htmlContent);

    res.status(201).json({
      message: "Inquiry sent and saved successfully!",
      requestId: savedRequest._id,
      status: savedRequest.status,
    });
  } catch (error) {
    next(error);
  }
};

// Get all project requests for dashboard
export const getAllProjectRequests = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { status, page = 1, limit = 10 } = req.query;

    const filter: any = {};
    if (status && status !== "all") {
      filter.status = status;
    }

    const skip = (Number(page) - 1) * Number(limit);

    const requests = await ProjectRequest.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(Number(limit));

    const total = await ProjectRequest.countDocuments(filter);

    res.status(200).json({
      message: "Project requests fetched successfully",
      requests,
      pagination: {
        currentPage: Number(page),
        totalPages: Math.ceil(total / Number(limit)),
        totalRequests: total,
        limit: Number(limit),
      },
    });
  } catch (error) {
    next(error);
  }
};

// Get single project request
export const getProjectRequest = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { id } = req.params;

    const request = await ProjectRequest.findById(id);

    if (!request) {
      res.status(404).json({ message: "Project request not found" });
      return;
    }

    res.status(200).json({
      message: "Project request fetched successfully",
      request,
    });
  } catch (error) {
    next(error);
  }
};

// Reply to a project request
export const replyToProjectRequest = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { id } = req.params;
    const { replyMessage, subject } = req.body;

    if (!replyMessage || !subject) {
      res
        .status(400)
        .json({ message: "Reply message and subject are required." });
      return;
    }

    const request = await ProjectRequest.findById(id);

    if (!request) {
      res.status(404).json({ message: "Project request not found" });
      return;
    }

    // Update the request with reply information
    request.isReplied = true;
    request.replyMessage = replyMessage.trim();
    request.repliedAt = new Date();
    request.repliedBy = req.user?.name || req.user?.email || "Admin";
    request.status = "replied";

    await request.save();

    // Prepare email content for the client
    const clientEmailContent = `
            <h2>Response to Your Project Inquiry</h2>
            <p>Dear ${request.name},</p>
            <p>Thank you for your project inquiry submitted on ${request.createdAt.toLocaleDateString()}.</p>
            
            <h3>Your Original Request:</h3>
            <p><strong>Project Type:</strong> ${request.projectType}</p>
            <p><strong>Main Goal:</strong> ${request.mainGoal}</p>
            <p><strong>Budget:</strong> ${request.budget}</p>
            <p><strong>Timeline:</strong> ${request.timeline}</p>
            
            <h3>Our Response:</h3>
            <div style="background-color: #f5f5f5; padding: 15px; border-left: 4px solid #007bff; margin: 10px 0;">
                ${replyMessage.replace(/\n/g, "<br>")}
            </div>
            
            <p>Best regards,<br>CreativaPoeta Team</p>
            <p><small>Reference ID: ${request._id}</small></p>
        `;

    // Send reply email to client
    await sendEmail(request.email, subject, clientEmailContent);

    res.status(200).json({
      message: "Reply sent successfully",
      request: {
        _id: request._id,
        status: request.status,
        isReplied: request.isReplied,
        repliedAt: request.repliedAt,
        replyMessage: request.replyMessage,
      },
    });
  } catch (error) {
    next(error);
  }
};

// Update project request status
export const updateProjectRequestStatus = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!status) {
      res.status(400).json({ message: "Status is required." });
      return;
    }

    const validStatuses = ["pending", "in-review", "replied", "completed"];
    if (!validStatuses.includes(status)) {
      res.status(400).json({ message: "Invalid status value." });
      return;
    }

    const request = await ProjectRequest.findByIdAndUpdate(
      id,
      { status, updatedAt: new Date() },
      { new: true }
    );

    if (!request) {
      res.status(404).json({ message: "Project request not found" });
      return;
    }

    res.status(200).json({
      message: "Project request status updated successfully",
      request,
    });
  } catch (error) {
    next(error);
  }
};

// Delete project request
export const deleteProjectRequest = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { id } = req.params;

    const request = await ProjectRequest.findByIdAndDelete(id);

    if (!request) {
      res.status(404).json({ message: "Project request not found" });
      return;
    }

    res.status(200).json({
      message: "Project request deleted successfully",
    });
  } catch (error) {
    next(error);
  }
};
