import type { Request, Response, NextFunction } from 'express';
import { createRemoteJWKSet, jwtVerify } from 'jose';

const authority = process.env.OIDC_AUTHORITY || '';
const audience = process.env.OIDC_CLIENT_ID || '';
let jwksUri: string | null = null;
let jwks: ReturnType<typeof createRemoteJWKSet> | null = null;

async function getJwks() {
  if (jwks) return jwks;
  const res = await fetch(`${authority}/.well-known/openid-configuration`);
  const json = await res.json();
  jwksUri = json.jwks_uri;
  jwks = createRemoteJWKSet(new URL(jwksUri!));
  return jwks;
}

export async function verifyOidc(req: Request, res: Response, next: NextFunction) {
  try {
    const auth = req.header('authorization');
    if (!auth?.startsWith('Bearer ')) return res.status(401).json({ error: { code: 'UNAUTHENTICATED', message: 'missing bearer' } });
    const token = auth.slice('Bearer '.length);
    const jwks = await getJwks();
    const { payload } = await jwtVerify(token, jwks, { issuer: authority, audience });
    (req as any).auth = { sub: payload.sub as string, email: (payload as any).email || (payload as any).preferred_username, name: (payload as any).name };
    next();
  } catch (e) {
    return res.status(401).json({ error: { code: 'UNAUTHENTICATED', message: 'invalid token' } });
  }
}


