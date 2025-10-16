function splitIntoSentences(text: string): string[] {
  const parts = text.split(/(?<=[.!?])\s+(?=[A-Z0-9])/).map((s) => s.trim()).filter(Boolean);
  return parts.length ? parts : [text];
}

export function chunkText(text: string): { part: number; text: string }[] {
  const maxChars = 4200; // target window
  const sentences = splitIntoSentences(text);
  const chunks: { part: number; text: string }[] = [];
  let buf = '';
  for (const s of sentences) {
    if ((buf + ' ' + s).length > maxChars && buf) {
      chunks.push({ part: chunks.length + 1, text: buf.trim() });
      buf = s;
    } else {
      buf = buf ? buf + ' ' + s : s;
    }
  }
  if (buf.trim()) chunks.push({ part: chunks.length + 1, text: buf.trim() });
  return chunks;
}


