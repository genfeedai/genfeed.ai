export const MEDIA_ARTIFACT_KINDS = ['image', 'video', 'audio'] as const;

export type MediaArtifactKind = (typeof MEDIA_ARTIFACT_KINDS)[number];

export const MEDIA_ARTIFACT_RENDER_MODES = [
  'native_image',
  'resource_link',
  'file_download',
  'open_url',
] as const;

export type MediaArtifactRenderMode =
  (typeof MEDIA_ARTIFACT_RENDER_MODES)[number];

/**
 * Canonical generation artifact for external clients. Large media is referenced
 * rather than inlined. Video never claims unsupported inline playback.
 */
export interface MediaArtifactResult {
  expiresAt?: string;
  height?: number;
  id: string;
  kind: MediaArtifactKind;
  mimeType?: string;
  renderMode: MediaArtifactRenderMode;
  sizeBytes?: number;
  status: string;
  url?: string;
  width?: number;
}

export interface McpMediaContentPart {
  data?: string;
  mimeType?: string;
  text?: string;
  type: 'text' | 'image' | 'resource_link';
  uri?: string;
}

export interface McpMediaToolResult {
  content: McpMediaContentPart[];
  structuredContent: {
    artifact?: MediaArtifactResult;
    data: Record<string, unknown>;
  };
}
