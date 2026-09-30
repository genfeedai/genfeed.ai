const fallbackNonces = new Map<string, string>();

export function templateAttemptScope(
  userId: string,
  organizationId: string,
  routeScope: string,
  templateId: string,
): string {
  return JSON.stringify([
    'workflow-template-attempt:v1',
    userId,
    organizationId,
    routeScope,
    templateId,
  ]);
}

/** Reserve before any await; failed and successful attempts both retain their nonce. */
export function reserveTemplateAttempt(
  scope: string,
  isNewAttempt = false,
): string {
  const storageKey = `workflow-template-attempt:${scope}`;
  let nonce: string | null = null;
  try {
    if (!isNewAttempt) nonce = sessionStorage.getItem(storageKey);
    nonce ??= crypto.randomUUID();
    sessionStorage.setItem(storageKey, nonce);
    return nonce;
  } catch {
    if (!isNewAttempt) nonce = fallbackNonces.get(scope) ?? nonce;
    nonce ??= crypto.randomUUID();
    fallbackNonces.set(scope, nonce);
    return nonce;
  }
}

export async function templateAttemptKey(
  scope: string,
  nonce: string,
): Promise<string> {
  const bytes = new TextEncoder().encode(
    JSON.stringify(['workflow-template-key:v1', scope, nonce]),
  );
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('');
}
