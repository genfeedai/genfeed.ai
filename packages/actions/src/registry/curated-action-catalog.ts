import type { ToolMcpCardKind } from '../interfaces/tool-policy.interface';
import {
  CURATED_ACTION_CATALOG,
  type CuratedActionCatalogEntry,
  type CuratedActionSurface,
} from './curated-actions.catalog';

export {
  CURATED_ACTION_CATALOG,
  type CuratedActionCatalogEntry,
  type CuratedActionClass,
  type CuratedActionSurface,
  type CuratedAnnotationHint,
  type CuratedClaudeAccess,
} from './curated-actions.catalog';

export type CuratedActionName = (typeof CURATED_ACTION_CATALOG)[number]['name'];

const CURATED_ACTION_NAMES = new Set<string>(
  CURATED_ACTION_CATALOG.map((entry) => entry.name),
);

const CURATED_ACTIONS_BY_NAME: ReadonlyMap<string, CuratedActionCatalogEntry> =
  new Map(CURATED_ACTION_CATALOG.map((entry) => [entry.name, entry]));

/** The catalog entry for a tool name, or undefined for a name that is not curated. */
export function getCuratedAction(
  name: string,
): CuratedActionCatalogEntry | undefined {
  return CURATED_ACTIONS_BY_NAME.get(name);
}

/** Names of the entries that satisfy `predicate`, as a set for membership checks. */
export function curatedActionNames(
  predicate: (entry: CuratedActionCatalogEntry) => boolean,
): ReadonlySet<string> {
  return new Set(
    CURATED_ACTION_CATALOG.filter(predicate).map((entry) => entry.name),
  );
}

export function isCuratedActionName(value: string): value is CuratedActionName {
  return CURATED_ACTION_NAMES.has(value);
}

export function isActionOnSurface(
  entry: CuratedActionCatalogEntry,
  surface: CuratedActionSurface,
): boolean {
  return entry.surfaces.some((candidate) => candidate === surface);
}

export function isPublishingApprovalRequired(
  entry: CuratedActionCatalogEntry,
): boolean {
  return entry.isPublishingApprovalRequired === true;
}

/** The card the MCP app renders a tool's result as, or undefined when it has none. */
export function getMcpCardKind(name: string): ToolMcpCardKind | undefined {
  return CURATED_ACTIONS_BY_NAME.get(name)?.mcpCardKind;
}
