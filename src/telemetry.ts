import appInsights from 'applicationinsights';

export function initTelemetry(): void {
  const key = process.env.APPLICATIONINSIGHTS_CONNECTION_STRING || process.env.APPINSIGHTS_INSTRUMENTATIONKEY;
  if (!key) return;
  if ((appInsights as any).defaultClient) return;
  appInsights
    .setup(key)
    .setAutoCollectDependencies(true)
    .setAutoCollectRequests(true)
    .setAutoCollectExceptions(true)
    .setAutoCollectPerformance(true, false)
    .setSendLiveMetrics(false)
    .start();
}


