import { Readable } from 'node:stream';
import { afterEach, describe, expect, it } from 'vitest';
import { readStdin } from '@/utils/stdin';

const originalStdin = Object.getOwnPropertyDescriptor(process, 'stdin');

function pipeToStdin(chunks: Array<string | Buffer>): void {
  Object.defineProperty(process, 'stdin', {
    configurable: true,
    value: Readable.from(chunks, { objectMode: false }),
  });
}

describe('readStdin', () => {
  afterEach(() => {
    if (originalStdin) {
      Object.defineProperty(process, 'stdin', originalStdin);
    }
  });

  it('joins every chunk and trims the surrounding whitespace', async () => {
    pipeToStdin(['  hello ', Buffer.from('world\n')]);

    await expect(readStdin()).resolves.toBe('hello world');
  });

  it('keeps a multi-byte character that is split across two chunks', async () => {
    const bytes = Buffer.from('café');
    pipeToStdin([bytes.subarray(0, 4), bytes.subarray(4)]);

    await expect(readStdin()).resolves.toBe('café');
  });

  it('returns an empty string when nothing is piped', async () => {
    pipeToStdin([]);

    await expect(readStdin()).resolves.toBe('');
  });
});
