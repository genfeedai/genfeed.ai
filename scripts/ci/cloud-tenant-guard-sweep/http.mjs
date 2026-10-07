import { setTimeout as delay } from 'node:timers/promises';

import {
  classifyTransport,
  createConcurrencyLimiter,
  observeAbortSources,
  tenantHit,
} from './core.mjs';

export function createRequester({
  baseUrl,
  records,
  fetchImpl = fetch,
  wait = delay,
  timeoutMs,
  deadline,
  sweepSignal,
  abortSources = [],
  onProgress = () => {},
  phase = 'controls',
  now = () => performance.now(),
  limit = createConcurrencyLimiter(10),
  nextSequence,
  epochNow = Date.now,
}) {
  const request = async (actor, method, path, options, enqueued) => {
    const granted = now();

    const url = new URL(path, baseUrl);
    if (url.origin !== new URL(baseUrl).origin)
      throw new Error(`Off-origin sweep request: ${url.origin}`);
    const organizationQueryPresent = url.searchParams.has('organizationId');
    let outcome;
    const requestPhase = options.phase ?? phase;
    const isSetup = ['fixture', 'warmup'].includes(requestPhase);
    const parentSignals = [
      sweepSignal,
      options.signal,
      deadline?.signal,
    ].filter(Boolean);
    const requestSignal = parentSignals.length
      ? AbortSignal.any(parentSignals)
      : undefined;
    for (let attempt = 0; attempt < 3; attempt++) {
      requestSignal?.throwIfAborted();
      if (attempt === 0) onProgress('started', actor, options);
      let record;
      const started = now();
      const timeoutSignal = AbortSignal.timeout(
        Math.min(
          deadline?.remaining() ?? Infinity,
          timeoutMs ?? (isSetup ? 60_000 : method === 'GET' ? 30_000 : 45_000),
        ),
      );
      const signal = requestSignal
        ? AbortSignal.any([timeoutSignal, requestSignal])
        : timeoutSignal;
      const observer = observeAbortSources([
        { signal: timeoutSignal, source: 'request timeout' },
        ...abortSources,
        ...(options.abortSources ?? []),
        ...(deadline?.abortSources ?? []),
        ...(!options.abortSources?.length
          ? [{ signal: options.signal, source: 'unknown' }]
          : []),
        ...(!abortSources.length
          ? [{ signal: sweepSignal, source: 'unknown' }]
          : []),
      ]);
      const sequence = nextSequence?.();
      if (
        sequence !== undefined &&
        (!Number.isSafeInteger(sequence) || sequence < 1)
      )
        throw new Error('Invalid diagnostic sequence');
      const sentAtEpochMs = sequence === undefined ? undefined : epochNow();
      let headerAtEpochMs = null;
      let headerAt;
      let bodyAt;
      try {
        const response = await fetchImpl(url, {
          method,
          redirect: 'manual',
          signal,
          headers: {
            'content-type': 'application/json',
            ...(actor?.token ? { Authorization: `Bearer ${actor.token}` } : {}),
            ...options.headers,
            ...(sequence === undefined
              ? {}
              : { 'x-genfeed-ci-attempt': String(sequence) }),
          },
          ...(options.body === undefined
            ? {}
            : { body: JSON.stringify(options.body) }),
        });
        headerAt = now();
        if (sequence !== undefined) headerAtEpochMs = epochNow();
        // Keep the timeout alive until the body is consumed (including SSE).
        const body = await response.text();
        bodyAt = now();
        signal.throwIfAborted();
        const message = tenantHit(body);
        record = {
          actor: actor?.label ?? 'anonymous',
          method,
          path,
          status: response.status,
          phase: requestPhase,
          organizationQueryPresent,
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
          organizationQueryPresent,
          route: options.route ?? path,
          hasTenantHit: Boolean(tenantHit(String(error))),
          message: tenantHit(String(error)),
          isTimeout: signal.aborted || error.name === 'TimeoutError',
          error: String(error),
          ...classifyTransport(error),
          abortSource:
            observer.source() ?? (signal.aborted ? 'unknown' : 'transport'),
        };
        outcome = { record, body: '', json: null };
      }
      observer.dispose();
      const ended = now();
      if (sequence !== undefined)
        Object.assign(record, {
          sequence,
          sentAtEpochMs,
          headerAtEpochMs,
          endedAtEpochMs: epochNow(),
        });
      record.durationMs = Math.round(ended - started);
      record.queueWaitMs = Math.round(granted - enqueued);
      record.headerMs = Math.round((headerAt ?? ended) - started);
      record.bodyMs =
        headerAt === undefined ? 0 : Math.round((bodyAt ?? ended) - headerAt);
      record.totalMs = Math.round(ended - enqueued);
      record.attempt = attempt + 1;
      record.sweepPhase = options.sweepPhase ?? requestPhase;
      // Setup tolerates transient cold-start failures; sweep requests retain
      // their bounded deadlines and retry only throttling. Preserve every attempt.
      const isSignin =
        options.allowSigninRetry !== false &&
        requestPhase === 'fixture' &&
        method === 'POST' &&
        url.pathname === '/v1/auth/sign-in/email';
      const isRetryable = isSignin
        ? [0, 500, 502, 503, 504].includes(record.status)
        : !isSetup && method === 'GET' && record.status === 429;
      if (
        isRetryable &&
        !record.hasTenantHit &&
        attempt < 2 &&
        !requestSignal?.aborted
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
          undefined,
          { signal: requestSignal },
        );
        continue;
      }
      records.push(record);
      if (record.status > 0) onProgress('completed', actor, options);
      return outcome;
    }
  };
  return (actor, method, path, options = {}) => {
    options = { ...options, phase: options.phase ?? phase };
    const enqueued = now();
    onProgress('enqueued', actor, options);
    return limit(() => request(actor, method, path, options, enqueued));
  };
}

export function requireSuccess(result, label) {
  if (
    result.record.status < 200 ||
    result.record.status >= 300 ||
    result.record.hasTenantHit ||
    result.json?.success === false ||
    result.json?.errors
  ) {
    const { status, durationMs } = result.record;
    const error = new Error(`${label}: HTTP ${status} (${durationMs ?? 0} ms)`);
    error.record = result.record;
    throw error;
  }
  return result.json;
}

export function hasSessionCookie(headers) {
  try {
    sessionCookie(headers);
    return true;
  } catch {
    return false;
  }
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
