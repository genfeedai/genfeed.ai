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

export type McpTextContentPart = {
  text: string;
  type: 'text';
};

export type McpImageContentPart = {
  data: string;
  mimeType: string;
  type: 'image';
};

export type McpResourceLinkContentPart = {
  mimeType?: string;
  name: string;
  type: 'resource_link';
  uri: string;
};

/**
 * MCP `tools/call` content blocks. Image parts are base64 (`data`); URL media
 * must use `resource_link` so results stay assignable to CallToolResult.
 */
export type McpMediaContentPart =
  | McpTextContentPart
  | McpImageContentPart
  | McpResourceLinkContentPart;

export interface McpMediaToolResult {
  content: McpMediaContentPart[];
  structuredContent: {
    artifact?: MediaArtifactResult;
    data: Record<string, unknown>;
  };
}
