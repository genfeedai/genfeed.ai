import { Writable } from 'node:stream';
import type { Response } from 'express';

export interface RecordedResponseState {
  /** Bytes piped into the response, decoded as UTF-8. */
  body: string;
  headers: Record<string, string>;
  json?: unknown;
  location?: string;
  /** Defaults to 200 until the controller sets or redirects. */
  status: number;
}

/**
 * A response sink that records what a controller sends back (status, headers,
 * JSON, redirect target, streamed bytes), so specs assert on the HTTP outcome
 * instead of on which `res.*` methods were called.
 */
export function createRecordedResponse(): {
  recorded: RecordedResponseState;
  res: Response;
} {
  const chunks: Buffer[] = [];
  const recorded: RecordedResponseState = {
    body: '',
    headers: {},
    status: 200,
  };
  const sink = new Writable({
    write(chunk: Buffer | string, _encoding, callback) {
      chunks.push(Buffer.from(chunk));
      recorded.body = Buffer.concat(chunks).toString('utf8');
      callback();
    },
  });
  const res = Object.assign(sink, {
    json(body: unknown) {
      recorded.json = body;
      return res;
    },
    redirect(status: number, location: string) {
      recorded.status = status;
      recorded.location = location;
    },
    send(body: unknown) {
      recorded.body = String(body);
      return res;
    },
    set(headers: Record<string, string> | string, value?: string) {
      if (typeof headers === 'string') {
        recorded.headers[headers] = String(value);
      } else {
        Object.assign(recorded.headers, headers);
      }
      return res;
    },
    status(status: number) {
      recorded.status = status;
      return res;
    },
  });
  return { recorded, res: res as unknown as Response };
}
