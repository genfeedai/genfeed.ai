import type {
  ICreatePrompt,
  IPrompt,
  IQueryPrompts,
  ModelCapability,
  ProviderModel,
} from '@genfeedai/types';
import type { ComponentType } from 'react';
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
  /**
   * Provider auth headers (Replicate / Fal / HuggingFace BYOK keys) attached to
   * execute requests. Returns no headers when omitted.
   */
  executionHeaders?: ExecutionHeaderProvider;
  /**
   * Persistence backend for the workflow store's CRUD actions (save / load /
   * list / delete / duplicate / create). Throws a clear "not configured" error
   * when omitted rather than silently dropping saves.
   */
  workflowPersistence?: WorkflowPersistenceService;
  /**
   * Graph edit-operation applier used by the chat/agent edit pipeline. Defaults
   * to a no-op (leaves the graph untouched) when omitted.
   */
  applyEditOperations?: ApplyEditOperations;
  /** Injected ModelBrowserModal component (complex, app-specific) */
  ModelBrowserModal?: ComponentType<ModelBrowserModalProps> | null;
  /** Injected PromptPicker component (complex, app-specific) */
  PromptPicker?: ComponentType<PromptPickerProps> | null;
}
