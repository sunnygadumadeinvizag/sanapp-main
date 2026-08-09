import { SignJWT, jwtVerify } from "jose";

const SECRET = new TextEncoder().encode(process.env.MAIN_SESSION_SECRET!);
const ISSUER = "iipe-main";

export type MainUser = {
  sub: string;
  username: string;
  name: string;
  email: string;
};

// Session policy (seconds/minutes; overridable via env in production).
export const SESSION_CONFIG = {
  idleTimeoutMs: Number(process.env.SESSION_IDLE_MINUTES ?? 30) * 60 * 1000,
  keepaliveMs: Number(process.env.SESSION_KEEPALIVE_MINUTES ?? 4) * 60 * 1000,
  statusIntervalMs: Number(process.env.SESSION_STATUS_SECONDS ?? 30) * 1000,
  maxSessionSeconds: Number(process.env.SESSION_MAX_HOURS ?? 8) * 3600,
};

export type SessionMeta = { user: MainUser; exp: number; iat: number };

export async function createMainSession(user: MainUser): Promise<string> {
  return new SignJWT({
    username: user.username,
    name: user.name,
    email: user.email,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(user.sub)
    .setIssuer(ISSUER)
    .setIssuedAt()
    .setExpirationTime("8h")
    .sign(SECRET);
}

export async function verifyMainSessionFull(token: string): Promise<SessionMeta | null> {
  try {
    const { payload } = await jwtVerify(token, SECRET, { issuer: ISSUER });
    if (!payload.sub || payload.exp === undefined || payload.iat === undefined) return null;
    return {
      user: {
        sub: payload.sub,
        username: String(payload.username ?? ""),
        name: String(payload.name ?? ""),
        email: String(payload.email ?? ""),
      },
      exp: payload.exp,
      iat: payload.iat,
    };
  } catch {
    return null;
  }
}

export async function verifyMainSession(token: string): Promise<MainUser | null> {
  const meta = await verifyMainSessionFull(token);
  return meta?.user ?? null;
}
