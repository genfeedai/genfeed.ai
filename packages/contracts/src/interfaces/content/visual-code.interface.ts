import type { VisualCodeStatus } from '@genfeedai/contracts/enums/visual-code.enum';
import type { IBaseEntity } from '@genfeedai/contracts/interfaces/core/base.interface';

export type VisualCodeJson =
  | null
  | boolean
  | number
  | string
  | VisualCodeJson[]
  | { [key: string]: VisualCodeJson };
export interface IVisualCodeSettings {
  width: number;
  height: number;
  fps: 24 | 30;
  durationFrames: number;
}
export interface IVisualCodeOutputRequest {
  format: 'mp4' | 'png' | 'jpeg';
  frame?: number;
}
export interface ICreateVisualProject {
  brandId: string;
  requestId: string;
  label: string;
  prompt?: string;
  sourceCode?: string;
  modelKey?: string;
  settings: IVisualCodeSettings;
  props?: Record<string, VisualCodeJson>;
  sourceAssetIds?: string[];
  outputs?: IVisualCodeOutputRequest[];
  maximumCredits: number;
}
export interface IReviseVisualProject {
  requestId: string;
  expectedRevision: number;
  prompt?: string;
  sourceCode?: string;
  props?: Record<string, VisualCodeJson>;
  maximumCredits: number;
}
export interface IExportVisualProject {
  expectedRevision: number;
  requestId: string;
  revision: number;
  outputs?: IVisualCodeOutputRequest[];
  maximumCredits: number;
}
export interface IVisualCodeReceipt {
  state: 'started' | 'confirmed' | 'indeterminate';
  boundCredits: number;
  isResultApplied: boolean;
  isAccepted?: boolean;

  id: string;
  kind:
    | 'authoring'
    | 'inspection'
    | 'repair'
    | 'render'
    | 'quote'
    | 'settlement'
    | 'admission';
  quote?: IVisualCodeQuoteSnapshot;
  credits: number;
  operatorCredits: number;
  modelKey?: string;
  sourceHash?: string;
  providerCost?: number;
  isByok?: boolean;
  computeSeconds?: number;
}
export interface IVisualCodeMedia {
  url: string;
  format: 'mp4' | 'png' | 'jpeg';
  width: number;
  height: number;
  frame?: number;
  ingredientId?: string;
}
export interface IVisualRevision {
  id: string;
  projectId: string;
  number: number;
  requestId: string;
  status: VisualCodeStatus;
  progress: number;
  modelKey: string | null;
  rendererVersion: string;
  sourceHash: string | null;
  hasSource: boolean;
  prompt: string | null;
  outputRequests: IVisualCodeOutputRequest[];
  settings: IVisualCodeSettings;
  props: Record<string, VisualCodeJson>;
  sourceAssetIds: string[];
  maximumCredits: number;
  consumedCredits: number;
  receipts: IVisualCodeReceipt[];
  previews: IVisualCodeMedia[];
  outputs: IVisualCodeMedia[];
  diagnostics: string[];
}
export interface IVisualProject extends IBaseEntity {
  organizationId: string;
  brandId: string;
  userId: string;
  label: string;
  currentRevision: number;
  revisions: IVisualRevision[];
  nextRevisionCursor: number | null;
}

export interface IRetryVisualProject {
  requestId: string;
  revision: number;
  expectedRevision: number;
  maximumCredits: number;
}
export interface ICancelVisualProject {
  revision: number;
}
export type VisualCodeQuoteRequest =
  | { operation: 'create'; input: Omit<ICreateVisualProject, 'maximumCredits'> }
  | {
      operation: 'revise';
      projectId: string;
      input: Omit<IReviseVisualProject, 'maximumCredits'>;
    }
  | {
      operation: 'export';
      projectId: string;
      input: Omit<IExportVisualProject, 'maximumCredits'>;
    }
  | {
      operation: 'retry';
      projectId: string;
      input: Omit<IRetryVisualProject, 'maximumCredits'>;
    };
export interface IVisualCodeQuote {
  unit: 'credits';
  modelKey: string;
  isByok: boolean;
  authoringCredits: number;
  inspectionCredits: number;
  renderCredits: number;
  maximumCredits: number;
  maximumAuthoringCalls: number;
  maximumInspectionCalls: number;
  maximumRepairs: number;
  maximumRenderJobs: number;
  renderDeadlineSeconds: number;
  rendererVersion: string;
  creditsPerSecond: number;
  settings: IVisualCodeSettings;
  outputRequests: IVisualCodeOutputRequest[];
}
export interface IVisualCodeQuoteSnapshot extends IVisualCodeQuote {
  provider: string;
  inputCostPerMillion: number;
  outputCostPerMillion: number;
}
export interface IVisualCodeCatalogModel {
  inspectionCapability: 'declared' | 'unknown';

  key: string;
  label: string;
  provider: string;
  isDefault: boolean;
  isByok: boolean;
  isAvailable: boolean;
  unavailableReason: string | null;
  inputCostPerMillion: number | null;
  outputCostPerMillion: number | null;
}
export interface IVisualCodeCatalog {
  isAvailable: boolean;
  unavailableReason: string | null;
  rendererVersion: string;
  creditsPerSecond: number | null;
  defaultModelKey: string | null;
  models: IVisualCodeCatalogModel[];
  limits: {
    maxSourceBytes: number;
    maxPromptBytes: number;
    maxPropsBytes: number;
    maxAssets: number;
    maxOutputs: number;
    maxWidth: number;
    maxHeight: number;
    maxPixels: number;
    maxDurationFrames: number;
    maxDurationSeconds: number;
    allowedFps: number[];
    maxRepairs: number;
    renderDeadlineSeconds: number;
  };
  outputFormats: ('mp4' | 'png' | 'jpeg')[];
  defaultSettings: IVisualCodeSettings;
}
export interface IVisualSandboxAsset {
  id: string;
  mime: string;
  bytes: string;
}
export interface IVisualSandboxMedia {
  format: 'mp4' | 'png' | 'jpeg';
  width: number;
  height: number;
  frame?: number;
  bytes: string;
}
export interface IVisualSandboxInput {
  id: string;
  sourceCode: string;
  settings: IVisualCodeSettings;
  props: Record<string, VisualCodeJson>;
  assets: IVisualSandboxAsset[];
  outputs: IVisualCodeOutputRequest[];
  mode: 'preview' | 'export';
}
export interface IVisualSandboxReceipt {
  id: string;
  inputHash: string;
  sourceHash: string;
  status: 'running' | 'completed' | 'failed' | 'cancelled';
  startedAt: number;
  finishedAt?: number;
  computeSeconds: number;
  diagnostic?: string;
  isComputeIndeterminate?: boolean;
}
export interface IVisualSandboxResult {
  rendererVersion: string;
  media: IVisualSandboxMedia[];
  diagnostics: string[];
}
export interface IVisualSandboxExecution {
  receipt: IVisualSandboxReceipt;
  result: IVisualSandboxResult | null;
}
