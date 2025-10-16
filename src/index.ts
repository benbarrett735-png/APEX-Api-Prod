import express from "express";
import cors from "cors";
import helmet from "helmet";
import chatNormalRouter from "./routes/chatNormal.js";

const app = express();

const CORS_ORIGIN = process.env.CORS_ORIGIN || "http://localhost:3000";
app.use(cors({
  origin: CORS_ORIGIN,
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "x-correlation-id"]
}));

app.use(helmet());
app.use(express.json({ limit: "1mb" }));

// health (no auth)
app.get("/health", (_req, res) => res.json({ ok: true }));

// ✅ chat routes
app.use("/chat/normal", chatNormalRouter);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`API on ${PORT}`));
