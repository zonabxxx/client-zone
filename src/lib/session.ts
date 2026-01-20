// Simple cookie-based session for client portal
// In production, use a proper session library with encryption

const SESSION_COOKIE_NAME = 'client_session';

export interface ClientSession {
  customerId: string;
  customerName: string;
  email: string;
  organizationId: string;
  expiresAt: number;
}

export function createSessionToken(session: Omit<ClientSession, 'expiresAt'>): string {
  const sessionData: ClientSession = {
    ...session,
    expiresAt: Date.now() + 24 * 60 * 60 * 1000 // 24 hours
  };
  
  // Base64 encode the session (in production, encrypt this!)
  return Buffer.from(JSON.stringify(sessionData)).toString('base64');
}

export function parseSessionToken(token: string): ClientSession | null {
  try {
    const decoded = Buffer.from(token, 'base64').toString('utf-8');
    const session = JSON.parse(decoded) as ClientSession;
    
    // Check expiration
    if (session.expiresAt < Date.now()) {
      return null;
    }
    
    return session;
  } catch {
    return null;
  }
}

export function getSessionFromCookie(cookieHeader: string | null): ClientSession | null {
  if (!cookieHeader) return null;
  
  const cookies = cookieHeader.split(';').reduce((acc, cookie) => {
    const [key, value] = cookie.trim().split('=');
    acc[key] = value;
    return acc;
  }, {} as Record<string, string>);
  
  const token = cookies[SESSION_COOKIE_NAME];
  if (!token) return null;
  
  return parseSessionToken(decodeURIComponent(token));
}

export function createSessionCookie(session: Omit<ClientSession, 'expiresAt'>): string {
  const token = createSessionToken(session);
  const maxAge = 24 * 60 * 60; // 24 hours in seconds
  
  return `${SESSION_COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}`;
}

export function clearSessionCookie(): string {
  return `${SESSION_COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0`;
}
