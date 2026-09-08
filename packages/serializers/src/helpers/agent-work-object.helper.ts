import type { AgentWorkObjectMaterial } from '@genfeedai/contracts/interfaces';

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

/** Expose canonical work content without provider, session or review credentials. */
export function serializeAgentWorkObject(
  ingredient: Record<string, unknown>,
): AgentWorkObjectMaterial | undefined {
  const work = record(
    record(ingredient.providerData).agentWorkObject ??
      ingredient.agentWorkObject,
  );
  if (
    !['table', 'script', 'brief'].includes(String(work.kind)) ||
    typeof work.title !== 'string'
  )
    return undefined;
  const columns = Array.isArray(work.columns)
    ? work.columns.flatMap((value) => {
        const column = record(value);
        return typeof column.key === 'string' &&
          typeof column.label === 'string'
          ? [{ key: column.key, label: column.label }]
          : [];
      })
    : undefined;
  const keys = new Set(columns?.map((column) => column.key) ?? []);
  const rows = Array.isArray(work.rows)
    ? (work.rows.map((value) =>
        Object.fromEntries(
          Object.entries(record(value)).filter(
            ([key, cell]) => keys.has(key) && typeof cell === 'string',
          ),
        ),
      ) as Record<string, string>[])
    : undefined;
  return {
    kind: work.kind as AgentWorkObjectMaterial['kind'],
    title: work.title,
    ...(typeof work.body === 'string' ? { body: work.body } : {}),
    ...(columns ? { columns } : {}),
    ...(rows ? { rows } : {}),
  };
}
