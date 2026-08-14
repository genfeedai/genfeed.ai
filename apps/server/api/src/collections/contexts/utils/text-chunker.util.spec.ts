import {
  chunkText,
  DEFAULT_KNOWLEDGE_SOURCE_CHUNK_OVERLAP,
  DEFAULT_KNOWLEDGE_SOURCE_CHUNK_SIZE,
} from '@api/collections/contexts/utils/text-chunker.util';

describe('chunkText', () => {
  it('returns no chunks for empty or whitespace-only input', () => {
    expect(chunkText('')).toEqual([]);
    expect(chunkText('   \n\t  ')).toEqual([]);
  });

  it('returns a single chunk when the text fits in one window', () => {
    expect(chunkText('Brand voice is calm and direct.')).toEqual([
      'Brand voice is calm and direct.',
    ]);
  });

  it('collapses whitespace before measuring length', () => {
    expect(chunkText('  hello   \n\n  world  ')).toEqual(['hello world']);
  });

  it('splits long text into fixed-size windows with overlap', () => {
    const text = 'abcdefghij';
    expect(chunkText(text, { overlap: 2, size: 4 })).toEqual([
      'abcd',
      'cdef',
      'efgh',
      'ghij',
    ]);
  });

  it('keeps the final partial window', () => {
    expect(chunkText('abcdefg', { overlap: 1, size: 3 })).toEqual([
      'abc',
      'cde',
      'efg',
    ]);
  });

  it('defaults to the knowledge-source window size and overlap', () => {
    const text = 'x'.repeat(DEFAULT_KNOWLEDGE_SOURCE_CHUNK_SIZE + 50);
    const chunks = chunkText(text);

    expect(chunks).toHaveLength(2);
    expect(chunks[0]).toHaveLength(DEFAULT_KNOWLEDGE_SOURCE_CHUNK_SIZE);
    expect(chunks[1].length).toBe(50 + DEFAULT_KNOWLEDGE_SOURCE_CHUNK_OVERLAP);
    expect(
      chunks[1].startsWith('x'.repeat(DEFAULT_KNOWLEDGE_SOURCE_CHUNK_OVERLAP)),
    ).toBe(true);
  });

  it('rejects a non-positive size or an overlap that is not smaller than size', () => {
    expect(() => chunkText('abc', { size: 0 })).toThrow(/chunk size/i);
    expect(() => chunkText('abc', { overlap: 4, size: 4 })).toThrow(/overlap/i);
    expect(() => chunkText('abc', { overlap: -1, size: 4 })).toThrow(
      /overlap/i,
    );
  });

  it('caps the number of chunks when a max is provided', () => {
    const text = 'abcdefghijklmnopqrstuvwxyz';
    expect(chunkText(text, { maxChunks: 2, overlap: 0, size: 4 })).toEqual([
      'abcd',
      'efgh',
    ]);
  });
});
