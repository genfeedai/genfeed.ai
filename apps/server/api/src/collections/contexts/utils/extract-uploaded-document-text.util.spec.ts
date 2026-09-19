import { deflateRawSync } from 'node:zlib';
import {
  extractDocxText,
  extractUploadedDocumentText,
  UnsupportedUploadedDocumentError,
} from '@api/collections/contexts/utils/extract-uploaded-document-text.util';
import { describe, expect, it } from 'vitest';

/** Minimal single-entry ZIP (deflated) — enough structure for the reader. */
function buildZip(entryName: string, content: string): Buffer {
  const name = Buffer.from(entryName, 'utf8');
  const raw = Buffer.from(content, 'utf8');
  const data = deflateRawSync(raw);

  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(20, 4);
  local.writeUInt16LE(8, 8);
  local.writeUInt32LE(data.length, 18);
  local.writeUInt32LE(raw.length, 22);
  local.writeUInt16LE(name.length, 26);

  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50, 0);
  central.writeUInt16LE(20, 4);
  central.writeUInt16LE(20, 6);
  central.writeUInt16LE(8, 10);
  central.writeUInt32LE(data.length, 20);
  central.writeUInt32LE(raw.length, 24);
  central.writeUInt16LE(name.length, 28);
  central.writeUInt32LE(0, 42);

  const localSize = local.length + name.length + data.length;
  const centralSize = central.length + name.length;
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(1, 8);
  eocd.writeUInt16LE(1, 10);
  eocd.writeUInt32LE(centralSize, 12);
  eocd.writeUInt32LE(localSize, 16);

  return Buffer.concat([local, name, data, central, name, eocd]);
}

const DOCUMENT_XML =
  '<w:document><w:body>' +
  '<w:p><w:r><w:t>Cash flow is designed,</w:t></w:r><w:r><w:t xml:space="preserve"> not reported.</w:t></w:r></w:p>' +
  '<w:p><w:r><w:t>Q&amp;A</w:t><w:tab/><w:t>&#8220;weekly&#8221;</w:t></w:r></w:p>' +
  '</w:body></w:document>';

describe('extractDocxText', () => {
  it('reads paragraphs from word/document.xml', () => {
    const text = extractDocxText(buildZip('word/document.xml', DOCUMENT_XML));
    expect(text).toBe('Cash flow is designed, not reported.\nQ&A “weekly”');
  });

  it('rejects an archive without a document body', () => {
    expect(() =>
      extractDocxText(buildZip('word/styles.xml', '<w:styles/>')),
    ).toThrow(UnsupportedUploadedDocumentError);
  });

  it('rejects bytes that are not a ZIP archive', () => {
    expect(() => extractDocxText(Buffer.from('not a zip'))).toThrow(
      UnsupportedUploadedDocumentError,
    );
  });
});

describe('extractUploadedDocumentText', () => {
  it('decodes Markdown and plain text uploads', () => {
    expect(
      extractUploadedDocumentText({
        buffer: Buffer.from('# Talk\r\nNotes from the keynote\r\n'),
        fileName: 'keynote.md',
        mimeType: 'text/markdown',
      }),
    ).toBe('# Talk\nNotes from the keynote');
    expect(
      extractUploadedDocumentText({
        buffer: Buffer.from('call notes'),
        fileName: 'call.TXT',
      }),
    ).toBe('call notes');
  });

  it('routes DOCX uploads through the DOCX reader', () => {
    expect(
      extractUploadedDocumentText({
        buffer: buildZip('word/document.xml', DOCUMENT_XML),
        fileName: 'newsletter.docx',
        mimeType:
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      }),
    ).toContain('Cash flow is designed');
  });

  it('rejects empty and unsupported files', () => {
    expect(() =>
      extractUploadedDocumentText({
        buffer: Buffer.from('   '),
        fileName: 'empty.txt',
      }),
    ).toThrow(UnsupportedUploadedDocumentError);
    expect(() =>
      extractUploadedDocumentText({
        buffer: Buffer.from('x'),
        fileName: 'slides.pptx',
      }),
    ).toThrow(UnsupportedUploadedDocumentError);
  });
});
