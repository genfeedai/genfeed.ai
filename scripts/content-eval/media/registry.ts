import type { RegistryMediaModel } from './contestants';
import type { Medium } from './contracts';

/**
 * Reads the model registry (`ModelsService`, categories image/video) through
 * the product API with the eval organization's key, so the ladder ranks what
 * that organization can actually select.
 */

const PAGE_SIZE = 100;
const MAX_PAGES = 20;

interface JsonApiCollection {
  data?: Array<{ attributes?: Record<string, unknown> }>;
}

function toModel(
  attributes: Record<string, unknown> | undefined,
): RegistryMediaModel | null {
  if (!attributes) return null;
  const { key, label, cost, isActive, isLegacy } = attributes;
  if (typeof key !== 'string' || key.length === 0) return null;
  return {
    cost: typeof cost === 'number' && cost >= 0 ? cost : 0,
    isActive: isActive === true,
    isLegacy: isLegacy === true,
    key,
    label: typeof label === 'string' && label.length > 0 ? label : key,
  };
}

export async function fetchRegistryMediaModels(input: {
  apiUrl: string;
  apiKey: string;
  medium: Medium;
  fetchImpl?: typeof fetch;
}): Promise<RegistryMediaModel[]> {
  const fetchImpl = input.fetchImpl ?? fetch;
  const base = input.apiUrl.replace(/\/+$/, '');
  const models: RegistryMediaModel[] = [];
  for (let page = 1; page <= MAX_PAGES; page += 1) {
    const url = `${base}/models?category=${input.medium}&isActive=true&limit=${PAGE_SIZE}&page=${page}`;
    const response = await fetchImpl(url, {
      headers: { Authorization: `Bearer ${input.apiKey}` },
      method: 'GET',
    });
    if (!response.ok) {
      throw new Error(`Model registry read failed: HTTP ${response.status}`);
    }
    const payload = (await response.json()) as JsonApiCollection;
    const batch = (payload.data ?? []).flatMap((resource) => {
      const model = toModel(resource.attributes);
      return model ? [model] : [];
    });
    models.push(...batch);
    if ((payload.data ?? []).length < PAGE_SIZE) break;
  }
  return models;
}
