const once = { printed: false };

export function warnMissingEnvs() {
  if (once.printed) return;
  once.printed = true;
  const checks: { key: string; ok: boolean; note?: string }[] = [];
  const push = (key: string, ok: boolean, note?: string) => checks.push({ key, ok, note });

  push('DATABASE_URL', !!process.env.DATABASE_URL);
  
  // Required APIM envs
  push('APIM_HOST', !!process.env.APIM_HOST);
  push('APIM_SUBSCRIPTION_KEY', !!process.env.APIM_SUBSCRIPTION_KEY);
  
  // Chat configuration
  push('CHAT_MODEL_STRONG', !!process.env.CHAT_MODEL_STRONG);
  push('CHAT_MODEL_MINI', !!process.env.CHAT_MODEL_MINI);
  const hasChatStrong = !!(process.env.CHAT_URL_STRONG || process.env.CHAT_PATH_STRONG);
  const hasChatMini = !!(process.env.CHAT_URL_MINI || process.env.CHAT_PATH_MINI);
  push('CHAT_STRONG_ENDPOINT', hasChatStrong);
  push('CHAT_MINI_ENDPOINT', hasChatMini);
  
  // ADI configuration
  push('ADI_MODEL_ID', !!process.env.ADI_MODEL_ID);
  push('ADI_API_VERSION', !!process.env.ADI_API_VERSION);
  push('ADI_ANALYZE_OVERLOAD', !!process.env.ADI_ANALYZE_OVERLOAD);
  const hasAdiAnalyze = !!(process.env.ADI_ANALYZE_URL || process.env.ADI_ANALYZE_PATH);
  const hasAdiResult = !!(process.env.ADI_RESULT_URL || process.env.ADI_RESULT_PATH);
  push('ADI_ANALYZE_ENDPOINT', hasAdiAnalyze);
  push('ADI_RESULT_ENDPOINT', hasAdiResult);
  
  // HTTP settings
  push('HTTP_TIMEOUT_MS', !!process.env.HTTP_TIMEOUT_MS);
  push('POLL_INTERVAL_MS', !!process.env.POLL_INTERVAL_MS);
  push('POLL_MAX_SECONDS', !!process.env.POLL_MAX_SECONDS);

  const missing = checks.filter((c) => !c.ok);
  if (missing.length) {
    // eslint-disable-next-line no-console
    console.warn('\n[ENV CHECK] Missing or unset variables:');
    for (const m of missing) {
      // eslint-disable-next-line no-console
      console.warn(` - ${m.key}${m.note ? ` (${m.note})` : ''}`);
    }
  }
}
