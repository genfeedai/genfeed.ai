import { createHmac, timingSafeEqual } from 'node:crypto';

const SIGNED_REQUEST_ALGORITHM = 'HMAC-SHA256';
const DELETION_RECEIPT_DOMAIN = 'threads-data-deletion-receipt:v1';
const DELETION_RECEIPT_VERSION = 'v1';
const BASE64URL_SEGMENT = /^[A-Za-z0-9_-]+$/;

export interface ThreadsSignedRequestPayload {
  algorithm: typeof SIGNED_REQUEST_ALGORITHM;
  issued_at?: number;
  user_id: string;
}

function isBase64UrlSegment(value: string): boolean {
  return value.length > 0 && BASE64URL_SEGMENT.test(value);
}

/**
 * Verify and decode Meta's `signed_request` without ever logging its contents.
 *
 * Meta signs the encoded payload segment, not decoded or re-serialized JSON.
 * Every malformed or ambiguous representation therefore fails closed before
 * the provider user id can reach a database lookup.
 */
export function verifyThreadsSignedRequest(
  signedRequest: string,
  secret: string,
): ThreadsSignedRequestPayload | null {
  const segments = signedRequest.split('.');
  if (
    segments.length !== 2 ||
    !isBase64UrlSegment(segments[0] ?? '') ||
    !isBase64UrlSegment(segments[1] ?? '')
  ) {
    return null;
  }

  const [signatureSegment, payloadSegment] = segments as [string, string];
  const suppliedSignature = Buffer.from(signatureSegment, 'base64url');
  const expectedSignature = createHmac('sha256', secret)
    .update(payloadSegment)
    .digest();

  if (
    suppliedSignature.length !== expectedSignature.length ||
    !timingSafeEqual(suppliedSignature, expectedSignature)
  ) {
    return null;
  }

  let payload: unknown;
  try {
    payload = JSON.parse(Buffer.from(payloadSegment, 'base64url').toString());
  } catch {
    return null;
  }

  if (
    payload === null ||
    typeof payload !== 'object' ||
    Array.isArray(payload)
  ) {
    return null;
  }

  const record = payload as Record<string, unknown>;
  if (
    record.algorithm !== SIGNED_REQUEST_ALGORITHM ||
    typeof record.user_id !== 'string' ||
    record.user_id.trim().length === 0 ||
    (record.issued_at !== undefined &&
      (typeof record.issued_at !== 'number' ||
        !Number.isSafeInteger(record.issued_at) ||
        record.issued_at <= 0))
  ) {
    return null;
  }

  return {
    algorithm: SIGNED_REQUEST_ALGORITHM,
    ...(record.issued_at === undefined
      ? {}
      : { issued_at: record.issued_at as number }),
    user_id: record.user_id.trim(),
  };
}

function signDeletionReceipt(completedAt: number, secret: string): string {
  return createHmac('sha256', secret)
    .update(`${DELETION_RECEIPT_DOMAIN}:${completedAt}`)
    .digest('base64url');
}

/**
 * Create an opaque, stateless receipt only after deletion has completed.
 * The receipt contains a completion timestamp but no provider or Genfeed id.
 */
export function createThreadsDeletionReceipt(
  secret: string,
  completedAtMs: number = Date.now(),
): string {
  const completedAt = Math.floor(completedAtMs / 1000);
  return `${DELETION_RECEIPT_VERSION}.${completedAt}.${signDeletionReceipt(completedAt, secret)}`;
}

/** Verify a deletion receipt and return its completion time. */
export function verifyThreadsDeletionReceipt(
  receipt: string,
  secret: string,
  nowMs: number = Date.now(),
): Date | null {
  const [version, completedAtRaw, suppliedSignature, extra] =
    receipt.split('.');
  if (
    version !== DELETION_RECEIPT_VERSION ||
    !completedAtRaw ||
    !suppliedSignature ||
    extra !== undefined ||
    !isBase64UrlSegment(suppliedSignature)
  ) {
    return null;
  }

  const completedAt = Number(completedAtRaw);
  if (
    !Number.isSafeInteger(completedAt) ||
    completedAt <= 0 ||
    completedAt > Math.floor(nowMs / 1000)
  ) {
    return null;
  }

  const expected = Buffer.from(signDeletionReceipt(completedAt, secret));
  const supplied = Buffer.from(suppliedSignature);
  if (
    supplied.length !== expected.length ||
    !timingSafeEqual(supplied, expected)
  ) {
    return null;
  }

  return new Date(completedAt * 1000);
}
