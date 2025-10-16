/* REWIRE: adi-client-stub (Blob SAS only later) */
export type AnalyzeRequest = {
  blobUrl: string;   // Azure Blob SAS URL (to be provided post-rewire)
  modelId?: string;  // e.g., "prebuilt-layout" later
};
export type AnalyzeResult =
  | { status: "not_configured" }
  | { status: "succeeded"; resultUrl: string }
  | { status: "failed"; reason: string };

export async function analyzeDocument(_req: AnalyzeRequest): Promise<AnalyzeResult> {
  return { status: "not_configured" };
}
