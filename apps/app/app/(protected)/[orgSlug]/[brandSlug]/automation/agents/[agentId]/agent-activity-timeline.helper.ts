export type AgentActivityType = 'content' | 'report' | 'run';

export type AgentActivityFilter = 'all' | AgentActivityType;

export interface AgentActivityEntry {
  id: string;
  type: AgentActivityType;
  /** ISO timestamp; the merged feed sorts newest first on this field. */
  timestamp: string;
  title: string;
  description?: string;
  href?: string;
}

/**
 * One merged, chronologically sorted feed from every activity source
 * (content, reports, runs) — the record detail hierarchy's single timeline
 * (#5483, FR4). Newest first; entries with an unparsable timestamp sort last
 * rather than throwing.
 */
export function mergeAgentActivity(
  ...entryLists: AgentActivityEntry[][]
): AgentActivityEntry[] {
  return entryLists.flat().toSorted((a, b) => {
    const timeA = new Date(a.timestamp).getTime();
    const timeB = new Date(b.timestamp).getTime();
    const safeA = Number.isNaN(timeA) ? -Infinity : timeA;
    const safeB = Number.isNaN(timeB) ? -Infinity : timeB;
    return safeB - safeA;
  });
}

/** Narrows the merged feed to one activity type; `'all'` passes everything through. */
export function filterAgentActivity(
  entries: AgentActivityEntry[],
  filter: AgentActivityFilter,
): AgentActivityEntry[] {
  return filter === 'all'
    ? entries
    : entries.filter((entry) => entry.type === filter);
}
