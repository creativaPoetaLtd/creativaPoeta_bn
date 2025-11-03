import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import routes from "./routes";

dotenv.config();

const app = express();

// Allow all CORS requests - no restrictions
app.use(
  cors({
    origin: "*", // Allow all origins
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS", "HEAD"],
    allowedHeaders: "*", // Allow all headers
    credentials: false, // Set to false when using origin: "*"
  })
);

app.use(express.json());

app.get("/", (req, res) => {
  res.send("Creativa Poeta Backend is running ✅");
});

app.use("/api", routes);

export default app;
