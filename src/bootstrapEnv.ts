import path from "path";
import fs from "fs";
import dotenv from "dotenv";
import dotenvExpand from "dotenv-expand";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Find the repo-root .env no matter if we're running from src or dist
function resolveRootEnv(): string {
  // __dirname is .../apps/api/src  (dev) or .../apps/api/dist (prod)
  const candidate = path.resolve(__dirname, "../../../.env"); // up to repo root
  if (fs.existsSync(candidate)) return candidate;

  // fallback to CWD
  const cwdCandidate = path.resolve(process.cwd(), ".env");
  if (fs.existsSync(cwdCandidate)) return cwdCandidate;

  // final fallback: repo root via process.cwd() + walk up
  const up = (dir: string, n: number) => path.resolve(dir, ...Array(n).fill(".."));
  for (let i = 1; i <= 5; i++) {
    const p = path.join(up(process.cwd(), i), ".env");
    if (fs.existsSync(p)) return p;
  }
  return ""; // not found
}

export function bootstrapEnv() {
  // If dotenv/config already loaded via NODE_OPTIONS, we still want to ensure .env from root is used
  const rootEnv = resolveRootEnv();
  if (rootEnv) {
    const result = dotenv.config({ path: rootEnv });
    dotenvExpand.expand(result);
  }

  // Minimal required keys (update only if your authoritative .env changes)
  const required = [
    "APIM_HOST",
    "APIM_SUBSCRIPTION_KEY",
    "APIM_SUBSCRIPTION_HEADER",
    "CHAT_URL_STRONG",
    "CHAT_URL_MINI",
    "CHAT_MODEL_STRONG",
    "CHAT_MODEL_MINI",
    "ADI_ANALYZE_URL",
    "ADI_RESULT_URL",
    "ADI_MODEL_ID",
    "ADI_API_VERSION",
    "HTTP_TIMEOUT_MS",
    "POLL_INTERVAL_MS",
    "POLL_MAX_SECONDS",
    "NEXTAUTH_URL",
    "NEXTAUTH_SECRET",
    "DATABASE_URL"
  ];

  const missing = required.filter(k => !process.env[k]);
  if (missing.length) {
    const msg = [
      "❌ Missing required env vars:",
      ...missing.map(k => ` - ${k}`),
      "",
      "Troubleshooting:",
      "1) Ensure the file is named `.env` (not `.EMV`) at the repo root.",
      "2) Ensure apps/api uses NODE_OPTIONS=-r dotenv/config with DOTENV_CONFIG_PATH=../../.env (scripts updated).",
      "3) Confirm no quotes around values in .env (KEY=value).",
      "4) Restart the dev server after changes.",
    ].join("\n");
    throw new Error(msg);
  }
}
