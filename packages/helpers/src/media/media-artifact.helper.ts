import type {
  McpMediaContentPart,
  McpMediaToolResult,
  MediaArtifactKind,
  MediaArtifactResult,
} from '@genfeedai/contracts/interfaces';

const IMAGE_URL_PATTERN = /\.(avif|gif|jpe?g|png|webp)(\?|$)/i;

function readString(
  record: Record<string, unknown>,
  key: string,
): string | undefined {
  const value = record[key];
  return typeof value === 'string' && value.trim().length > 0
    ? value.trim()
    : undefined;
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
    readString(payload, 'kind') ??
    readString(payload, 'assetKind') ??
    readString(payload, 'category')?.toLowerCase();
  if (explicit === 'image' || explicit === 'video' || explicit === 'audio') {
    return explicit;
  }
  if (explicit === 'music' || explicit === 'voice') {
    return 'audio';
  }
  const url = readString(payload, 'url') ?? readString(payload, 'cdnUrl');
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
  const id = readString(payload, 'id') ?? readString(payload, 'assetId');
  if (!id) {
    return undefined;
  }
  const kind = inferMediaArtifactKind(payload);
  if (!kind) {
    return undefined;
  }
  const url = readString(payload, 'url') ?? readString(payload, 'cdnUrl');
  const status = readString(payload, 'status') ?? 'PROCESSING';
  if (kind === 'image') {
    return {
      height: readNumber(payload, 'height'),
      id,
      kind,
      mimeType: inferImageMimeType(url),
      renderMode: url ? 'native_image' : 'open_url',
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

function inferImageMimeType(url: string | undefined): string {
  if (!url) {
    return 'image/png';
  }
  if (/\.jpe?g(\?|$)/i.test(url)) {
    return 'image/jpeg';
  }
  if (/\.webp(\?|$)/i.test(url)) {
    return 'image/webp';
  }
  if (/\.gif(\?|$)/i.test(url)) {
    return 'image/gif';
  }
  if (/\.avif(\?|$)/i.test(url)) {
    return 'image/avif';
  }
  return 'image/png';
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
