import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import routes from "./routes"; 

dotenv.config();

const app = express();

app.use(express.json());
app.use(cors());

app.use(
    cors({
      origin: ["http://localhost:5000", "https://your-frontend-domain.com"],
      methods: ["GET", "POST", "PUT", "DELETE"],
      credentials: true, 
    })
)
app.use("/api", routes);

export default app;
