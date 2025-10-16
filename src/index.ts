import express from "express";
import cors from "cors";
import helmet from "helmet";
import { requireAuth } from "./middleware/requireAuth.js";
import chatNormalRouter from "./routes/chatNormal.js";
import chatAgentRouter from "./routes/chatAgent.js";
import adiRouter from "./routes/adi.js";
import agenticFlowRouter from "./routes/agentic-flow.js";

const app = express();

const CORS_ORIGIN = process.env.CORS_ORIGIN || "http://localhost:3000";
app.use(cors({
  origin: CORS_ORIGIN,
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "x-correlation-id"]
}));

app.use(helmet());
app.use(express.json({ limit: "10mb" })); // Increase for large file contexts

// health (no auth)
app.get("/health", (_req, res) => res.json({ ok: true }));

// ✅ chat routes (with auth)
app.use("/chat/normal", requireAuth, chatNormalRouter);
app.use("/chat/agent", requireAuth, chatAgentRouter);

// ✅ ADI routes (with auth)
app.use("/adi", requireAuth, adiRouter);

// ✅ Agentic flow routes (with auth)
app.use("/agentic-flow", requireAuth, agenticFlowRouter);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`API on ${PORT}`));
