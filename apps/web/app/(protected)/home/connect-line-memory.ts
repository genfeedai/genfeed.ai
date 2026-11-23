const STORAGE_KEY_PREFIX = 'genfeed:connect-line:v1';

export interface RememberedConnectLine {
  status: 'configured' | 'unconfigured';
  /** When the connection was last verified; the time only, never a key. */
  verifiedAt: string | null;
}

function storageKey(organizationId: string): string {
  return `${STORAGE_KEY_PREFIX}:${organizationId}`;
}

/**
 * What the Home connection line showed the last time its read settled, per
 * browser and organization. The line renders from it on the first paint, so a
 * viewer whose state did not change sees no row grow in once the read answers.
 * Only the status and a verification time are kept: the API key behind a
 * connection never reaches storage.
 */
export function readRememberedConnectLine(
  organizationId: string,
): RememberedConnectLine | null {
  if (!organizationId) {
    return null;
  }
  try {
    const raw = window.localStorage.getItem(storageKey(organizationId));
    if (!raw) {
      return null;
    }
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) {
      return null;
    }
    const { status, verifiedAt } = parsed as Record<string, unknown>;
    if (status !== 'configured' && status !== 'unconfigured') {
      return null;
    }
    return {
      status,
      verifiedAt: typeof verifiedAt === 'string' ? verifiedAt : null,
    };
  } catch {
    return null;
  }
}

export function rememberConnectLine(
  organizationId: string,
  line: RememberedConnectLine,
): void {
  if (!organizationId) {
    return;
  }
  try {
    window.localStorage.setItem(
      storageKey(organizationId),
      JSON.stringify(line),
    );
  } catch {
    // Storage unavailable: the line grows in on the next visit, as before.
  }
}
