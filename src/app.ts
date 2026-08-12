import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import routes from "./routes";
import errorHandler from "./middleware/errorHandler";
import { analyticsServerMiddleware } from "./middleware/analyticsServerMiddleware";

dotenv.config();

const app = express();

app.disable("x-powered-by");
app.set("trust proxy", 1);

// Allow all CORS requests - no restrictions
app.use(
  cors({
    origin: "*", // Allow all origins
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS", "HEAD"],
    allowedHeaders: "*", // Allow all headers
    credentials: false, // Set to false when using origin: "*"
  })
);

app.use(analyticsServerMiddleware);
app.use((_req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "no-referrer");
  next();
});
app.use(
  express.json({
    limit: "256kb",
    strict: true,
    verify: (req, _res, buffer) => {
      (req as express.Request & { rawBody?: Buffer }).rawBody = Buffer.from(buffer);
    },
  })
);

app.get("/", (req, res) => {
  res.setHeader("X-CP-Commit", process.env.VERCEL_GIT_COMMIT_SHA || "local");
  res.send("Creativa Poeta Backend is running ✅");
});

app.use("/api", routes);

app.use((_req, res) => {
  res.status(404).json({ message: "Route not found." });
});

app.use(errorHandler);

export default app;
