import { inflateRawSync } from 'node:zlib';
import { extractPdfText } from '@api/collections/contexts/utils/extract-source-text.util';

export const KNOWLEDGE_UPLOAD_EXTENSIONS = [
  'docx',
  'md',
  'markdown',
  'pdf',
  'txt',
] as const;

export const KNOWLEDGE_UPLOAD_MIME_TYPES = [
  'application/octet-stream',
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/markdown',
  'text/plain',
  'text/x-markdown',
] as const;

const DOCX_DOCUMENT_PATH = 'word/document.xml';
const ZIP_END_OF_CENTRAL_DIRECTORY = 0x06054b50;
const ZIP_CENTRAL_DIRECTORY_ENTRY = 0x02014b50;
const ZIP_LOCAL_FILE_HEADER = 0x04034b50;
const ZIP_EOCD_MIN_SIZE = 22;
const ZIP_MAX_COMMENT_SIZE = 0xffff;

/**
 * Inflation ceiling for the document body. A 2 MB archive can hold a
 * highly compressible XML payload that expands into hundreds of megabytes,
 * so the decompressor is bounded rather than the upload alone.
 */
const DOCX_MAX_INFLATED_BYTES = 16 * 1024 * 1024;

const XML_ENTITIES: Record<string, string> = {
  amp: '&',
  apos: "'",
  gt: '>',
  lt: '<',
  quot: '"',
};

export class UnsupportedUploadedDocumentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UnsupportedUploadedDocumentError';
  }
}

function findEndOfCentralDirectory(buffer: Buffer): number {
  const lowest = Math.max(
    0,
    buffer.length - ZIP_EOCD_MIN_SIZE - ZIP_MAX_COMMENT_SIZE,
  );
  for (
    let offset = buffer.length - ZIP_EOCD_MIN_SIZE;
    offset >= lowest;
    offset--
  ) {
    if (buffer.readUInt32LE(offset) === ZIP_END_OF_CENTRAL_DIRECTORY) {
      return offset;
    }
  }
  throw new UnsupportedUploadedDocumentError(
    'The DOCX file is not a valid ZIP archive.',
  );
}

/** Read one entry from a ZIP archive through its central directory. */
function readZipEntry(buffer: Buffer, entryPath: string): Buffer {
  const eocd = findEndOfCentralDirectory(buffer);
  const entryCount = buffer.readUInt16LE(eocd + 10);
  let offset = buffer.readUInt32LE(eocd + 16);

  for (let index = 0; index < entryCount; index++) {
    if (buffer.readUInt32LE(offset) !== ZIP_CENTRAL_DIRECTORY_ENTRY) {
      break;
    }
    const method = buffer.readUInt16LE(offset + 10);
    const compressedSize = buffer.readUInt32LE(offset + 20);
    const nameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const localHeaderOffset = buffer.readUInt32LE(offset + 42);
    const name = buffer.toString('utf8', offset + 46, offset + 46 + nameLength);

    if (name === entryPath) {
      if (buffer.readUInt32LE(localHeaderOffset) !== ZIP_LOCAL_FILE_HEADER) {
        break;
      }
      const localNameLength = buffer.readUInt16LE(localHeaderOffset + 26);
      const localExtraLength = buffer.readUInt16LE(localHeaderOffset + 28);
      const dataStart =
        localHeaderOffset + 30 + localNameLength + localExtraLength;
      const data = buffer.subarray(dataStart, dataStart + compressedSize);
      if (method === 0) {
        return data;
      }
      if (method === 8) {
        try {
          return inflateRawSync(data, {
            maxOutputLength: DOCX_MAX_INFLATED_BYTES,
          });
        } catch {
          throw new UnsupportedUploadedDocumentError(
            'The DOCX file expands to more text than we can ingest. Split it into smaller files.',
          );
        }
      }
      throw new UnsupportedUploadedDocumentError(
        `Unsupported DOCX compression method ${method}.`,
      );
    }

    offset += 46 + nameLength + extraLength + commentLength;
  }

  throw new UnsupportedUploadedDocumentError(
    'The DOCX file has no document body.',
  );
}

function decodeXmlEntities(text: string): string {
  return text.replace(
    /&(#x[0-9a-f]+|#\d+|[a-z]+);/gi,
    (match, entity: string) => {
      if (entity.startsWith('#x') || entity.startsWith('#X')) {
        return String.fromCodePoint(Number.parseInt(entity.slice(2), 16));
      }
      if (entity.startsWith('#')) {
        return String.fromCodePoint(Number.parseInt(entity.slice(1), 10));
      }
      return XML_ENTITIES[entity.toLowerCase()] ?? match;
    },
  );
}

/** Paragraph-preserving plain text from a DOCX (Office Open XML) file. */
export function extractDocxText(buffer: Buffer): string {
  const xml = readZipEntry(buffer, DOCX_DOCUMENT_PATH).toString('utf8');
  const text = decodeXmlEntities(
    xml
      .replace(/<w:tab\/>/g, '\t')
      .replace(/<w:(br|cr)\/>/g, '\n')
      .replace(/<\/w:p>/g, '\n')
      .replace(/<[^>]+>/g, ''),
  )
    .split('\n')
    .map((line) => line.replace(/[ \t]+/g, ' ').trim())
    .filter(Boolean)
    .join('\n');

  if (!text) {
    throw new UnsupportedUploadedDocumentError(
      'No extractable text in the DOCX file.',
    );
  }
  return text;
}

function readExtension(fileName: string): string {
  const match = /\.([a-z0-9]+)$/i.exec(fileName.trim());
  return match?.[1]?.toLowerCase() ?? '';
}

/**
 * Text for an uploaded corpus file (PDF, DOCX, TXT, Markdown). The result is
 * captured as a TEXT knowledge source, so uploads need no object storage and
 * work on self-hosted installs.
 */
export function extractUploadedDocumentText(file: {
  buffer: Buffer;
  fileName: string;
  mimeType?: string;
}): string {
  const extension = readExtension(file.fileName);
  const isPdf =
    extension === 'pdf' ||
    file.mimeType === 'application/pdf' ||
    file.buffer.subarray(0, 5).toString('latin1') === '%PDF-';

  if (isPdf) {
    return extractPdfText(file.buffer);
  }
  if (extension === 'docx') {
    return extractDocxText(file.buffer);
  }
  if (extension === 'txt' || extension === 'md' || extension === 'markdown') {
    const text = new TextDecoder('utf-8', { fatal: false })
      .decode(file.buffer)
      .replace(/\r\n/g, '\n')
      .trim();
    if (!text) {
      throw new UnsupportedUploadedDocumentError('The uploaded file is empty.');
    }
    return text;
  }

  throw new UnsupportedUploadedDocumentError(
    'Upload a PDF, DOCX, TXT, or Markdown file.',
  );
}
