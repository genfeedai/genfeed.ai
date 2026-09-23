import { APP_ROUTES } from '@genfeedai/contracts/constants';
import { getPublicAppUrl } from '@mcp/mcp/setup-page';
import type { McpApprovalResource } from '@mcp/shared/interfaces/approval.interface';
import { HttpException } from '@nestjs/common';

/**
 * One contract for MCP gating failures. Transport rejections (auth and the
 * RateLimitService window) put the same object on JSON-RPC `error.data`.
 * Tool results put it on `structuredContent`.
 */
export const MCP_TOOL_ERROR_CODES = [
  'unauthorized',
  'plan_required',
  'insufficient_credits',
  'rate_limited',
  'validation_failed',
  'approval_pending',
] as const;

export type McpToolErrorCode = (typeof MCP_TOOL_ERROR_CODES)[number];

export interface McpToolFieldError {
  field: string;
  message: string;
}

export interface McpToolError {
  code: McpToolErrorCode;
  message: string;
  retryAfterSeconds?: number;
  nextStepUrl?: string;
  errors?: McpToolFieldError[];
}

export interface McpToolErrorResult {
  content: Array<{ text: string; type: 'text' }>;
  isError: true;
  structuredContent: McpToolError;
}

export interface McpToolFailureSignals {
  domainCode?: string;
  message?: string;
  retryAfterSeconds?: number;
  status?: number;
  title?: string;
  validationErrors?: McpToolFieldError[];
}

const PLAN_MESSAGE =
  /organization billing|subscription billing is not enabled|active subscription is required|paid plans?|plan limit|upgrade to pro/i;
const CREDIT_MESSAGE = /insufficient credits|not enough credits/i;
const RATE_MESSAGE = /rate limit|too many requests/i;
const AUTH_MESSAGE =
  /unauthorized|invalid token|bearer token required|authentication required|sign in again/i;
const REQUIRED_ARG_MESSAGE = /^([A-Za-z][A-Za-z0-9_]*) (?:is )?required\b/;

export class McpUpstreamError extends Error {
  readonly body: unknown;
  readonly retryAfterSeconds: number | undefined;
  readonly status: number | undefined;

  constructor(
    message: string,
    details: {
      body?: unknown;
      retryAfterSeconds?: number;
      status?: number;
    },
  ) {
    super(message);
    this.name = 'McpUpstreamError';
    this.body = details.body;
    this.retryAfterSeconds = details.retryAfterSeconds;
    this.status = details.status;
  }
}

function appUrl(path: string): string {
  return `${getPublicAppUrl()}${path}`;
}

function nextStepUrl(code: McpToolErrorCode): string | undefined {
  switch (code) {
    case 'approval_pending':
      return appUrl(APP_ROUTES.PUBLISHING.REVIEW);
    case 'insufficient_credits':
      return appUrl(APP_ROUTES.SETTINGS.CREDITS);
    case 'plan_required':
      return appUrl(APP_ROUTES.SETTINGS.SUBSCRIPTION);
    case 'unauthorized':
      return appUrl(APP_ROUTES.CONNECT);
    default:
      return undefined;
  }
}

function compactToolError(error: McpToolError): McpToolError {
  return {
    code: error.code,
    message: error.message,
    ...(error.errors && error.errors.length > 0
      ? { errors: error.errors }
      : {}),
    ...(error.nextStepUrl ? { nextStepUrl: error.nextStepUrl } : {}),
    ...(error.retryAfterSeconds !== undefined
      ? { retryAfterSeconds: error.retryAfterSeconds }
      : {}),
  };
}

export function mcpToolErrorResult(error: McpToolError): McpToolErrorResult {
  const structuredContent = compactToolError(error);
  return {
    content: [
      {
        text: JSON.stringify(structuredContent, null, 2),
        type: 'text',
      },
    ],
    isError: true,
    structuredContent,
  };
}

export function mcpJsonRpcError(
  id: string | number | null,
  jsonRpcCode: number,
  error: McpToolError,
): {
  error: { code: number; data: McpToolError; message: string };
  id: string | number | null;
  jsonrpc: '2.0';
} {
  const data = compactToolError(error);
  return {
    error: {
      code: jsonRpcCode,
      data,
      message: data.message,
    },
    id,
    jsonrpc: '2.0',
  };
}

export function approvalPendingToolResult(
  approval: McpApprovalResource,
): McpToolErrorResult {
  return mcpToolErrorResult({
    code: 'approval_pending',
    message:
      `This action requires approval before it runs. ` +
      `Approval ID: ${approval.id}. Tool: ${approval.toolName}. ` +
      `Status: ${approval.status}. A reviewer has been notified. ` +
      'Hand them the approval queue, or call `resolve_approval` with ' +
      `approvalId "${approval.id}" and decision "approve" (or "decline" to cancel).`,
    nextStepUrl: nextStepUrl('approval_pending'),
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function constraintMessage(constraints: unknown): string | undefined {
  if (!isRecord(constraints)) return undefined;
  const messages = Object.values(constraints).filter(
    (value): value is string => typeof value === 'string' && value.length > 0,
  );
  return messages.length > 0 ? messages.join('; ') : undefined;
}

function readFieldErrors(value: unknown): McpToolFieldError[] {
  if (!Array.isArray(value)) return [];
  const errors: McpToolFieldError[] = [];
  for (const item of value) {
    if (!isRecord(item)) continue;
    if (typeof item.field === 'string' && typeof item.message === 'string') {
      errors.push({ field: item.field, message: item.message });
      continue;
    }
    const message = constraintMessage(item.constraints);
    if (typeof item.property === 'string' && message) {
      errors.push({ field: item.property, message });
      continue;
    }
    const pointer = isRecord(item.source) ? item.source.pointer : undefined;
    if (
      typeof pointer === 'string' &&
      pointer.startsWith('/') &&
      pointer.length > 1 &&
      typeof item.detail === 'string'
    ) {
      errors.push({ field: pointer.slice(1), message: item.detail });
    }
  }
  return errors;
}

function headerValue(headers: unknown, name: string): string | undefined {
  if (!isRecord(headers)) return undefined;
  if (typeof headers.get === 'function') {
    const value = (headers.get as (header: string) => unknown)(name);
    return typeof value === 'string' ? value : undefined;
  }
  const raw = headers[name] ?? headers[name.toLowerCase()];
  return typeof raw === 'string' ? raw : undefined;
}

function readRetryAfterSeconds(headers: unknown): number | undefined {
  const raw = headerValue(headers, 'retry-after');
  if (!raw || !/^\d+$/.test(raw)) return undefined;
  const seconds = Number(raw);
  return seconds > 0 ? seconds : undefined;
}

function readBodySignals(body: unknown): Partial<McpToolFailureSignals> {
  if (!isRecord(body)) return {};
  const domainCode = typeof body.code === 'string' ? body.code : undefined;
  const title = typeof body.title === 'string' ? body.title : undefined;
  const message =
    typeof body.detail === 'string'
      ? body.detail
      : typeof body.message === 'string'
        ? body.message
        : undefined;
  const directErrors = [
    ...readFieldErrors(body.validationErrors),
    ...readFieldErrors(body.errors),
  ];
  const members = Array.isArray(body.errors) ? body.errors : [];
  const first = members.find(isRecord);
  const memberCode =
    first && isRecord(first.meta) && typeof first.meta.domainCode === 'string'
      ? first.meta.domainCode
      : undefined;
  const memberTitle =
    first && typeof first.title === 'string' ? first.title : undefined;
  const memberDetail =
    first && typeof first.detail === 'string' ? first.detail : undefined;
  const memberErrors = [
    ...readFieldErrors(
      first && isRecord(first.meta) ? first.meta.validationErrors : undefined,
    ),
    ...readFieldErrors(body.errors),
  ];
  return {
    domainCode: domainCode ?? memberCode,
    message: message ?? memberDetail,
    title: title ?? memberTitle,
    validationErrors: directErrors.length > 0 ? directErrors : memberErrors,
  };
}

function readHttpExceptionSignals(
  error: HttpException,
): Partial<McpToolFailureSignals> {
  const response = error.getResponse();
  if (typeof response === 'string') {
    return { message: response, status: error.getStatus() };
  }
  return {
    ...readBodySignals(response),
    status: error.getStatus(),
  };
}

export function readMcpToolFailureSignals(
  error: unknown,
): McpToolFailureSignals {
  if (typeof error === 'string') {
    return { message: error };
  }
  if (error instanceof McpUpstreamError) {
    const body = readBodySignals(error.body);
    return {
      ...body,
      message: body.message ?? error.message,
      retryAfterSeconds: error.retryAfterSeconds,
      status: error.status,
    };
  }
  if (error instanceof HttpException) {
    return readHttpExceptionSignals(error);
  }
  if (isRecord(error) && isRecord(error.response)) {
    const body = readBodySignals(error.response.data);
    const status =
      typeof error.response.status === 'number'
        ? error.response.status
        : undefined;
    const message =
      body.message ??
      (typeof error.message === 'string' ? error.message : undefined);
    return {
      ...body,
      message,
      retryAfterSeconds: readRetryAfterSeconds(error.response.headers),
      status,
    };
  }
  if (error instanceof Error) {
    return { message: error.message };
  }
  return { message: 'Tool execution failed' };
}

function positiveSeconds(value: number | undefined): number | undefined {
  if (value === undefined || !Number.isFinite(value) || value <= 0) {
    return undefined;
  }
  return Math.ceil(value);
}

export function classifyMcpToolFailure(
  signals: McpToolFailureSignals,
): McpToolError | null {
  const message = signals.message?.trim() ?? '';
  const title = signals.title?.trim() ?? '';
  const text = `${title} ${message}`.trim();
  const domainCode = signals.domainCode;
  const validationErrors = signals.validationErrors ?? [];
  const status = signals.status;

  if (
    validationErrors.length > 0 ||
    domainCode === 'VALIDATION_FAILED' ||
    (status === 400 && /validation failed/i.test(text))
  ) {
    return compactToolError({
      code: 'validation_failed',
      errors:
        validationErrors.length > 0
          ? validationErrors
          : [{ field: 'request', message: message || 'Validation failed' }],
      message:
        validationErrors.length === 1
          ? validationErrors[0].message
          : 'Validation failed',
    });
  }

  if (
    domainCode === 'INSUFFICIENT_CREDITS' ||
    status === 402 ||
    CREDIT_MESSAGE.test(text)
  ) {
    return compactToolError({
      code: 'insufficient_credits',
      message: message || 'Not enough credits to run this tool.',
      nextStepUrl: nextStepUrl('insufficient_credits'),
    });
  }

  if (domainCode === 'PLAN_LIMIT_EXCEEDED' || PLAN_MESSAGE.test(text)) {
    return compactToolError({
      code: 'plan_required',
      message: message || 'A paid plan is required for this tool.',
      nextStepUrl: nextStepUrl('plan_required'),
    });
  }

  if (status === 429 || RATE_MESSAGE.test(text)) {
    const retryAfterSeconds = positiveSeconds(signals.retryAfterSeconds);
    return compactToolError({
      code: 'rate_limited',
      message:
        message ||
        (retryAfterSeconds
          ? `Rate limit exceeded. Retry after ${retryAfterSeconds}s.`
          : 'Rate limit exceeded.'),
      ...(retryAfterSeconds ? { retryAfterSeconds } : {}),
    });
  }

  if (status === 401 || AUTH_MESSAGE.test(text)) {
    return compactToolError({
      code: 'unauthorized',
      message: message || 'Authorization required.',
      nextStepUrl: nextStepUrl('unauthorized'),
    });
  }

  const required = REQUIRED_ARG_MESSAGE.exec(message);
  if (required) {
    return compactToolError({
      code: 'validation_failed',
      errors: [{ field: required[1], message }],
      message,
    });
  }

  if (status !== undefined && status >= 500) {
    return null;
  }

  return null;
}

export function toMcpToolErrorResult(
  error: unknown,
): McpToolErrorResult | null {
  const classified = classifyMcpToolFailure(readMcpToolFailureSignals(error));
  return classified ? mcpToolErrorResult(classified) : null;
}
