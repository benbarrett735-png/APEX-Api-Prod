import { Request, Response, NextFunction } from "express";
import { createRemoteJWKSet, jwtVerify, JWTPayload } from "jose";

const OIDC_AUTHORITY = process.env.OIDC_AUTHORITY!;
const OIDC_CLIENT_ID = process.env.OIDC_CLIENT_ID!;
const OIDC_AUDIENCE = process.env.OIDC_AUDIENCE || OIDC_CLIENT_ID;

// e.g. https://cognito-idp.eu-west-1.amazonaws.com/eu-west-1_XXXXXX/.well-known/jwks.json
const JWKS = createRemoteJWKSet(new URL("/.well-known/jwks.json", OIDC_AUTHORITY));

declare global {
  namespace Express {
    interface Request { auth?: JWTPayload }
  }
}

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  try {
    const auth = req.headers.authorization || "";
    if (!auth.startsWith("Bearer ")) {
      return res.status(401).json({ error: "unauthorized" });
    }
    const token = auth.slice("Bearer ".length);

    const { payload } = await jwtVerify(token, JWKS, {
      issuer: OIDC_AUTHORITY,
      audience: OIDC_AUDIENCE,
    });

    // Extra safety: ensure this is an ACCESS token (not ID token)
    if ((payload as any).token_use && (payload as any).token_use !== "access") {
      return res.status(401).json({ error: "unauthorized", detail: "wrong token type" });
    }

    // aud can be string or array; accept either if contains our audience
    const aud = payload.aud;
    const audienceOk = Array.isArray(aud) ? aud.includes(OIDC_AUDIENCE) : aud === OIDC_AUDIENCE;
    if (!audienceOk) {
      return res.status(401).json({ error: "unauthorized", detail: "audience mismatch" });
    }

    req.auth = payload;
    next();
  } catch (err) {
    return res.status(401).json({ error: "unauthorized" });
  }
}

