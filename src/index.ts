// Detect if running on AWS Elastic Beanstalk
const isAWS = !!(process.env.AWS_ENVIRONMENT || process.env.AWS_REGION || process.env.AWS_EXECUTION_ENV ||
                 process.env.AWS_EB_REGION || process.env.EB_NAME || process.env.EB_ENV_NAME);

console.log('Environment check:', {
    AWS_ENVIRONMENT: !!process.env.AWS_ENVIRONMENT,
    AWS_REGION: !!process.env.AWS_REGION,
    AWS_EXECUTION_ENV: !!process.env.AWS_EXECUTION_ENV,
    AWS_EB_REGION: !!process.env.AWS_EB_REGION,
    EB_NAME: !!process.env.EB_NAME,
    EB_ENV_NAME: !!process.env.EB_ENV_NAME,
    isAWS: isAWS
});

// Fetch secrets from AWS Secrets Manager FIRST (if in AWS environment)
if (isAWS) {
    console.log('AWS environment detected - fetching secrets from Secrets Manager...');
    try {
        await import('./fetch-secrets.js');
        console.log('Secrets loaded from AWS Secrets Manager');
    } catch (error) {
        console.error('Error loading secrets from AWS Secrets Manager:', (error as any).message);
        console.error('Application will attempt to start with existing environment variables');
    }
} else {
    console.log('Local environment - loading from .env file if present');
    const { config } = await import('dotenv');
    const { resolve } = await import('path');
    const envPath = resolve(process.cwd(), '.env');
    const result = config({ path: envPath });
    if (result.error) {
        if ((result.error as any).code === 'ENOENT') {
            console.log('No .env file found - using existing environment variables');
        } else {
            console.error('Error loading .env:', result.error);
        }
    } else {
        console.log('Environment loaded from .env file');
    }
}

console.log('APIM_HOST present:', !!process.env.APIM_HOST);
console.log('APIM_SUBSCRIPTION_KEY present:', !!process.env.APIM_SUBSCRIPTION_KEY);
console.log('OIDC_AUTHORITY present:', !!process.env.OIDC_AUTHORITY);
console.log('OIDC_CLIENT_ID present:', !!process.env.OIDC_CLIENT_ID);

import express from "express";
import cors from "cors";

// Dynamic imports to ensure env is loaded first
const { default: chatNormal } = await import("./routes/chatNormal.js");
const { default: chatAgent } = await import("./routes/chatAgent.js");
const { default: adi } = await import("./routes/adi.js");
const { default: agenticFlow } = await import("./routes/agentic-flow.js");
const { default: researchFlow } = await import("./routes/research-flow.js");
const { default: charts } = await import("./routes/charts.js");
const { default: reports } = await import("./routes/reports.js");
const { verifyOidc } = await import("./middleware/verifyOidc.js");

const app = express();
app.use(cors({
  origin: ['http://localhost:3000', 'http://localhost:3001', 'https://app.nomadapex.com'],
  credentials: true
}));
app.use(express.json({ limit: "2mb" }));
app.get("/health", (_req, res) => res.json({ ok: true, configured: true }));

// Apply authentication middleware to all protected routes
// Chat routes - CLEARLY SEPARATED
app.use("/chat/normal", verifyOidc, chatNormal);  // Simple chatbot mode (protected)
app.use("/chat/agent", verifyOidc, chatAgent);    // Agent modes (protected)

// Other routes (all protected)
app.use("/adi", verifyOidc, adi);
app.use("/agentic-flow", verifyOidc, agenticFlow);
app.use("/research-flow", verifyOidc, researchFlow);
app.use("/charts", verifyOidc, charts);
app.use("/reports", verifyOidc, reports);

// keep everything else disabled (not in scope)
app.all(["/auth", "/auth/*", "/webhooks/stripe", "/files/*"], (_req, res) =>
  res.status(503).json({ error: "not_configured", detail: "Disabled (not in this rewire)." })
);

const PORT = process.env.PORT || 3001;
const server = app.listen(PORT, () => console.log(`API running on :${PORT}`));

// Disable Express default timeouts for streaming
server.timeout = 0; // No timeout for long-running requests
server.keepAliveTimeout = 0; // Keep connections alive indefinitely
server.headersTimeout = 0; // No timeout for headers