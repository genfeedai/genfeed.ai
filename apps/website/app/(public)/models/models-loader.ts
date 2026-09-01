import { EnvironmentService } from '@services/core/environment.service';
import { cache } from 'react';

const CATALOG_PAGE_SIZE = 100;
const MAX_CATALOG_PAGES = 20;

export interface PublicModelCatalogItem {
  aspectRatios: string[];
  capabilities: string[];
  category: string;
  costTier?: string;
  defaultAspectRatio?: string;
  defaultDuration?: number;
  description?: string;
  durations: number[];
  id: string;
  isDefault: boolean;
  isHighlighted: boolean;
  key: string;
  label: string;
  maxOutputs?: number;
  provider: string;
  qualityTier?: string;
  recommendedFor: string[];
  speedTier?: string;
  supportsFeatures: string[];
}

interface CatalogPaginationLinks {
  pagination?: {
    pages?: number;
    total?: number;
  };
}

interface CatalogResource {
  attributes?: Partial<Omit<PublicModelCatalogItem, 'id'>>;
  id?: string;
}

interface CatalogResponse {
  data?: CatalogResource[];
  links?: CatalogPaginationLinks;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
}

function numberArray(value: unknown): number[] {
  return Array.isArray(value)
    ? value.filter((item): item is number => typeof item === 'number')
    : [];
}

function toCatalogItem(
  resource: CatalogResource,
): PublicModelCatalogItem | null {
  const attributes = resource.attributes;

  if (
    !attributes ||
    typeof resource.id !== 'string' ||
    typeof attributes.category !== 'string' ||
    typeof attributes.key !== 'string' ||
    typeof attributes.label !== 'string' ||
    typeof attributes.provider !== 'string'
  ) {
    return null;
  }

  return {
    aspectRatios: stringArray(attributes.aspectRatios),
    capabilities: stringArray(attributes.capabilities),
    category: attributes.category,
    ...(typeof attributes.costTier === 'string'
      ? { costTier: attributes.costTier }
      : {}),
    ...(typeof attributes.defaultAspectRatio === 'string'
      ? { defaultAspectRatio: attributes.defaultAspectRatio }
      : {}),
    ...(typeof attributes.defaultDuration === 'number'
      ? { defaultDuration: attributes.defaultDuration }
      : {}),
    ...(typeof attributes.description === 'string'
      ? { description: attributes.description }
      : {}),
    durations: numberArray(attributes.durations),
    id: resource.id,
    isDefault: attributes.isDefault === true,
    isHighlighted: attributes.isHighlighted === true,
    key: attributes.key,
    label: attributes.label,
    ...(typeof attributes.maxOutputs === 'number'
      ? { maxOutputs: attributes.maxOutputs }
      : {}),
    provider: attributes.provider,
    ...(typeof attributes.qualityTier === 'string'
      ? { qualityTier: attributes.qualityTier }
      : {}),
    recommendedFor: stringArray(attributes.recommendedFor),
    ...(typeof attributes.speedTier === 'string'
      ? { speedTier: attributes.speedTier }
      : {}),
    supportsFeatures: stringArray(attributes.supportsFeatures),
  };
}

export const getPublicModels = cache(
  async (): Promise<PublicModelCatalogItem[] | null> => {
    const models = new Map<string, PublicModelCatalogItem>();

    try {
      for (let page = 1; page <= MAX_CATALOG_PAGES; page += 1) {
        const response = await fetch(
          `${EnvironmentService.apiEndpoint}/public/models?limit=${CATALOG_PAGE_SIZE}&page=${page}`,
          { next: { revalidate: 3600 } },
        );

        if (!response.ok) {
          return null;
        }

        const payload = (await response.json()) as CatalogResponse;
        const resources = payload.data;

        if (!Array.isArray(resources)) {
          return null;
        }

        for (const resource of resources) {
          const model = toCatalogItem(resource);
          if (model) {
            models.set(model.id, model);
          }
        }

        const totalPages = payload.links?.pagination?.pages;
        if (
          resources.length < CATALOG_PAGE_SIZE ||
          (typeof totalPages === 'number' && page >= totalPages)
        ) {
          break;
        }
      }

      return [...models.values()];
    } catch {
      return null;
    }
  },
);
