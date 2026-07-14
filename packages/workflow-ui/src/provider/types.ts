import type {
  EdgeStyle,
  ICreatePrompt,
  IPrompt,
  IQueryPrompts,
  ModelCapability,
  ProviderModel,
} from '@genfeedai/types';
import type { ComponentType } from 'react';
import type {
  DefaultModelSettings,
  RecentModel,
} from '../stores/settingsStore';
import type { ApplyEditOperations } from '../stores/workflow/slices/types';
import type { WorkflowPersistenceService } from '../stores/workflow/types';

// =============================================================================
// File Upload
// =============================================================================

export interface FileUploadService {
  uploadFile: (
    path: string,
    file: File,
  ) => Promise<{ url: string; filename: string }>;
}

// =============================================================================
// Model Schema
// =============================================================================

export interface ModelSchemaService {
  fetchModelSchema: (
    modelId: string,
    signal?: AbortSignal,
  ) => Promise<ProviderModel | null>;
}

// =============================================================================
// Prompt Library
// =============================================================================

export interface PromptLibraryService {
  getAll: (query?: IQueryPrompts, signal?: AbortSignal) => Promise<IPrompt[]>;
  getFeatured: (limit?: number, signal?: AbortSignal) => Promise<IPrompt[]>;
  create: (data: ICreatePrompt, signal?: AbortSignal) => Promise<IPrompt>;
  update: (
    id: string,
    data: Partial<ICreatePrompt>,
    signal?: AbortSignal,
  ) => Promise<IPrompt>;
  delete: (id: string, signal?: AbortSignal) => Promise<void>;
  duplicate: (id: string, signal?: AbortSignal) => Promise<IPrompt>;
  use: (id: string, signal?: AbortSignal) => Promise<IPrompt>;
}

// =============================================================================
// Injected Components
// =============================================================================

export interface ModelBrowserModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (model: ProviderModel) => void;
  capabilities?: ModelCapability[];
  title?: string;
}

export interface PromptPickerProps {
  onSelect: (item: IPrompt) => void;
  label?: string;
}

// =============================================================================
// Workflows API
// =============================================================================

export interface WorkflowsApiService {
  setThumbnail: (
    workflowId: string,
    thumbnailUrl: string,
    nodeId: string,
    signal?: AbortSignal,
  ) => Promise<void>;
}

// =============================================================================
// Logger
// =============================================================================

/**
 * Minimal logger the execution store reports failures through (SSE connection
 * drops, message-parse failures, failed executions, save-before-run errors).
 * The consuming app injects a real observability-backed logger; when absent the
 * package no-ops (matching its standalone default).
 */
export interface WorkflowUILogger {
  error: (message: string, meta?: Record<string, unknown>) => void;
}

// =============================================================================
// Execution HTTP
// =============================================================================

/**
 * HTTP client the execution store issues its POST requests through
 * (workflow execute, execution stop). The consuming app injects a credentialed
 * client — one that resolves the correct API base URL and carries auth cookies —
 * so runs are attributed to the signed-in user. When absent the package falls
 * back to a bare `fetch` against `NEXT_PUBLIC_API_URL` (its standalone default).
 */
export interface WorkflowUIHttpClient {
  post: <T>(
    path: string,
    body?: Record<string, unknown>,
    options?: { headers?: Record<string, string> },
  ) => Promise<T>;
}

/**
 * Supplies the per-request provider auth headers (Replicate / Fal / HuggingFace
 * BYOK keys) attached to workflow-execute requests. Returns an empty record when
 * the user has not configured BYOK keys. Defaults to no headers so the package
 * stays provider-agnostic standalone.
 */
export type ExecutionHeaderProvider = () => Record<string, string>;

// =============================================================================
// Settings Sync
// =============================================================================

/**
 * The subset of settings-store fields that round-trips to a server. BYOK
 * provider keys are intentionally excluded — they stay local to the device.
 */
export interface SyncableSettings {
  defaults: DefaultModelSettings;
  edgeStyle: EdgeStyle;
  showMinimap: boolean;
  hasSeenWelcome: boolean;
  recentModels: RecentModel[];
}

/**
 * Persists the settings store's syncable fields to the consuming app's backend.
 * The package store owns the merge (it holds the current state); the app-owned
 * adapter only maps between {@link SyncableSettings} and its server DTOs.
 *
 * `pull` returns a partial — omitted fields fall back to the local value, so a
 * server that has never stored a preference never clobbers a local one. When no
 * service is injected the store's `syncFromServer`/`syncToServer` are no-ops
 * (the package's standalone default), so settings stay device-local.
 */
export interface SettingsSyncService {
  pull: (signal?: AbortSignal) => Promise<Partial<SyncableSettings>>;
  push: (settings: SyncableSettings) => Promise<void>;
}

// =============================================================================
// Config
// =============================================================================

export interface WorkflowUIConfig {
  /** For ImageInputNode, VideoInputNode — file upload */
  fileUpload?: FileUploadService;
  /** For AI gen nodes — model schema loading */
  modelSchema?: ModelSchemaService;
  /** For PromptNode — prompt library CRUD */
  promptLibrary?: PromptLibraryService;
  /** For context menu — set workflow thumbnail */
  workflowsApi?: WorkflowsApiService;
  /** Execution-store error reporting (SSE failures, failed runs). No-op if omitted. */
  logger?: WorkflowUILogger;
  /**
   * HTTP client the execution store posts through (execute / stop). Defaults to a
   * bare `fetch` against `NEXT_PUBLIC_API_URL` when omitted; the app injects a
   * credentialed client so runs carry the signed-in user's session.
   */
  executionHttpClient?: WorkflowUIHttpClient;
  /** Base URL for execution REST reconciliation and SSE subscriptions. */
  executionApiBaseUrl?: string;
  /**
   * Provider auth headers (Replicate / Fal / HuggingFace BYOK keys) attached to
   * execute requests. Returns no headers when omitted.
   */
  executionHeaders?: ExecutionHeaderProvider;
  /** Injected ModelBrowserModal component (complex, app-specific) */
  ModelBrowserModal?: ComponentType<ModelBrowserModalProps> | null;
  /** Injected PromptPicker component (complex, app-specific) */
  PromptPicker?: ComponentType<PromptPickerProps> | null;
  /**
   * Persistence backend for workflow CRUD (create/update/getById/getAll/delete/
   * duplicate). Defaults to a throwing "not configured" stub so saves are never
   * silently dropped when the consuming app forgets to inject it.
   */
  workflowPersistence?: WorkflowPersistenceService;
  /**
   * Applies chat/agent-generated edit operations to the workflow graph. Defaults
   * to a no-op when omitted (matching the package's standalone behavior).
   */
  applyEditOperations?: ApplyEditOperations;
  /**
   * Server persistence for the settings store's syncable fields (node defaults,
   * edge style, minimap, welcome flag, recent models). The app injects an
   * adapter over its settings API; `syncFromServer`/`syncToServer` no-op when
   * omitted so the package stays device-local standalone.
   */
  settingsSync?: SettingsSyncService;
}
