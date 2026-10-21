/** The brand's logo asset; the media response projection signs `cdnUrl`. */
export interface AgentBrandLogo {
  category: 'LOGO';
  cdnUrl: string;
  id: string;
}

export interface AgentBrandSerializedData {
  id: string;
  slug: string;
  name: string;
  label: string;
  description: string;
  text: string;
  isActive: boolean;
  /** Present only when the caller asked for logos and the brand has one. */
  logo?: AgentBrandLogo;
}

function serializeLogo(value: unknown): AgentBrandLogo | undefined {
  if (value === null || typeof value !== 'object') return undefined;
  const { cdnUrl, id } = value as Record<string, unknown>;
  return typeof cdnUrl === 'string' && cdnUrl && typeof id === 'string' && id
    ? { category: 'LOGO', cdnUrl, id }
    : undefined;
}

export function serializeAgentBrand(
  doc: Record<string, unknown>,
): AgentBrandSerializedData {
  const label = String(doc.label || doc.name || '');
  const logo = serializeLogo(doc.logo);

  return {
    description: String(doc.description || ''),
    id: String(doc.id || ''),
    isActive: Boolean(doc.isActive),
    label,
    ...(logo ? { logo } : {}),
    name: String(doc.name || label),
    slug: String(doc.slug || ''),
    text: String(doc.text || ''),
  };
}

export function serializeAgentBrands(
  docs: Record<string, unknown>[],
): AgentBrandSerializedData[] {
  return docs.map((doc) => serializeAgentBrand(doc));
}
