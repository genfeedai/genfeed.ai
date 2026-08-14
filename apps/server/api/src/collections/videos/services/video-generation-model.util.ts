export type VideoModelPreferenceSource = {
  defaultImageToVideoModel?: unknown;
  defaultVideoModel?: unknown;
};

export function pickVideoModelPreference(
  isImageToVideo: boolean,
  source: VideoModelPreferenceSource | null | undefined,
): string | undefined {
  const value = isImageToVideo
    ? source?.defaultImageToVideoModel
    : source?.defaultVideoModel;

  return typeof value === 'string' ? value : undefined;
}

export function emptyStyleToNull(style?: string): string | null | undefined {
  return style === '' ? null : style;
}

export function optionalBrandString(
  value: string | null | undefined,
): string | undefined {
  return value ?? undefined;
}

export function brandPromptLabel(label: string | null | undefined): string {
  return label ?? 'Brand';
}
