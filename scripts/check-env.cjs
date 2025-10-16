const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../../../.env") });

const keys = [
  "APIM_HOST",
  "APIM_SUBSCRIPTION_KEY",
  "APIM_SUBSCRIPTION_HEADER",
  "CHAT_URL_STRONG",
  "CHAT_URL_MINI",
  "ADI_ANALYZE_URL",
  "DATABASE_URL",
  "NEXTAUTH_URL"
];

function mask(v) {
  if (!v) return v;
  return v.length <= 6 ? "***" : v.slice(0,2) + "***" + v.slice(-2);
}

console.log("ENV CHECK:");
for (const k of keys) {
  const v = process.env[k];
  console.log(`${k} = ${v ? mask(v) : "MISSING"}`);
}
if (keys.some(k => !process.env[k])) process.exit(1);
