/**
 * Durable agent model prefs. The chat store is Zustand in-memory and dies
 * on refresh; this store is Zustand + localStorage so composer and the
 * generation card keep their picks.
 *
 * Chat and generation are separate keys. Writing an image model into the
 * chat pref made the composer remount as "Select models…".
 */
import { type RouterPriority, toRouterPriority } from '@genfeedai/enums';
import { create } from 'zustand';

const CHAT_MODEL_KEY = 'genfeed:agent-preferred-chat-model:v1';
const CHAT_PRIORITY_KEY = 'genfeed:agent-preferred-chat-priority:v1';
const GENERATION_MODEL_KEY = 'genfeed:agent-preferred-generation-model:v1';
const GENERATION_PRIORITY_KEY =
  'genfeed:agent-preferred-generation-priority:v1';
const GENERATION_OUTPUTS_KEY = 'genfeed:agent-preferred-generation-outputs:v1';
const GENERATION_BY_SCOPE_KEY =
  'genfeed:agent-preferred-generation-by-scope:v1';
const NEW_THREAD_SCOPE = '__new__';

export type GenerationPrefKind = 'image' | 'video';

export type GenerationPrefScope = {
  generationType?: GenerationPrefKind;
  threadId?: string | null;
};

type GenerationScopePrefs = {
  model: string | null;
  outputs: number | null;
  priority: RouterPriority | null;
};

type GenerationScopeMap = Record<string, GenerationScopePrefs>;

type AgentPreferredModelState = {
  chatModel: string | null;
  chatPriority: RouterPriority | null;
  generationByScope: GenerationScopeMap;
  setChatModel: (modelKey: string) => void;
  setChatPriority: (priority: RouterPriority) => void;
  setGenerationModel: (modelKey: string, scope?: GenerationPrefScope) => void;
  setGenerationOutputs: (outputs: number, scope?: GenerationPrefScope) => void;
  setGenerationPriority: (
    priority: RouterPriority,
    scope?: GenerationPrefScope,
  ) => void;
};

function getStorage(): Storage | null {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function readStoredString(key: string): string | null {
  const storage = getStorage();
  if (!storage) {
    return null;
  }

  try {
    const value = storage.getItem(key)?.trim();
    return value ? value : null;
  } catch {
    return null;
  }
}

function writeStoredString(key: string, value: string): void {
  const storage = getStorage();
  if (!storage) {
    return;
  }

  try {
    storage.setItem(key, value);
  } catch {
    // Quota / private mode — preference is best-effort.
  }
}

function removeStored(key: string): void {
  const storage = getStorage();
  if (!storage) {
    return;
  }

  try {
    storage.removeItem(key);
  } catch {
    // ignore
  }
}

function readStoredPriority(key: string): RouterPriority | null {
  return toRouterPriority(readStoredString(key)) ?? null;
}

function readStoredOutputs(): number | null {
  const raw = readStoredString(GENERATION_OUTPUTS_KEY);
  if (!raw) {
    return null;
  }

  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 1) {
    return null;
  }

  return Math.min(8, Math.round(parsed));
}

function resolveGenerationScopeKey(scope?: GenerationPrefScope): string {
  const thread = scope?.threadId?.trim() || NEW_THREAD_SCOPE;
  const generationType = scope?.generationType ?? 'image';
  return `${thread}:${generationType}`;
}

function emptyGenerationPrefs(): GenerationScopePrefs {
  return {
    model: null,
    outputs: null,
    priority: null,
  };
}

function readGenerationScopeMap(): GenerationScopeMap {
  const storage = getStorage();
  if (!storage) {
    return {};
  }

  try {
    const raw = storage.getItem(GENERATION_BY_SCOPE_KEY)?.trim();
    if (!raw) {
      return {};
    }

    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return {};
    }

    const next: GenerationScopeMap = {};
    for (const [key, value] of Object.entries(parsed)) {
      if (!value || typeof value !== 'object' || Array.isArray(value)) {
        continue;
      }

      const record = value as Record<string, unknown>;
      const outputs =
        typeof record.outputs === 'number' &&
        Number.isFinite(record.outputs) &&
        record.outputs >= 1
          ? Math.min(8, Math.round(record.outputs))
          : null;
      next[key] = {
        model:
          typeof record.model === 'string' && record.model.trim()
            ? record.model.trim()
            : null,
        outputs,
        priority:
          typeof record.priority === 'string'
            ? (toRouterPriority(record.priority) ?? null)
            : null,
      };
    }

    return next;
  } catch {
    return {};
  }
}

function writeGenerationScopeMap(map: GenerationScopeMap): void {
  const storage = getStorage();
  if (!storage) {
    return;
  }

  try {
    storage.setItem(GENERATION_BY_SCOPE_KEY, JSON.stringify(map));
  } catch {
    // Quota / private mode — preference is best-effort.
  }
}

function readLegacyUnthreadedImagePrefs(): GenerationScopePrefs {
  return {
    model: readStoredString(GENERATION_MODEL_KEY),
    outputs: readStoredOutputs(),
    priority: readStoredPriority(GENERATION_PRIORITY_KEY),
  };
}

function readScopePrefs(scope?: GenerationPrefScope): GenerationScopePrefs {
  const key = resolveGenerationScopeKey(scope);
  const scoped = useAgentPreferredModelStore.getState().generationByScope[key];
  if (scoped) {
    return scoped;
  }

  if (key === `${NEW_THREAD_SCOPE}:image`) {
    return readLegacyUnthreadedImagePrefs();
  }

  return emptyGenerationPrefs();
}

function patchScopePrefs(
  scope: GenerationPrefScope | undefined,
  patch: Partial<GenerationScopePrefs>,
): GenerationScopeMap {
  const key = resolveGenerationScopeKey(scope);
  const current = {
    ...emptyGenerationPrefs(),
    ...useAgentPreferredModelStore.getState().generationByScope[key],
  };
  const nextPrefs: GenerationScopePrefs = {
    ...current,
    ...patch,
  };
  const nextMap = {
    ...useAgentPreferredModelStore.getState().generationByScope,
    [key]: nextPrefs,
  };
  writeGenerationScopeMap(nextMap);
  return nextMap;
}

export const useAgentPreferredModelStore = create<AgentPreferredModelState>(
  (set) => ({
    chatModel: readStoredString(CHAT_MODEL_KEY),
    chatPriority: readStoredPriority(CHAT_PRIORITY_KEY),
    generationByScope: readGenerationScopeMap(),
    setChatModel: (modelKey) => {
      const trimmed = modelKey.trim();
      if (!trimmed) {
        return;
      }
      writeStoredString(CHAT_MODEL_KEY, trimmed);
      set({ chatModel: trimmed });
    },
    setChatPriority: (priority) => {
      writeStoredString(CHAT_PRIORITY_KEY, priority);
      set({ chatPriority: priority });
    },
    setGenerationModel: (modelKey, scope) => {
      const trimmed = modelKey.trim();
      if (!trimmed) {
        return;
      }
      set({ generationByScope: patchScopePrefs(scope, { model: trimmed }) });
    },
    setGenerationOutputs: (outputs, scope) => {
      const next =
        Number.isFinite(outputs) && outputs >= 1
          ? Math.min(8, Math.round(outputs))
          : 1;
      set({ generationByScope: patchScopePrefs(scope, { outputs: next }) });
    },
    setGenerationPriority: (priority, scope) => {
      set({ generationByScope: patchScopePrefs(scope, { priority }) });
    },
  }),
);

export function readPreferredAgentChatModel(): string | null {
  return useAgentPreferredModelStore.getState().chatModel;
}

export function writePreferredAgentChatModel(modelKey: string): void {
  useAgentPreferredModelStore.getState().setChatModel(modelKey);
}

export function readPreferredAgentChatPriority(): RouterPriority | null {
  return useAgentPreferredModelStore.getState().chatPriority;
}

export function writePreferredAgentChatPriority(
  priority: RouterPriority,
): void {
  useAgentPreferredModelStore.getState().setChatPriority(priority);
}

export function readPreferredGenerationModel(
  scope?: GenerationPrefScope,
): string | null {
  return readScopePrefs(scope).model;
}

export function writePreferredGenerationModel(
  modelKey: string,
  scope?: GenerationPrefScope,
): void {
  useAgentPreferredModelStore.getState().setGenerationModel(modelKey, scope);
}

export function readPreferredGenerationPriority(
  scope?: GenerationPrefScope,
): RouterPriority | null {
  return readScopePrefs(scope).priority;
}

export function writePreferredGenerationPriority(
  priority: RouterPriority,
  scope?: GenerationPrefScope,
): void {
  useAgentPreferredModelStore.getState().setGenerationPriority(priority, scope);
}

export function readPreferredGenerationOutputs(
  scope?: GenerationPrefScope,
): number | null {
  return readScopePrefs(scope).outputs;
}

export function writePreferredGenerationOutputs(
  outputs: number,
  scope?: GenerationPrefScope,
): void {
  useAgentPreferredModelStore.getState().setGenerationOutputs(outputs, scope);
}

/**
 * `/agent/new` writes prefs under `__new__`. When the URL catches up to the
 * created thread, copy those same-type prefs once so the first pick survives.
 */
export function adoptNewThreadGenerationPrefs(threadId: string): void {
  const trimmed = threadId.trim();
  if (!trimmed) {
    return;
  }

  const map = {
    ...useAgentPreferredModelStore.getState().generationByScope,
  };
  let didChange = false;

  for (const generationType of ['image', 'video'] as const) {
    const source = map[`${NEW_THREAD_SCOPE}:${generationType}`];
    const destinationKey = `${trimmed}:${generationType}`;
    if (!source || map[destinationKey]) {
      continue;
    }
    map[destinationKey] = { ...source };
    didChange = true;
  }

  if (!didChange) {
    return;
  }

  writeGenerationScopeMap(map);
  useAgentPreferredModelStore.setState({ generationByScope: map });
}

export function clearPreferredAgentChatModel(): void {
  removeStored(CHAT_MODEL_KEY);
  removeStored(CHAT_PRIORITY_KEY);
  useAgentPreferredModelStore.setState({
    chatModel: null,
    chatPriority: null,
  });
}

export function clearPreferredGenerationPrefs(): void {
  removeStored(GENERATION_MODEL_KEY);
  removeStored(GENERATION_PRIORITY_KEY);
  removeStored(GENERATION_OUTPUTS_KEY);
  removeStored(GENERATION_BY_SCOPE_KEY);
  useAgentPreferredModelStore.setState({
    generationByScope: {},
  });
}
