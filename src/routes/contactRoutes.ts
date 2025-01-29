import express from "express";
import { sendContactDetails } from "../controllers/contactController"; // Import the controller

const contactRouter = express.Router();

contactRouter.post("/send", sendContactDetails); 

export default contactRouter;
