import { describe, expect, it } from 'vitest';
import { encodeFrame, FrameDecoder, FrameError } from '../../../src/commands/host/framing';

describe('native messaging framing', () => {
  it('prefixes the JSON body with its length as 4 little-endian bytes', () => {
    const frame = encodeFrame({ a: 'é' }, 100);
    const body = Buffer.from('{"a":"é"}', 'utf8');
    expect(frame.readUInt32LE(0)).toBe(body.byteLength);
    expect(frame.subarray(4).toString('utf8')).toBe('{"a":"é"}');
  });

  it('refuses to encode a message over the limit', () => {
    expect(() => encodeFrame({ text: 'x'.repeat(50) }, 10)).toThrow(FrameError);
  });

  it('decodes frames split across chunks and several frames in one chunk', () => {
    const decoder = new FrameDecoder(1_000);
    const first = encodeFrame({ n: 1 }, 1_000);
    const second = encodeFrame({ n: 2 }, 1_000);
    const joined = Buffer.concat([first, second]);

    expect(decoder.push(joined.subarray(0, 3))).toEqual([]);
    expect(decoder.push(joined.subarray(3, first.byteLength + 2))).toEqual([{ n: 1 }]);
    expect(decoder.push(joined.subarray(first.byteLength + 2))).toEqual([{ n: 2 }]);
    expect(() => decoder.finish()).not.toThrow();
  });

  it('refuses an oversized frame from its header alone', () => {
    const header = Buffer.alloc(4);
    header.writeUInt32LE(2_000_000_000, 0);
    expect(() => new FrameDecoder(1_000).push(header)).toThrow(
      expect.objectContaining({ code: 'frame_too_large' })
    );
  });

  it('rejects bodies that are not UTF-8 JSON', () => {
    const body = Buffer.from([0xff, 0xfe, 0xfd]);
    const header = Buffer.alloc(4);
    header.writeUInt32LE(body.byteLength, 0);
    expect(() => new FrameDecoder(100).push(Buffer.concat([header, body]))).toThrow(
      expect.objectContaining({ code: 'frame_invalid' })
    );
    const notJson = Buffer.from('nope');
    header.writeUInt32LE(notJson.byteLength, 0);
    expect(() => new FrameDecoder(100).push(Buffer.concat([header, notJson]))).toThrow(
      expect.objectContaining({ code: 'frame_invalid' })
    );
  });

  it('reports input that ends inside a frame', () => {
    const decoder = new FrameDecoder(1_000);
    decoder.push(encodeFrame({ n: 1 }, 1_000).subarray(0, 6));
    expect(() => decoder.finish()).toThrow(expect.objectContaining({ code: 'frame_truncated' }));
  });
});
