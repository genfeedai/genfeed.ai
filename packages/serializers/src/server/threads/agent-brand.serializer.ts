export interface AgentBrandSerializedData {
  id: string;
  slug: string;
  name: string;
  label: string;
  description: string;
  text: string;
  isActive: boolean;
}

export function serializeAgentBrand(
  doc: Record<string, unknown>,
): AgentBrandSerializedData {
  const label = String(doc.label || doc.name || '');

  return {
    description: String(doc.description || ''),
    id: String(doc._id || doc.id || ''),
    isActive: Boolean(doc.isActive),
    label,
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
