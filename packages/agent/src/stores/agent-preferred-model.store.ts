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

type AgentPreferredModelState = {
  chatModel: string | null;
  chatPriority: RouterPriority | null;
  generationModel: string | null;
  generationOutputs: number | null;
  generationPriority: RouterPriority | null;
  setChatModel: (modelKey: string) => void;
  setChatPriority: (priority: RouterPriority) => void;
  setGenerationModel: (modelKey: string) => void;
  setGenerationOutputs: (outputs: number) => void;
  setGenerationPriority: (priority: RouterPriority) => void;
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

export const useAgentPreferredModelStore = create<AgentPreferredModelState>(
  (set) => ({
    chatModel: readStoredString(CHAT_MODEL_KEY),
    chatPriority: readStoredPriority(CHAT_PRIORITY_KEY),
    generationModel: readStoredString(GENERATION_MODEL_KEY),
    generationOutputs: readStoredOutputs(),
    generationPriority: readStoredPriority(GENERATION_PRIORITY_KEY),
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
    setGenerationModel: (modelKey) => {
      const trimmed = modelKey.trim();
      if (!trimmed) {
        return;
      }
      writeStoredString(GENERATION_MODEL_KEY, trimmed);
      set({ generationModel: trimmed });
    },
    setGenerationOutputs: (outputs) => {
      const next =
        Number.isFinite(outputs) && outputs >= 1
          ? Math.min(8, Math.round(outputs))
          : 1;
      writeStoredString(GENERATION_OUTPUTS_KEY, String(next));
      set({ generationOutputs: next });
    },
    setGenerationPriority: (priority) => {
      writeStoredString(GENERATION_PRIORITY_KEY, priority);
      set({ generationPriority: priority });
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

export function readPreferredGenerationModel(): string | null {
  return useAgentPreferredModelStore.getState().generationModel;
}

export function writePreferredGenerationModel(modelKey: string): void {
  useAgentPreferredModelStore.getState().setGenerationModel(modelKey);
}

export function readPreferredGenerationPriority(): RouterPriority | null {
  return useAgentPreferredModelStore.getState().generationPriority;
}

export function writePreferredGenerationPriority(
  priority: RouterPriority,
): void {
  useAgentPreferredModelStore.getState().setGenerationPriority(priority);
}

export function readPreferredGenerationOutputs(): number | null {
  return useAgentPreferredModelStore.getState().generationOutputs;
}

export function writePreferredGenerationOutputs(outputs: number): void {
  useAgentPreferredModelStore.getState().setGenerationOutputs(outputs);
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
  useAgentPreferredModelStore.setState({
    generationModel: null,
    generationOutputs: null,
    generationPriority: null,
  });
}
