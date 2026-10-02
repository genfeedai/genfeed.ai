import { z } from 'zod';

const opaqueTaskId = z.string().regex(/^[\x21-\x7e]{1,256}$/);
const credits = z.number().finite().nonnegative();
const integer = z.number().finite().int().nonnegative();
const envelope = z.object({
  code: z.number().finite().int(),
  message: z.string(),
  data: z.unknown(),
});

export type CrunResponse<T> =
  | { isValid: true; data: T }
  | { isValid: false; reasonCode: string };

export interface CrunEstimateResponse {
  credits: string;
  estimated: boolean;
}

export interface CrunTaskStatusResponse {
  taskId: string;
  provider: string;
  modelVersion: string;
  status: 'pending' | 'running' | 'success' | 'failed';
  credits: string | null;
  createdAtSeconds: number;
  completedAtSeconds?: number | null;
  durationSeconds?: number | null;
  resultCode?: number;
  mediaCount: number;
  /** Ephemeral only. Never persist this field to a task, ledger or log. */
  mediaUrls: string[];
  recoveryCode: string | null;
}

function successfulEnvelope(
  httpStatus: number,
  value: unknown,
): CrunResponse<unknown> {
  const parsed = envelope.safeParse(value);
  if (
    !parsed.success ||
    httpStatus < 200 ||
    httpStatus >= 300 ||
    parsed.data.code !== 200
  )
    return { isValid: false, reasonCode: 'CRUN_RESPONSE_INVALID' };
  return { isValid: true, data: parsed.data.data };
}

/** Expand exponent notation to a normalized finite nonnegative decimal string. */
export function normalizeCrunCreditNumber(value: number): string {
  const [coefficient, exponent = '0'] = String(value).toLowerCase().split('e');
  const [whole, fraction = ''] = coefficient.split('.');
  const digits = `${whole}${fraction}`;
  const point = whole.length + Number(exponent);
  const decimal =
    point <= 0
      ? `0.${'0'.repeat(-point)}${digits}`
      : point >= digits.length
        ? `${digits}${'0'.repeat(point - digits.length)}`
        : `${digits.slice(0, point)}.${digits.slice(point)}`;
  const [integerPart, decimalPart = ''] = decimal.split('.');
  const normalizedFraction = decimalPart.replace(/0+$/, '');
  return `${integerPart.replace(/^0+(?=\d)/, '')}${normalizedFraction ? `.${normalizedFraction}` : ''}`;
}

export function parseCrunCreateTask(
  httpStatus: number,
  value: unknown,
): CrunResponse<{ taskId: string }> {
  const response = successfulEnvelope(httpStatus, value);
  if (!response.isValid) return response;
  const parsed = z.object({ task_id: opaqueTaskId }).safeParse(response.data);
  return parsed.success
    ? { isValid: true, data: { taskId: parsed.data.task_id } }
    : { isValid: false, reasonCode: 'CRUN_ACCEPTANCE_AMBIGUOUS' };
}

export function parseCrunEstimate(
  httpStatus: number,
  value: unknown,
): CrunResponse<CrunEstimateResponse> {
  const response = successfulEnvelope(httpStatus, value);
  if (!response.isValid) return response;
  const parsed = z
    .object({ credits, estimated: z.boolean() })
    .safeParse(response.data);
  return parsed.success
    ? {
        isValid: true,
        data: {
          credits: normalizeCrunCreditNumber(parsed.data.credits),
          estimated: parsed.data.estimated,
        },
      }
    : { isValid: false, reasonCode: 'CRUN_ESTIMATE_INVALID' };
}

const taskInfo = z.object({
  task_id: opaqueTaskId,
  provider: z.string().min(1).max(256),
  model_version: z.string().min(1).max(256),
  status: z.enum(['pending', 'running', 'success', 'failed']),
  param: z.record(z.string(), z.unknown()),
  create_at: integer,
  source: z.literal('api'),
  credits: z.unknown().optional(),
  result: z
    .object({
      code: z.number().finite().int().optional(),
      message: z.string().optional(),
      media_urls: z.unknown().optional(),
    })
    .nullable()
    .optional(),
  duration_s: integer.nullable().optional(),
  complete_at: integer.nullable().optional(),
});

export function parseCrunTaskInfo(
  httpStatus: number,
  value: unknown,
  expectedTaskId: string,
): CrunResponse<CrunTaskStatusResponse> {
  const response = successfulEnvelope(httpStatus, value);
  if (!response.isValid) return response;
  const parsed = taskInfo.safeParse(response.data);
  if (!parsed.success)
    return { isValid: false, reasonCode: 'CRUN_TASK_INFO_INVALID' };
  const data = parsed.data;
  if (data.task_id !== expectedTaskId)
    return { isValid: false, reasonCode: 'CRUN_TASK_ID_MISMATCH' };
  const isTerminal = data.status === 'success' || data.status === 'failed';
  const amount = credits.safeParse(data.credits);
  if (!isTerminal && data.credits !== undefined && !amount.success)
    return { isValid: false, reasonCode: 'CRUN_TASK_CREDITS_INVALID' };
  let recoveryCode =
    isTerminal && !amount.success ? 'CRUN_TERMINAL_CREDITS_MISSING' : null;
  const urls = data.result?.media_urls;
  const mediaCount = Array.isArray(urls) ? urls.length : 0;
  let mediaUrls: string[] = [];
  if (data.status === 'success') {
    if (
      !Array.isArray(urls) ||
      urls.length !== 1 ||
      typeof urls[0] !== 'string' ||
      !isSafeMediaUrl(urls[0])
    )
      recoveryCode ??= 'CRUN_OUTPUT_INVALID';
    else mediaUrls = [urls[0]];
  }
  return {
    isValid: true,
    data: {
      taskId: data.task_id,
      provider: data.provider,
      modelVersion: data.model_version,
      status: data.status,
      credits:
        isTerminal && amount.success
          ? normalizeCrunCreditNumber(amount.data)
          : null,
      createdAtSeconds: data.create_at,
      completedAtSeconds: data.complete_at,
      durationSeconds: data.duration_s,
      resultCode: data.result?.code,
      mediaCount,
      mediaUrls,
      recoveryCode,
    },
  };
}

function isSafeMediaUrl(value: string): boolean {
  if (value.length > 4096) return false;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password;
  } catch {
    return false;
  }
}
