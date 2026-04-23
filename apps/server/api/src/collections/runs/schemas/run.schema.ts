import type { Run as PrismaRun } from '@genfeedai/prisma';

export interface RunEvent {
  type: string;
  message?: string;
  payload?: Record<string, unknown>;
  source?: string;
  traceId?: string;
  createdAt?: Date | string;
  [key: string]: unknown;
}

export interface RunDocument extends Omit<PrismaRun, 'data'> {
  _id: string;
  organization?: string;
  user?: string;
  actionType?: string;
  authType?: string;
  surface?: string;
  status?: string;
  trigger?: string;
  progress?: number;
  traceId?: string;
  correlationId?: string;
  idempotencyKey?: string;
  startedAt?: Date | string | null;
  completedAt?: Date | string | null;
  durationMs?: number | null;
  input?: Record<string, unknown>;
  output?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  error?: string | null;
  events?: RunEvent[];
  data?: Record<string, unknown>;
  [key: string]: unknown;
}

export type Run = RunDocument;
