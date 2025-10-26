import { Request, Response, NextFunction } from "express";
import { createRemoteJWKSet, jwtVerify, JWTPayload } from "jose";

const OIDC_AUTHORITY = process.env.OIDC_AUTHORITY!;
const OIDC_CLIENT_ID = process.env.OIDC_CLIENT_ID!;
const OIDC_AUDIENCE = process.env.OIDC_AUDIENCE || OIDC_CLIENT_ID;

console.log('[requireAuth] OIDC_AUTHORITY:', OIDC_AUTHORITY);
console.log('[requireAuth] OIDC_AUDIENCE:', OIDC_AUDIENCE);

// e.g. https://cognito-idp.eu-west-1.amazonaws.com/eu-west-1_XXXXXX/.well-known/jwks.json
// NOTE: Must append, not replace path
const jwksUrl = `${OIDC_AUTHORITY}/.well-known/jwks.json`;
console.log('[requireAuth] JWKS URL:', jwksUrl);
const JWKS = createRemoteJWKSet(new URL(jwksUrl));

declare global {
  namespace Express {
    interface Request { auth?: JWTPayload }
  }
}

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  try {
    console.log('[requireAuth] Checking authorization...');
    const auth = req.headers.authorization || "";
    console.log('[requireAuth] Has Authorization header?', !!auth);
    
    if (!auth.startsWith("Bearer ")) {
      console.error('[requireAuth] FAILED: No Bearer token');
      return res.status(401).json({ error: "unauthorized" });
    }
    const token = auth.slice("Bearer ".length);
    console.log('[requireAuth] Token length:', token.length);

    console.log('[requireAuth] Verifying JWT...');
    // Cognito access tokens don't have "aud" claim, they have "client_id"
    // So verify without audience, then check client_id manually
    const { payload } = await jwtVerify(token, JWKS, {
      issuer: OIDC_AUTHORITY,
    });
    console.log('[requireAuth] JWT verified successfully');
    console.log('[requireAuth] Payload keys:', Object.keys(payload));

    // Extra safety: ensure this is an ACCESS token (not ID token)
    if ((payload as any).token_use && (payload as any).token_use !== "access") {
      console.error('[requireAuth] FAILED: Wrong token type:', (payload as any).token_use);
      return res.status(401).json({ error: "unauthorized", detail: "wrong token type" });
    }

    // Cognito uses client_id instead of aud
    const clientId = (payload as any).client_id;
    console.log('[requireAuth] Checking client_id. Expected:', OIDC_CLIENT_ID, 'Got:', clientId);
    if (clientId !== OIDC_CLIENT_ID) {
      console.error('[requireAuth] FAILED: Client ID mismatch');
      return res.status(401).json({ error: "unauthorized", detail: "client_id mismatch" });
    }

    console.log('[requireAuth] SUCCESS: User authorized');
    req.auth = payload;
    next();
  } catch (err: any) {
    console.error('[requireAuth] FAILED: Exception:', err.message);
    return res.status(401).json({ error: "unauthorized" });
  }
}

