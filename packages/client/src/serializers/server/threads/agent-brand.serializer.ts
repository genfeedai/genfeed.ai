export interface AgentBrandSerializedData {
  id: string;
  handle: string;
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
    handle: String(doc.handle || ''),
    id: String(doc._id || doc.id || ''),
    isActive: Boolean(doc.isActive),
    label,
    name: String(doc.name || label),
    text: String(doc.text || ''),
  };
}

export function serializeAgentBrands(
  docs: Record<string, unknown>[],
): AgentBrandSerializedData[] {
  return docs.map((doc) => serializeAgentBrand(doc));
}
