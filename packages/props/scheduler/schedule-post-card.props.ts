import type { AgentUiAction } from '@genfeedai/contracts/interfaces';

export interface SchedulePostCardTarget {
  credentialId?: string;
  platform: string;
  scheduledDate?: string;
}

export interface SchedulePostCardPayload {
  platforms: string[];
  scheduledAt: string;
  signatureId?: string;
  targets?: SchedulePostCardTarget[];
  timezone: string;
}

export interface SchedulePostCardProps {
  action: AgentUiAction;
  onSchedule?: (payload: SchedulePostCardPayload) => void;
}

export interface SchedulePostCardCredential {
  id: string;
  isConnected?: boolean;
  label?: string | null;
  platform: string;
}

export interface SchedulePostCardSignatureOption {
  id: string;
  label: string;
}
