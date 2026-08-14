export const DEFAULT_KNOWLEDGE_SOURCE_CHUNK_SIZE = 1000;
export const DEFAULT_KNOWLEDGE_SOURCE_CHUNK_OVERLAP = 200;
export const DEFAULT_KNOWLEDGE_SOURCE_MAX_CHUNKS = 200;

export interface ChunkTextOptions {
  maxChunks?: number;
  overlap?: number;
  size?: number;
}

function normalizeChunkText(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

export function chunkText(
  text: string,
  options: ChunkTextOptions = {},
): string[] {
  const size = options.size ?? DEFAULT_KNOWLEDGE_SOURCE_CHUNK_SIZE;
  const overlap = options.overlap ?? DEFAULT_KNOWLEDGE_SOURCE_CHUNK_OVERLAP;
  const maxChunks = options.maxChunks ?? DEFAULT_KNOWLEDGE_SOURCE_MAX_CHUNKS;

  if (size <= 0) {
    throw new Error('chunk size must be greater than 0');
  }
  if (overlap < 0 || overlap >= size) {
    throw new Error('chunk overlap must be >= 0 and smaller than chunk size');
  }

  const normalized = normalizeChunkText(text);
  if (!normalized) {
    return [];
  }

  if (normalized.length <= size) {
    return [normalized];
  }

  const chunks: string[] = [];
  let start = 0;

  while (start < normalized.length && chunks.length < maxChunks) {
    const end = Math.min(start + size, normalized.length);
    chunks.push(normalized.slice(start, end));
    if (end >= normalized.length) {
      break;
    }
    start = end - overlap;
  }

  return chunks;
}
