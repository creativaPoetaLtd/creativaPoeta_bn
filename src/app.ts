import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import routes from "./routes";

dotenv.config();

const app = express();

// ✅ Use CORS once, with correct config
app.use(
  cors({
    origin: ["http://localhost:5174", "https://creativapoeta.netlify.app"],
    methods: ["GET", "POST", "PUT", "DELETE"],
    credentials: true,
  })
);

app.use(express.json());

// ✅ Default route for Vercel
app.get("/", (req, res) => {
  res.send("Creativa Poeta Backend is running ✅");
});

// ✅ API routes
app.use("/api", routes);

export default app;
