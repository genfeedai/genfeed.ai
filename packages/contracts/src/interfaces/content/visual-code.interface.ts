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
  requestId: string;
  revision: number;
  outputs: IVisualCodeOutputRequest[];
  maximumCredits: number;
}
export interface IVisualCodeReceipt {
  id: string;
  kind: 'authoring' | 'inspection' | 'repair' | 'render';
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
}
