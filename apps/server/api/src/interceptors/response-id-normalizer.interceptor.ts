import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
  StreamableFile,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

type UnknownRecord = Record<string, unknown>;

function normalizeIdValue(value: unknown): unknown {
  if (value == null) {
    return value;
  }

  if (typeof value === 'string') {
    return value;
  }

  if (typeof value === 'number' || typeof value === 'bigint') {
    return String(value);
  }

  if (typeof value === 'object') {
    const maybeObjectId = value as { toHexString?: () => string };
    if (typeof maybeObjectId.toHexString === 'function') {
      return maybeObjectId.toHexString();
    }

    const withToString = value as { toString?: () => string };
    if (typeof withToString.toString === 'function') {
      return withToString.toString();
    }
  }

  return String(value);
}

function shouldSkipNormalization(value: unknown): boolean {
  return (
    value instanceof Date ||
    value instanceof StreamableFile ||
    Buffer.isBuffer(value) ||
    value instanceof Map ||
    value instanceof Set ||
    value instanceof ArrayBuffer ||
    ArrayBuffer.isView(value)
  );
}

function normalizeIds(value: unknown, seen: WeakSet<object>): unknown {
  if (value == null) {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => normalizeIds(item, seen));
  }

  if (typeof value !== 'object' || shouldSkipNormalization(value)) {
    return value;
  }

  if (seen.has(value)) {
    return value;
  }
  seen.add(value);

  const record = value as UnknownRecord;
  const hasIdKey = Object.hasOwn(record, 'id');
  const existingId = record.id;
  const shouldAssignId = !hasIdKey || existingId == null;

  const result: UnknownRecord = {};
  for (const [key, entryValue] of Object.entries(record)) {
    if (key === '_id') {
      if (shouldAssignId) {
        result.id = normalizeIdValue(entryValue);
      }
      continue;
    }

    result[key] = normalizeIds(entryValue, seen);
  }

  return result;
}

@Injectable()
export class ResponseIdNormalizerInterceptor implements NestInterceptor {
  intercept(
    _context: ExecutionContext,
    next: CallHandler,
  ): Observable<unknown> {
    return next
      .handle()
      .pipe(map((data) => normalizeIds(data, new WeakSet<object>())));
  }
}
