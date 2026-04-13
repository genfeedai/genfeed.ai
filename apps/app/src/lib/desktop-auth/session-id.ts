function decodeJwtPayload(token: string): Record<string, unknown> | null {
  const payload = token.split('.')[1];

  if (!payload) {
    return null;
  }

  try {
    const normalized = payload.replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized.padEnd(
      normalized.length + ((4 - (normalized.length % 4)) % 4),
      '=',
    );
    return JSON.parse(atob(padded)) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export function getDesktopSessionId(token: string | null): string | null {
  if (!token) {
    return null;
  }

  const payload = decodeJwtPayload(token);
  const sid = payload?.sid;

  return typeof sid === 'string' && sid.length > 0 ? sid : token;
}
