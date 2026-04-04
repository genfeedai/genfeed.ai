import type {
  ICreatePrompt,
  IPrompt,
  IQueryPrompts,
  ModelCapability,
  ProviderModel,
} from '@genfeedai/types';
import type { ComponentType, ReactNode } from 'react';

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
  /** Injected ModelBrowserModal component (complex, app-specific) */
  ModelBrowserModal?: ComponentType<ModelBrowserModalProps> | null;
  /** Injected PromptPicker component (complex, app-specific) */
  PromptPicker?: ComponentType<PromptPickerProps> | null;
}
