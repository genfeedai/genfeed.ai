import type { IBaseEntity } from '../core/base.interface';

export type HarnessProfileScope = 'brand' | 'channel' | 'company' | 'founder';
export type HarnessProfileStatus = 'active' | 'draft';

export interface IHarnessProfileThesis {
  beliefs?: string[];
  enemies?: string[];
  offers?: string[];
  proofPoints?: string[];
}

export interface IHarnessProfileVoice {
  tone?: string;
  style?: string;
  stance?: string;
  aggression?: string;
  sarcasm?: string;
  vocabulary?: string[];
  bannedPhrases?: string[];
}

export interface IHarnessProfileStructure {
  shortFormSkeleton?: string[];
  longFormSkeleton?: string[];
  lineRules?: string[];
  transitions?: string[];
  endings?: string[];
}

export interface IHarnessProfileExamples {
  good?: string[];
  avoid?: string[];
}

export interface IHarnessProfile extends IBaseEntity {
  _id?: string;
  organization?: string;
  organizationId?: string;
  createdBy?: string;
  createdById?: string;
  brandId?: string;
  profileType: 'harness';
  label: string;
  description?: string;
  scope: HarnessProfileScope;
  status: HarnessProfileStatus;
  isDefault: boolean;
  platforms: string[];
  handles: Record<string, string>;
  audience: string[];
  thesis: IHarnessProfileThesis;
  voice: IHarnessProfileVoice;
  structure: IHarnessProfileStructure;
  examples: IHarnessProfileExamples;
  guardrails: string[];
  metadata?: Record<string, unknown>;
}
