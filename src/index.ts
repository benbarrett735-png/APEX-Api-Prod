import express from "express";
import cors from "cors";
import helmet from "helmet";
import { requireAuth } from "./middleware/requireAuth.js";

const app = express();
app.use(helmet());
app.use(express.json());

// STRICT CORS: exact match to the portal (staging) URL.
// In App Runner we'll set CORS_ORIGIN to the Amplify staging domain.
const CORS_ORIGIN = process.env.CORS_ORIGIN || "http://localhost:3000";
app.use(cors({
  origin: CORS_ORIGIN,
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "x-correlation-id"],
}));

app.get("/health", (_req, res) => res.json({ ok: true }));

// Protected test route
app.get("/secure/ping", requireAuth, (req, res) => {
  res.json({
    ok: true,
    message: "Authentication successful",
    claims: {
      sub: req.auth?.sub,
      email: (req.auth as any)?.email,
      org_id: (req.auth as any)?.["custom:org_id"] || (req.auth as any)?.org_id || null,
    },
  });
});

app.post("/chat/normal", requireAuth, async (req, res) => {
  res.status(200).json({
    ok: true,
    message: "stub",
    echo: req.body ?? null,
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`API running on ${PORT}`));
