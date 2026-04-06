'use client';

import { IngredientCategory } from '@genfeedai/enums';
import { EnvironmentService } from '@services/core/environment.service';

export type WorkflowMediaKind = 'image' | 'video';
export type WorkflowMediaSource = 'library' | 'brand-references' | 'url';
export type WorkflowMediaItemCategory = 'image' | 'reference' | 'video';

export interface WorkflowMediaDimensions {
  width: number;
  height: number;
}

export interface WorkflowMediaConfig {
  source: WorkflowMediaSource;
  url: string | null;
  itemId: string | null;
  itemCategory: WorkflowMediaItemCategory | null;
  resolvedUrl: string | null;
  selectedResolvedUrl: string | null;
  label: string | null;
  thumbnailUrl: string | null;
  duration: number | null;
  mimeType: string | null;
  dimensions: WorkflowMediaDimensions | null;
}

export interface WorkflowMediaSelection {
  id: string;
  itemCategory: WorkflowMediaItemCategory;
  resolvedUrl: string;
  label: string | null;
  thumbnailUrl: string | null;
  duration: number | null;
  mimeType: string | null;
  dimensions: WorkflowMediaDimensions | null;
}

type GallerySelectable = {
  id?: string;
  _id?: string;
  url?: string;
  label?: string;
  filename?: string;
  name?: string;
  thumbnail?: string;
  mimeType?: string;
  duration?: number;
  width?: number;
  height?: number;
  dimensions?: {
    width?: number;
    height?: number;
  };
};

type NodeDataLike = Record<string, unknown> & {
  config?: Record<string, unknown>;
};

const DEFAULT_MEDIA_SOURCE: WorkflowMediaSource = 'library';

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object';
}

function isWorkflowMediaSource(value: unknown): value is WorkflowMediaSource {
  return value === 'library' || value === 'brand-references' || value === 'url';
}

function isWorkflowMediaItemCategory(
  value: unknown,
): value is WorkflowMediaItemCategory {
  return value === 'image' || value === 'reference' || value === 'video';
}

function readString(
  record: Record<string, unknown>,
  key: string,
): string | null {
  const value = record[key];
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

function readNumber(
  record: Record<string, unknown>,
  key: string,
): number | null {
  const value = record[key];
  return typeof value === 'number' ? value : null;
}

function readDimensions(
  record: Record<string, unknown>,
  key: string,
): WorkflowMediaDimensions | null {
  const value = record[key];
  if (!isRecord(value)) {
    return null;
  }

  const width = value.width;
  const height = value.height;

  if (typeof width !== 'number' || typeof height !== 'number') {
    return null;
  }

  return { height, width };
}

function inferTopLevelUrl(
  nodeData: NodeDataLike,
  kind: WorkflowMediaKind,
): string | null {
  const field = kind === 'image' ? 'image' : 'video';
  const directValue = nodeData[field];

  if (typeof directValue === 'string' && directValue.trim().length > 0) {
    return directValue;
  }

  const urlValue = nodeData.url;
  return typeof urlValue === 'string' && urlValue.trim().length > 0
    ? urlValue
    : null;
}

function buildImageUrl(id: string): string {
  return `${EnvironmentService.ingredientsEndpoint}/images/${id}`;
}

function buildReferenceUrl(id: string): string {
  return `${EnvironmentService.ingredientsEndpoint}/references/${id}`;
}

function buildVideoUrl(id: string): string {
  return `${EnvironmentService.ingredientsEndpoint}/videos/${id}`;
}

function buildSelectionDimensions(
  item: GallerySelectable,
): WorkflowMediaDimensions | null {
  if (
    item.dimensions &&
    typeof item.dimensions.width === 'number' &&
    typeof item.dimensions.height === 'number'
  ) {
    return {
      height: item.dimensions.height,
      width: item.dimensions.width,
    };
  }

  if (typeof item.width === 'number' && typeof item.height === 'number') {
    return {
      height: item.height,
      width: item.width,
    };
  }

  return null;
}

function currentResolvedUrl(config: WorkflowMediaConfig): string | null {
  if (config.source === 'url') {
    return config.url;
  }

  return config.selectedResolvedUrl;
}

export function getWorkflowMediaConfig(
  nodeData: unknown,
  kind: WorkflowMediaKind,
): WorkflowMediaConfig {
  const safeNodeData = isRecord(nodeData) ? (nodeData as NodeDataLike) : {};
  const config = isRecord(safeNodeData.config) ? safeNodeData.config : {};
  const fallbackUrl = inferTopLevelUrl(safeNodeData, kind);
  const source = isWorkflowMediaSource(config.source)
    ? config.source
    : fallbackUrl
      ? 'url'
      : DEFAULT_MEDIA_SOURCE;

  const normalized: WorkflowMediaConfig = {
    dimensions:
      readDimensions(config, 'dimensions') ??
      readDimensions(safeNodeData, 'dimensions'),
    duration:
      readNumber(config, 'duration') ?? readNumber(safeNodeData, 'duration'),
    itemCategory: isWorkflowMediaItemCategory(config.itemCategory)
      ? config.itemCategory
      : null,
    itemId: readString(config, 'itemId'),
    label: readString(config, 'label') ?? readString(safeNodeData, 'filename'),
    mimeType: readString(config, 'mimeType'),
    resolvedUrl: null,
    selectedResolvedUrl:
      readString(config, 'selectedResolvedUrl') ??
      (source === 'url' ? null : readString(config, 'resolvedUrl')),
    source,
    thumbnailUrl:
      readString(config, 'thumbnailUrl') ??
      readString(safeNodeData, 'thumbnail'),
    url:
      readString(config, 'url') ??
      (source === 'url' ? readString(config, 'resolvedUrl') : null) ??
      (source === 'url' ? fallbackUrl : null),
  };

  normalized.resolvedUrl = currentResolvedUrl(normalized);

  return normalized;
}

export function setWorkflowMediaSource(
  config: WorkflowMediaConfig,
  source: WorkflowMediaSource,
): WorkflowMediaConfig {
  const nextConfig: WorkflowMediaConfig = {
    ...config,
    source,
  };

  nextConfig.resolvedUrl = currentResolvedUrl(nextConfig);
  return nextConfig;
}

export function clearCurrentWorkflowMedia(
  config: WorkflowMediaConfig,
): WorkflowMediaConfig {
  const nextConfig: WorkflowMediaConfig = { ...config };

  if (nextConfig.source === 'url') {
    nextConfig.url = null;
  } else {
    nextConfig.itemCategory = null;
    nextConfig.itemId = null;
    nextConfig.label = null;
    nextConfig.thumbnailUrl = null;
    nextConfig.duration = null;
    nextConfig.mimeType = null;
    nextConfig.dimensions = null;
    nextConfig.selectedResolvedUrl = null;
  }

  nextConfig.resolvedUrl = currentResolvedUrl(nextConfig);
  return nextConfig;
}

export function createWorkflowMediaUrlConfig(
  config: WorkflowMediaConfig,
  url: string,
): WorkflowMediaConfig {
  const trimmedUrl = url.trim();
  const nextConfig: WorkflowMediaConfig = {
    ...config,
    resolvedUrl: trimmedUrl,
    source: 'url',
    url: trimmedUrl,
  };

  return nextConfig;
}

export function createWorkflowMediaSelectionConfig(
  config: WorkflowMediaConfig,
  source: Exclude<WorkflowMediaSource, 'url'>,
  selection: WorkflowMediaSelection,
): WorkflowMediaConfig {
  const nextConfig: WorkflowMediaConfig = {
    ...config,
    dimensions: selection.dimensions,
    duration: selection.duration,
    itemCategory: selection.itemCategory,
    itemId: selection.id,
    label: selection.label,
    mimeType: selection.mimeType,
    resolvedUrl: selection.resolvedUrl,
    selectedResolvedUrl: selection.resolvedUrl,
    source,
    thumbnailUrl: selection.thumbnailUrl,
  };

  return nextConfig;
}

export function buildWorkflowMediaNodePatch(
  kind: WorkflowMediaKind,
  config: WorkflowMediaConfig,
): Record<string, unknown> {
  const mediaField = kind === 'image' ? 'image' : 'video';
  const patch: Record<string, unknown> = {
    config: {
      dimensions: config.dimensions,
      duration: config.duration,
      itemCategory: config.itemCategory,
      itemId: config.itemId,
      label: config.label,
      mimeType: config.mimeType,
      resolvedUrl: currentResolvedUrl(config),
      selectedResolvedUrl: config.selectedResolvedUrl,
      source: config.source,
      thumbnailUrl: config.thumbnailUrl,
      url: config.url,
    },
    dimensions: config.dimensions,
    filename: config.label,
    source: config.source,
    url: config.url ?? undefined,
    [mediaField]: currentResolvedUrl(config),
  };

  if (kind === 'video') {
    patch.duration = config.duration;
    patch.thumbnail = config.thumbnailUrl;
  }

  return patch;
}

export function toWorkflowMediaSelection(
  item: unknown,
  kind: WorkflowMediaKind,
  source: Exclude<WorkflowMediaSource, 'url'>,
): WorkflowMediaSelection | null {
  if (!isRecord(item)) {
    return null;
  }

  const mediaItem = item as GallerySelectable;
  const id = mediaItem.id ?? mediaItem._id;
  if (typeof id !== 'string' || id.length === 0) {
    return null;
  }

  const itemCategory: WorkflowMediaItemCategory =
    source === 'brand-references' ? 'reference' : kind;

  const resolvedUrl =
    mediaItem.url ??
    (itemCategory === 'image'
      ? buildImageUrl(id)
      : itemCategory === 'video'
        ? buildVideoUrl(id)
        : buildReferenceUrl(id));

  return {
    dimensions: buildSelectionDimensions(mediaItem),
    duration:
      typeof mediaItem.duration === 'number' ? mediaItem.duration : null,
    id,
    itemCategory,
    label:
      mediaItem.label ??
      mediaItem.filename ??
      mediaItem.name ??
      (source === 'brand-references' ? 'Brand reference' : id),
    mimeType: mediaItem.mimeType ?? null,
    resolvedUrl,
    thumbnailUrl:
      mediaItem.thumbnail ??
      (itemCategory === 'reference' ? resolvedUrl : null),
  };
}

export function getWorkflowMediaPickerCategory(
  kind: WorkflowMediaKind,
): IngredientCategory {
  return kind === 'image' ? IngredientCategory.IMAGE : IngredientCategory.VIDEO;
}
