export function logStart(kind: string, url: string, model?: string, cid?: string) {
  const t0 = Date.now();
  // eslint-disable-next-line no-console
  console.log(`[APIM->${kind}] start url="${url}" model="${model||''}" cid="${cid||''}"`);
  return () => {
    const dt = Date.now() - t0;
    // eslint-disable-next-line no-console
    console.log(`[APIM->${kind}] done  url="${url}" ms=${dt} cid="${cid||''}"`);
  };
}
