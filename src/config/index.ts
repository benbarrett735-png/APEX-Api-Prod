// Config to replace @nomadapex/config monorepo dependency

export const ENV = {
  // Environment
  NODE_ENV: process.env.NODE_ENV || "development",
  
  // ADI Configuration - Use your actual env var names
  ADI_ANALYZE_PATH: process.env.ADI_ANALYZE_PATH || "",
  ADI_API_VERSION: process.env.ADI_API_VERSION || "",
  ADI_STRING_INDEX_TYPE: process.env.ADI_STRING_INDEX_TYPE || "",
  ADI_MODEL_ID: process.env.ADI_MODEL_ID_DEFAULT || process.env.ADI_MODEL_ID || "prebuilt-read",
  ADI_ANALYZE_URL: process.env.ADI_ANALYZE_URL || "",
  ADI_RESULT_URL: process.env.ADI_RESULT_URL || "",
  ADI_RESULT_PATH: process.env.ADI_RESULT_PATH || "",
  ADI_ANALYZE_OVERLOAD: process.env.ADI_ANALYZE_OVERLOAD === "true" || process.env.OVERWRITE_BLOB === "true",
  
  // Model IDs from your config
  ADI_MODEL_ID_DEFAULT: process.env.ADI_MODEL_ID_DEFAULT || "prebuilt-read",
  ADI_MODEL_ID_LAYOUT: process.env.ADI_MODEL_ID_LAYOUT || "prebuilt-layout",
  ADI_MODEL_ID_INVOICE: process.env.ADI_MODEL_ID_INVOICE || "prebuilt-invoice",
  ADI_MODEL_ID_RECEIPT: process.env.ADI_MODEL_ID_RECEIPT || "prebuilt-receipt",
  
  // Polling Configuration
  RESULTS_POLL_INTERVAL: parseInt(process.env.RESULTS_POLL_INTERVAL || "1000", 10),
  RESULTS_POLL_MAX_SECONDS: parseInt(process.env.POLL_MAX_SECONDS || "300", 10),
  
  // Storage Configuration - EXACTLY as you have them
  STORAGE_ACCOUNT: process.env.STORAGE_ACCOUNT || "",
  STORAGE_ACCOUNT_KEY: process.env.STORAGE_ACCOUNT_KEY || "",
  STORAGE_CONTAINER: process.env.STORAGE_CONTAINER || "",
  SAS_EXPIRY_HOURS: parseInt(process.env.SAS_EXPIRY_HOURS || "24", 10),
  
  // APIM Configuration
  APIM_SUBSCRIPTION_KEY: process.env.APIM_SUBSCRIPTION_KEY || "",
  APIM_HOST: process.env.APIM_HOST || "",
};

export const MODELS = {
  // Chat models
  mini: process.env.CHAT_MODEL_MINI || "gpt-3.5-turbo",
  strong: process.env.CHAT_MODEL_STRONG || "gpt-4",
  
  // ADI models - map to your actual model IDs
  default: process.env.ADI_MODEL_ID_DEFAULT || "prebuilt-read",
  layout: process.env.ADI_MODEL_ID_LAYOUT || "prebuilt-layout",
  invoice: process.env.ADI_MODEL_ID_INVOICE || "prebuilt-invoice",
  receipt: process.env.ADI_MODEL_ID_RECEIPT || "prebuilt-receipt",
};

export function apimUrl(path: string): string {
  const host = process.env.APIM_HOST || "";
  // Remove https:// if already in host
  const cleanHost = host.replace(/^https?:\/\//, '');
  return `https://${cleanHost}${path}`;
}

export function pathWithParams(base: string, params: Record<string, string>): string {
  // First, replace route params like :modelId, :resultId
  let path = base;
  for (const [key, value] of Object.entries(params)) {
    path = path.replace(`:${key}`, value);
  }
  return path;
}
