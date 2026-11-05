import { readString } from '@genfeedai/contracts/constants/type-guards.constant';
import type {
  McpImageContentPart,
  McpMediaContentPart,
  McpMediaToolResult,
  MediaArtifactKind,
  MediaArtifactResult,
} from '@genfeedai/contracts/interfaces';

const JPEG_URL_PATTERN = /\.jpe?g(\?|$)/i;
const WEBP_URL_PATTERN = /\.webp(\?|$)/i;
const GIF_URL_PATTERN = /\.gif(\?|$)/i;
const AVIF_URL_PATTERN = /\.avif(\?|$)/i;
const PNG_URL_PATTERN = /\.png(\?|$)/i;

const IMAGE_URL_PATTERN = /\.(avif|gif|jpe?g|png|webp)(\?|$)/i;

function readStringField(
  record: Record<string, unknown>,
  key: string,
): string | undefined {
  return readString(record[key]);
}

function readNumber(
  record: Record<string, unknown>,
  key: string,
): number | undefined {
  const value = record[key];
  return typeof value === 'number' && Number.isFinite(value)
    ? value
    : undefined;
}

export function inferMediaArtifactKind(
  payload: Record<string, unknown>,
): MediaArtifactKind | undefined {
  const explicit =
    readStringField(payload, 'kind') ??
    readStringField(payload, 'assetKind') ??
    readStringField(payload, 'category')?.toLowerCase();
  if (explicit === 'image' || explicit === 'video' || explicit === 'audio') {
    return explicit;
  }
  if (explicit === 'music' || explicit === 'voice') {
    return 'audio';
  }
  const url =
    readStringField(payload, 'url') ?? readStringField(payload, 'cdnUrl');
  if (!url) {
    return undefined;
  }
  if (IMAGE_URL_PATTERN.test(url) || url.includes('/images/')) {
    return 'image';
  }
  if (
    url.includes('/videos/') ||
    url.includes('.mp4') ||
    url.includes('.webm')
  ) {
    return 'video';
  }
  if (url.includes('/music/') || url.includes('/voices/')) {
    return 'audio';
  }
  return undefined;
}

export function serializeMediaArtifact(
  payload: Record<string, unknown>,
): MediaArtifactResult | undefined {
  const id =
    readStringField(payload, 'id') ?? readStringField(payload, 'assetId');
  if (!id) {
    return undefined;
  }
  const kind = inferMediaArtifactKind(payload);
  if (!kind) {
    return undefined;
  }
  const url =
    readStringField(payload, 'url') ?? readStringField(payload, 'cdnUrl');
  const status = readStringField(payload, 'status') ?? 'PROCESSING';
  if (kind === 'image') {
    return {
      height: readNumber(payload, 'height'),
      id,
      kind,
      mimeType: readStringField(payload, 'mimeType') ?? inferImageMimeType(url),
      renderMode: url ? 'resource_link' : 'open_url',
      status,
      url,
      width: readNumber(payload, 'width'),
    };
  }
  if (kind === 'video') {
    return {
      id,
      kind,
      mimeType: 'video/mp4',
      renderMode: url ? 'file_download' : 'open_url',
      status,
      url,
    };
  }
  return {
    id,
    kind,
    renderMode: url ? 'file_download' : 'open_url',
    status,
    url,
  };
}

function inferImageMimeType(url: string | undefined): string | undefined {
  if (!url) {
    return undefined;
  }
  if (JPEG_URL_PATTERN.test(url)) {
    return 'image/jpeg';
  }
  if (WEBP_URL_PATTERN.test(url)) {
    return 'image/webp';
  }
  if (GIF_URL_PATTERN.test(url)) {
    return 'image/gif';
  }
  if (AVIF_URL_PATTERN.test(url)) {
    return 'image/avif';
  }
  return PNG_URL_PATTERN.test(url) ? 'image/png' : undefined;
}

function textFallback(artifact: MediaArtifactResult): string {
  if (artifact.kind === 'video') {
    return artifact.url
      ? `Video ${artifact.id} is ready as a downloadable file: ${artifact.url}`
      : `Video ${artifact.id} status: ${artifact.status}`;
  }
  if (artifact.kind === 'image') {
    return artifact.url
      ? `Image ${artifact.id} is ready: ${artifact.url}`
      : `Image ${artifact.id} status: ${artifact.status}`;
  }
  return artifact.url
    ? `Audio ${artifact.id} is ready: ${artifact.url}`
    : `Audio ${artifact.id} status: ${artifact.status}`;
}

export function toMcpMediaToolResult(
  payload: Record<string, unknown>,
  image?: McpImageContentPart,
): McpMediaToolResult {
  const artifact = serializeMediaArtifact(payload);
  const content: McpMediaContentPart[] = [
    {
      text: artifact
        ? textFallback(artifact)
        : JSON.stringify(payload, null, 2),
      type: 'text',
    },
  ];

  if (artifact?.kind === 'image' && image) {
    artifact.mimeType = image.mimeType;
    artifact.renderMode = 'native_image';
    content.push(image);
  }

  if (artifact?.url) {
    content.push({
      mimeType: artifact.mimeType,
      name: artifact.id,
      type: 'resource_link',
      uri: artifact.url,
    });
  }

  if (artifact && payload.generationHarness) {
    content.push({
      type: 'text',
      text: JSON.stringify(
        { generationHarness: payload.generationHarness },
        null,
        2,
      ),
    });
  }

  return {
    content,
    structuredContent: {
      ...(artifact ? { artifact } : {}),
      data: payload,
    },
  };
}
