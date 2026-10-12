import type { Writable } from 'node:stream';

const LENGTH_PREFIX_BYTES = 4;

/** The peer sent a frame the host must not read: too large, not UTF-8 JSON, or cut short. */
export class FrameError extends Error {
  constructor(
    message: string,
    readonly code: 'frame_too_large' | 'frame_invalid' | 'frame_truncated'
  ) {
    super(message);
    this.name = 'FrameError';
  }
}

/** Encodes one message as Chrome native messaging does: 4-byte little-endian length, then JSON. */
export function encodeFrame(message: unknown, maxBytes: number): Buffer {
  const body = Buffer.from(JSON.stringify(message), 'utf8');
  if (body.byteLength > maxBytes) {
    throw new FrameError(
      `Message is ${body.byteLength} bytes; the limit is ${maxBytes}`,
      'frame_too_large'
    );
  }
  const header = Buffer.alloc(LENGTH_PREFIX_BYTES);
  header.writeUInt32LE(body.byteLength, 0);
  return Buffer.concat([header, body]);
}

function parseBody(body: Buffer): unknown {
  try {
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(body));
  } catch {
    throw new FrameError('The message is not valid UTF-8 JSON', 'frame_invalid');
  }
}

/**
 * Splits a byte stream into messages as chunks arrive. A frame announcing more
 * than `maxBytes` is refused from its header alone, before its body is
 * buffered, so a hostile length cannot make the host allocate it.
 */
export class FrameDecoder {
  private buffered: Buffer = Buffer.alloc(0);

  constructor(private readonly maxBytes: number) {}

  push(chunk: Buffer): unknown[] {
    this.buffered = Buffer.concat([this.buffered, chunk]);
    const messages: unknown[] = [];
    while (this.buffered.byteLength >= LENGTH_PREFIX_BYTES) {
      const length = this.buffered.readUInt32LE(0);
      if (length > this.maxBytes) {
        throw new FrameError(
          `Message announces ${length} bytes; the limit is ${this.maxBytes}`,
          'frame_too_large'
        );
      }
      if (this.buffered.byteLength < LENGTH_PREFIX_BYTES + length) break;
      const body = this.buffered.subarray(LENGTH_PREFIX_BYTES, LENGTH_PREFIX_BYTES + length);
      this.buffered = this.buffered.subarray(LENGTH_PREFIX_BYTES + length);
      messages.push(parseBody(body));
    }
    return messages;
  }

  /** Call at end of input: bytes left over mean the peer stopped inside a frame. */
  finish(): void {
    if (this.buffered.byteLength > 0) {
      throw new FrameError('The input ended inside a message', 'frame_truncated');
    }
  }
}

/** Writes one frame and resolves once it is flushed, so the caller may exit right after. */
export function writeFrame(output: Writable, message: unknown, maxBytes: number): Promise<void> {
  const frame = encodeFrame(message, maxBytes);
  return new Promise((resolve, reject) => {
    output.write(frame, (error) => (error ? reject(error) : resolve()));
  });
}
