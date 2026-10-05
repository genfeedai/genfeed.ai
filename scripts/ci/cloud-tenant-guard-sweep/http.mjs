import { setTimeout as delay } from 'node:timers/promises';

import { createConcurrencyLimiter, tenantHit } from './core.mjs';

export function createRequester({
  baseUrl,
  records,
  fetchImpl = fetch,
  wait = delay,
  timeoutMs,
  sweepSignal,
  phase = 'controls',
  now = () => performance.now(),
  limit = createConcurrencyLimiter(10),
}) {
  const request = async (actor, method, path, options) => {
    const url = new URL(path, baseUrl);
    if (url.origin !== new URL(baseUrl).origin)
      throw new Error(`Off-origin sweep request: ${url.origin}`);
    let outcome;
    const requestPhase = options.phase ?? phase;
    const isSetup = ['fixture', 'warmup'].includes(requestPhase);
    for (let attempt = 0; attempt < 3; attempt++) {
      sweepSignal?.throwIfAborted();
      let record;
      const started = now();
      const timeoutSignal = AbortSignal.timeout(
        timeoutMs ?? (isSetup ? 60_000 : method === 'GET' ? 30_000 : 45_000),
      );
      const signal = sweepSignal
        ? AbortSignal.any([timeoutSignal, sweepSignal])
        : timeoutSignal;
      try {
        const response = await fetchImpl(url, {
          method,
          redirect: 'manual',
          signal,
          headers: {
            'content-type': 'application/json',
            ...(actor?.token ? { Authorization: `Bearer ${actor.token}` } : {}),
            ...options.headers,
          },
          ...(options.body === undefined
            ? {}
            : { body: JSON.stringify(options.body) }),
        });
        // Keep the timeout alive until the body is consumed (including SSE).
        const body = await response.text();
        const message = tenantHit(body);
        record = {
          actor: actor?.label ?? 'anonymous',
          method,
          path,
          status: response.status,
          phase: requestPhase,
          route: options.route ?? path,
          hasTenantHit: Boolean(message),
          message,
        };
        let json;
        try {
          json = JSON.parse(body);
        } catch {
          json = null;
        }
        outcome = { record, body, json, headers: response.headers };
      } catch (error) {
        record = {
          actor: actor?.label ?? 'anonymous',
          method,
          path,
          status: 0,
          phase: requestPhase,
          route: options.route ?? path,
          hasTenantHit: Boolean(tenantHit(String(error))),
          message: tenantHit(String(error)),
          isTimeout: signal.aborted || error.name === 'TimeoutError',
          error: String(error),
        };
        outcome = { record, body: '', json: null };
      }
      record.durationMs = Math.round(now() - started);
      record.sweepPhase = options.sweepPhase ?? requestPhase;
      // Setup tolerates transient cold-start failures; sweep requests retain
      // their bounded deadlines and retry only throttling. Preserve every attempt.
      const isRetryable = isSetup
        ? [0, 502, 503, 504].includes(record.status)
        : record.status === 429;
      if (
        isRetryable &&
        !record.hasTenantHit &&
        attempt < 2 &&
        !sweepSignal?.aborted
      ) {
        records.push({ ...record, isRetry: true });
        const seconds = Number(
          outcome.headers?.get('retry-after') ??
            outcome.headers?.get('x-retry-after') ??
            10,
        );
        await wait(
          // A long Retry-After must not turn a bounded sweep into an hour.
          isSetup
            ? 1_000 * 2 ** attempt
            : Math.min(1, Math.max(0, Number.isFinite(seconds) ? seconds : 1)) *
                1_000,
          { signal: sweepSignal },
        );
        continue;
      }
      records.push(record);
      return outcome;
    }
  };
  return (actor, method, path, options = {}) =>
    limit(() => request(actor, method, path, options));
}

export function requireSuccess(result, label) {
  if (
    result.record.status < 200 ||
    result.record.status >= 300 ||
    result.record.hasTenantHit ||
    result.json?.success === false ||
    result.json?.errors
  ) {
    const { method, path, status, durationMs, isTimeout } = result.record;
    const error = new Error(
      `${label}: HTTP ${status} (${method} ${path}, ${durationMs} ms${isTimeout ? ', request timed out' : ''}) ${result.record.message ?? result.record.error ?? result.body.slice(0, 500)}`,
    );
    error.record = result.record;
    throw error;
  }
  return result.json;
}

export function sessionCookie(headers) {
  const values = headers.getSetCookie?.() ?? [headers.get('set-cookie') ?? ''];
  for (const value of values) {
    const match = value.match(
      /(?:^|[,;]\s*)(?:__Secure-)?better-auth\.session_token=([^;]+)/,
    );
    if (match) return `better-auth.session_token=${match[1]}`;
  }
  throw new Error('Better Auth returned no session cookie');
}

export function rows(response) {
  if (Array.isArray(response)) return response;
  const data = response?.data ?? response?.items;
  if (Array.isArray(data)) return data;
  if (data?.items) return data.items;
  return data ? [data] : [];
}

export function entity(response, label) {
  const row = rows(response)[0];
  if (!row?.id) throw new Error(`${label}: response has no entity id`);
  return { ...row.attributes, ...row };
}
