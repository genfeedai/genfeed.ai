import type { AxiosError } from 'axios';

const MUREKA_ERROR_MAX_LENGTH = 300;

type MurekaErrorField = string | { message?: unknown } | undefined;

interface MurekaErrorPayload {
  error?: MurekaErrorField;
  failed_reason?: string;
  message?: string;
  msg?: string;
  trace_id?: string;
}

function readText(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0
    ? value.trim()
    : undefined;
}

function readPayloadMessage(payload: unknown): string | undefined {
  if (typeof payload === 'string') {
    return readText(payload);
  }
  if (typeof payload !== 'object' || payload === null) {
    return undefined;
  }
  const body = payload as MurekaErrorPayload;
  const nested =
    typeof body.error === 'object' && body.error !== null
      ? readText(body.error.message)
      : readText(body.error);

  return (
    nested ??
    readText(body.message) ??
    readText(body.msg) ??
    readText(body.failed_reason)
  );
}

/**
 * Turns a failed Mureka HTTP call into a readable provider reason. The default
 * axios message ("Request failed with status code 400") hides the reason
 * Mureka returns in the response body, which is what the user needs to see.
 * Returns undefined for errors that carry no HTTP response.
 */
export function describeMurekaHttpError(error: unknown): string | undefined {
  const response = (error as AxiosError<MurekaErrorPayload> | null | undefined)
    ?.response;
  if (!response) {
    return undefined;
  }

  const reason = readPayloadMessage(response.data);
  const traceId =
    typeof response.data === 'object' && response.data !== null
      ? readText((response.data as MurekaErrorPayload).trace_id)
      : undefined;
  const status = Number.isFinite(response.status)
    ? `HTTP ${response.status}`
    : 'an error';
  const detail = reason
    ? `${status}: ${reason.slice(0, MUREKA_ERROR_MAX_LENGTH)}`
    : status;

  return traceId
    ? `Mureka rejected the request (${detail}, trace ${traceId})`
    : `Mureka rejected the request (${detail})`;
}
