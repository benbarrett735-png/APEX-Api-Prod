// Minimal config to replace @nomadapex/config monorepo dependency

export const ENV = process.env.NODE_ENV || "development";

export const MODELS = {
  mini: process.env.CHAT_MODEL_MINI || "gpt-3.5-turbo",
  strong: process.env.CHAT_MODEL_STRONG || "gpt-4",
};

export function apimUrl(path: string): string {
  const host = process.env.APIM_HOST || "";
  return `https://${host}${path}`;
}

export function pathWithParams(base: string, params: Record<string, string>): string {
  const query = new URLSearchParams(params).toString();
  return query ? `${base}?${query}` : base;
}

