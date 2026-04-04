import {
  RunActionType,
  RunAuthType,
  RunStatus,
  RunSurface,
  RunTrigger,
} from '@genfeedai/enums';

export interface IRunEvent {
  type: string;
  message?: string;
  payload?: Record<string, unknown>;
  source?: string;
  createdAt: Date;
}

export interface IRun {
  id: string;
  organization: string;
  user: string;
  actionType: RunActionType;
  surface: RunSurface;
  status: RunStatus;
  authType: RunAuthType;
  trigger: RunTrigger;
  idempotencyKey?: string;
  correlationId?: string;
  input?: Record<string, unknown>;
  output?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  error?: string;
  progress: number;
  startedAt?: Date;
  completedAt?: Date;
  durationMs?: number;
  events: IRunEvent[];
  createdAt: Date;
  updatedAt: Date;
}

export interface ICreateRunInput {
  actionType: RunActionType;
  surface: RunSurface;
  trigger?: RunTrigger;
  idempotencyKey?: string;
  correlationId?: string;
  input?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}
