import type { AgentUiAction } from '@genfeedai/agent/models/agent-chat.model';

const ANALYTICS_SNAPSHOT_ID_PREFIX = 'analytics-snapshot:';

/**
 * Read the period segment out of an `analytics-snapshot:<scope>:<period>` id.
 *
 * Scanned with `indexOf` rather than `/analytics-snapshot:[^:]+:(.+)$/`, whose
 * `$`-anchored greedy `.+` backtracks quadratically on a long id that never
 * satisfies the anchor.
 */
function periodFromId(id: string): string | undefined {
  if (!id.startsWith(ANALYTICS_SNAPSHOT_ID_PREFIX)) {
    return undefined;
  }
  const rest = id.slice(ANALYTICS_SNAPSHOT_ID_PREFIX.length);
  const separator = rest.indexOf(':');
  if (separator < 0) {
    return undefined;
  }
  return rest.slice(separator + 1) || undefined;
}

/**
 * Read the trailing parenthesised period out of a title such as
 * `Analytics snapshot (30d)`.
 *
 * `trimEnd()` + `lastIndexOf` replaces `/\(([^)]+)\)\s*$/`, whose trailing
 * `\s*$` backtracks quadratically on a whitespace-padded title. The
 * `includes(')')` guard preserves the old `[^)]+` semantics: a title like
 * `a (b) c)` matched nothing before and must keep matching nothing.
 */
function periodFromTitle(title: string): string | undefined {
  const trimmed = title.trimEnd();
  if (!trimmed.endsWith(')')) {
    return undefined;
  }
  const open = trimmed.lastIndexOf('(');
  if (open < 0) {
    return undefined;
  }
  const inner = trimmed.slice(open + 1, -1);
  if (!inner || inner.includes(')')) {
    return undefined;
  }
  return inner;
}

/**
 * Resolve the analytics period an action describes, preferring explicit
 * `data.period`, then the action id, then a parenthesised title suffix.
 */
export function extractAnalyticsPeriod(action: AgentUiAction): string {
  const dataPeriod = action.data?.period;
  if (typeof dataPeriod === 'string' && dataPeriod.trim()) {
    return dataPeriod.trim();
  }
  return (
    (action.id ? periodFromId(action.id) : undefined) ??
    (action.title ? periodFromTitle(action.title) : undefined) ??
    'summary'
  );
}
