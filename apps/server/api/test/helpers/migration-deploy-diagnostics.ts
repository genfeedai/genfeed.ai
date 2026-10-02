const MAX_STREAM_BYTES = 8 * 1024 * 1024;
const TAIL_BYTES = 8192;

function ownValue(error: unknown, key: string): unknown {
  if (error === null || typeof error !== 'object') return undefined;
  try {
    return Object.getOwnPropertyDescriptor(error, key)?.value;
  } catch {
    return undefined;
  }
}

function diagnosticStream(value: unknown, databaseUrl: string) {
  const bytes =
    typeof value === 'string'
      ? Buffer.from(value, 'utf8')
      : Buffer.isBuffer(value)
        ? value
        : undefined;
  if (!bytes) return { text: '', truncated: false, omitted: false };
  if (bytes.length > MAX_STREAM_BYTES)
    return { text: '', truncated: true, omitted: true };
  let text = bytes.toString('utf8');
  const url = new URL(databaseUrl);
  let decodedPassword = url.password;
  try {
    decodedPassword = decodeURIComponent(url.password);
  } catch {
    // Retain the encoded value when the URL contains malformed percent escapes.
  }
  const secrets = new Set([
    databaseUrl,
    url.toString(),
    url.password,
    decodedPassword,
  ]);
  for (const secret of secrets) {
    if (secret.length > 0) text = text.split(secret).join('[redacted]');
  }
  text = text.replace(
    /\b([a-z][a-z0-9+.-]*:\/\/)[^\s/?#]*@/gi,
    '$1[redacted]@',
  );
  const sanitized = Buffer.from(text, 'utf8');
  return {
    text: sanitized
      .subarray(Math.max(0, sanitized.length - TAIL_BYTES))
      .toString('utf8'),
    truncated: sanitized.length > TAIL_BYTES,
    omitted: false,
  };
}

export function formatMigrationDeployDiagnostic(
  error: unknown,
  databaseUrl: string,
): string {
  const code = ownValue(error, 'code');
  const signal = ownValue(error, 'signal');
  const killed = ownValue(error, 'killed');
  return JSON.stringify({
    version: 1,
    code: 'MIGRATION_DEPLOY_FAILED',
    exitCode:
      typeof code === 'number' && Number.isSafeInteger(code) ? code : null,
    processCode:
      typeof code === 'string' && /^[A-Z][A-Z0-9_]{0,63}$/.test(code)
        ? code
        : null,
    signal:
      typeof signal === 'string' && /^SIG[A-Z0-9]{1,20}$/.test(signal)
        ? signal
        : null,
    killed: typeof killed === 'boolean' ? killed : null,
    stdout: diagnosticStream(ownValue(error, 'stdout'), databaseUrl),
    stderr: diagnosticStream(ownValue(error, 'stderr'), databaseUrl),
  });
}
