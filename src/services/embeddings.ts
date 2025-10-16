export async function embedTexts(texts: string[]): Promise<number[][]> {
  if (!texts.length) return [];
  const maxBatch = 16;
  const batches: string[][] = [];
  for (let i = 0; i < texts.length; i += maxBatch) batches.push(texts.slice(i, i + maxBatch));
  // APIM-only baseline: embeddings disabled unless wired later
  throw new Error('rag_disabled');
  const vectors: number[][] = [];
  return vectors;
}

export function embeddingsEnabled(): boolean {
  return false;
}

export function vectorToLiteral(vec: number[]): string {
  return '[' + vec.join(',') + ']';
}


