// Config to replace @nomadapex/config monorepo dependency

export const ENV = {
  // Environment
  NODE_ENV: process.env.NODE_ENV || "development",
  
  // ADI Configuration
  ADI_ANALYZE_PATH: process.env.ADI_ANALYZE_PATH || "",
  ADI_API_VERSION: process.env.ADI_API_VERSION || "",
  ADI_STRING_INDEX_TYPE: process.env.ADI_STRING_INDEX_TYPE || "",
  ADI_MODEL_ID: process.env.ADI_MODEL_ID || "",
  ADI_ANALYZE_URL: process.env.ADI_ANALYZE_URL || "",
  ADI_RESULT_URL: process.env.ADI_RESULT_URL || "",
  ADI_RESULT_PATH: process.env.ADI_RESULT_PATH || "",
  ADI_ANALYZE_OVERLOAD: process.env.ADI_ANALYZE_OVERLOAD === "true",
  
  // Polling Configuration
  RESULTS_POLL_INTERVAL: parseInt(process.env.POLL_INTERVAL_MS || "1000", 10),
  RESULTS_POLL_MAX_SECONDS: parseInt(process.env.POLL_MAX_SECONDS || "300", 10),
  
  // Storage Configuration
  STORAGE_ACCOUNT: process.env.STORAGE_ACCOUNT || "",
  STORAGE_ACCOUNT_KEY: process.env.STORAGE_ACCOUNT_KEY || "",
  STORAGE_CONTAINER: process.env.STORAGE_CONTAINER || "",
  SAS_EXPIRY_HOURS: parseInt(process.env.SAS_EXPIRY_HOURS || "24", 10),
  
  // APIM Configuration
  APIM_SUBSCRIPTION_KEY: process.env.APIM_SUBSCRIPTION_KEY || "",
};

export const MODELS = {
  mini: process.env.CHAT_MODEL_MINI || "gpt-3.5-turbo",
  strong: process.env.CHAT_MODEL_STRONG || "gpt-4",
  default: process.env.MODEL || "gpt-4",
};

export function apimUrl(path: string): string {
  const host = process.env.APIM_HOST || "";
  return `https://${host}${path}`;
}

export function pathWithParams(base: string, params: Record<string, string>): string {
  const query = new URLSearchParams(params).toString();
  return query ? `${base}?${query}` : base;
}
