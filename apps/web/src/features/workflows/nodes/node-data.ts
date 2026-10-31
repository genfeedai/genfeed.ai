export type NodeDataRecord = Record<string, unknown>;

export function isNodeDataRecord(data: unknown): data is NodeDataRecord {
  return typeof data === 'object' && data !== null;
}

export function coerceNodeData<T extends NodeDataRecord>(
  data: unknown,
  defaults: Partial<T>,
): T {
  return {
    ...defaults,
    ...(isNodeDataRecord(data) ? data : {}),
  } as T;
}
