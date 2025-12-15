import { SignJWT, jwtVerify } from 'jose';
import { createHash } from 'crypto';

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || 'development-secret-change-in-production'
);

const JWT_ISSUER = 'agentokratia';
const JWT_AUDIENCE = 'agentokratia-api';
const JWT_EXPIRATION = '24h';

export interface JWTPayload {
  sub: string;      // User ID
  address: string;  // Wallet address
  iat: number;      // Issued at
  exp: number;      // Expiration
}

export async function createToken(userId: string, walletAddress: string): Promise<string> {
  const token = await new SignJWT({
    sub: userId,
    address: walletAddress.toLowerCase(),
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setIssuer(JWT_ISSUER)
    .setAudience(JWT_AUDIENCE)
    .setExpirationTime(JWT_EXPIRATION)
    .sign(JWT_SECRET);

  return token;
}

export async function verifyToken(token: string): Promise<JWTPayload | null> {
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET, {
      issuer: JWT_ISSUER,
      audience: JWT_AUDIENCE,
    });

    return {
      sub: payload.sub as string,
      address: payload.address as string,
      iat: payload.iat as number,
      exp: payload.exp as number,
    };
  } catch {
    return null;
  }
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function getTokenExpiration(): Date {
  const now = new Date();
  now.setHours(now.getHours() + 24);
  return now;
}
