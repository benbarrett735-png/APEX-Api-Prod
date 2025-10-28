import "dotenv/config";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import chatNormalRouter from "./routes/chatNormal.js";
import adiRouter from "./routes/adi.js";
import agenticFlowRouter from "./routes/agentic-flow.js";
import outputsRouter from "./routes/outputs.js";
import researchRouter from "./routes/research.js";
import researchPollingRouter from "./routes/research-polling.js";
import reportsRouter from "./routes/reports.js";
import chartsRouter from "./routes/charts.js";
import templatesRouter from "./routes/templates.js";

const app = express();

const CORS_ORIGIN = process.env.CORS_ORIGIN || "http://localhost:3000";
app.use(cors({
  origin: CORS_ORIGIN,
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "x-correlation-id", "x-org-id", "x-user-id"]
}));

app.use(helmet());
app.use(express.json({ limit: "10mb" }));

// health (no auth)
app.get("/health", (_req, res) => res.json({ ok: true }));

// ✅ chat routes
app.use("/chat/normal", chatNormalRouter);

// ✅ ADI routes
app.use("/adi", adiRouter);

// ✅ Agentic flow routes
app.use("/agentic-flow", agenticFlowRouter);

// ✅ Outputs routes (save generated content to files)
app.use("/outputs", outputsRouter);

// ✅ Research routes (tool-based research with o1-style thinking)
app.use("/research", researchRouter);

// ✅ Research Polling routes (start → poll → append pattern, no SSE)
app.use("/research-polling", researchPollingRouter);

// ✅ Reports routes (tool-based report generation with charts)
app.use("/reports", reportsRouter);

// ✅ Charts routes (serves generated chart images)
app.use("/charts", chartsRouter);

// ✅ Templates routes (template generation with tool-based thinking)
app.use("/templates", templatesRouter);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`API on ${PORT}`));
