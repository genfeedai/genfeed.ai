import { createHash } from 'node:crypto';
import { getToolByName } from '@genfeedai/actions';
import { isRecord } from '@genfeedai/utils/data/extract.util';
import type { McpApprovalAnswer } from '@mcp/shared/interfaces/approval.interface';
import {
  CLIENT_CAPABILITIES_META_KEY,
  createRequestStateCodec,
  type InputRequiredResult,
  inputRequired,
  inputResponse,
  PROTOCOL_VERSION_META_KEY,
  type RequestStateCodec,
  type ServerContext,
} from '@modelcontextprotocol/server';

/**
 * In-conversation approval (#9647). When a call needs approval and the client
 * can show a form, the server asks the person directly (an MCP elicitation)
 * instead of only linking to the review inbox. The client shows the prompt and
 * retries the same call with the person's answer; the answer never passes
 * through the model. The approval id rides in signed request state, bound to
 * the caller's token, so a client cannot point an answer at another approval.
 */

const APPROVAL_INPUT_KEY = 'approval';
const APPROVAL_PROMPT_TTL_SECONDS = 600;

export interface ApprovalPromptState {
  approvalId: string;
  toolName: string;
}

export interface ApprovalPromptRound {
  /** The person's decision, when this call is the retry carrying one. */
  answer?: McpApprovalAnswer;
  /** This call already showed the prompt; never show it twice. */
  wasPrompted: boolean;
}

/**
 * A request-state codec keyed from the service key the MCP server already
 * shares with the API, so no new secret is needed. Null without a service key
 * or a caller token: the call then keeps the review-inbox link only.
 */
export function createApprovalPromptCodec(
  serviceKey: unknown,
  callerToken: string | undefined,
): RequestStateCodec<ApprovalPromptState> | null {
  if (typeof serviceKey !== 'string' || !serviceKey || !callerToken) {
    return null;
  }
  const key = createHash('sha256')
    .update(`genfeed.mcp.approval-prompt:${serviceKey}`)
    .digest();
  const caller = createHash('sha256').update(callerToken).digest('base64url');
  return createRequestStateCodec<ApprovalPromptState>({
    bind: (ctx) => `${ctx.mcpReq.method}\0${caller}`,
    key: new Uint8Array(key),
    ttlSeconds: APPROVAL_PROMPT_TTL_SECONDS,
  });
}

/**
 * Whether this request can carry an approval prompt: a 2026-07-28 request
 * (per-request envelope) from a client that declared form elicitation. Older
 * stateless connections cannot answer mid-call, so they keep the inbox link.
 */
export function canPromptForApproval(ctx: ServerContext): boolean {
  const envelope = ctx.mcpReq.envelope as Record<string, unknown> | undefined;
  if (typeof envelope?.[PROTOCOL_VERSION_META_KEY] !== 'string') return false;
  const capabilities = envelope[CLIENT_CAPABILITIES_META_KEY];
  const elicitation = isRecord(capabilities)
    ? capabilities.elicitation
    : undefined;
  if (!isRecord(elicitation)) return false;
  return Object.keys(elicitation).length === 0 || isRecord(elicitation.form);
}

function isApprovalPromptState(value: unknown): value is ApprovalPromptState {
  return (
    isRecord(value) &&
    typeof value.approvalId === 'string' &&
    value.approvalId.length > 0 &&
    typeof value.toolName === 'string'
  );
}

/**
 * Read the person's answer from a retried call. The request state has already
 * been verified by the server's codec; unsigned state reads as a raw string
 * and is ignored. Accept approves, decline declines, and cancel (or no answer)
 * leaves the approval pending in the review inbox.
 */
export function readApprovalPromptRound(
  ctx: ServerContext,
  toolName: string,
): ApprovalPromptRound {
  const state = ctx.mcpReq.requestState<unknown>();
  if (!isApprovalPromptState(state) || state.toolName !== toolName) {
    return { wasPrompted: false };
  }
  const response = inputResponse(ctx.mcpReq.inputResponses, APPROVAL_INPUT_KEY);
  if (response.kind !== 'elicit' || response.action === 'cancel') {
    return { wasPrompted: true };
  }
  return {
    answer: {
      approvalId: state.approvalId,
      decision: response.action === 'accept' ? 'approve' : 'decline',
    },
    wasPrompted: true,
  };
}

interface PendingApproval {
  approvalId: string;
  estimatedCredits?: number;
  toolName: string;
}

function readPendingApproval(result: unknown): PendingApproval | null {
  if (!isRecord(result) || !isRecord(result.structuredContent)) return null;
  const content = result.structuredContent;
  if (
    content.code !== 'approval_pending' ||
    typeof content.approvalId !== 'string' ||
    typeof content.toolName !== 'string'
  ) {
    return null;
  }
  return {
    approvalId: content.approvalId,
    ...(typeof content.estimatedCredits === 'number'
      ? { estimatedCredits: content.estimatedCredits }
      : {}),
    toolName: content.toolName,
  };
}

const PREVIEW_MAX_LINES = 24;
const PREVIEW_MAX_CHARS = 2400;
const PREVIEW_SKIPPED_KEYS = new Set(['organization']);

/**
 * A string exactly as stored: plain text as is, and anything with line breaks,
 * tabs, repeated or edge spaces quoted with escapes, so nothing is hidden.
 */
function previewString(value: string): string {
  const isPlain = value === value.trim() && !/\s\s|[^\S ]/.test(value);
  return isPlain ? value : JSON.stringify(value);
}

function previewScalar(value: unknown): string | null | undefined {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string') return previewString(value);
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  return undefined;
}

/**
 * Every value the call carries, nested objects included, as "path: value"
 * lines. Empty values are left out because they carry nothing to check.
 * Returns null when a value cannot be shown in full: the person must not
 * approve something they cannot see, so the call keeps the inbox link.
 */
function previewLines(value: unknown, path: string): string[] | null {
  const scalar = previewScalar(value);
  if (scalar !== undefined) return scalar ? [`- ${path}: ${scalar}`] : [];
  if (Array.isArray(value)) {
    const scalars = value.map(previewScalar);
    if (scalars.every((entry) => typeof entry === 'string' || entry === null)) {
      const joined = scalars.filter(Boolean).join(', ');
      return joined ? [`- ${path}: ${joined}`] : [];
    }
    return collectLines(
      value.map((entry, index) => [`${path}[${index}]`, entry]),
    );
  }
  if (isRecord(value)) {
    return collectLines(
      Object.entries(value).map(([key, entry]) => [`${path}.${key}`, entry]),
    );
  }
  return null;
}

function collectLines(entries: [string, unknown][]): string[] | null {
  const lines: string[] = [];
  for (const [path, entry] of entries) {
    const entryLines = previewLines(entry, path);
    if (!entryLines) return null;
    lines.push(...entryLines);
  }
  return lines;
}

/**
 * The call's own arguments, so the person can check what they approve (the
 * text, destination, timing) when the client shows nothing but this prompt.
 * Null when the arguments are too large or too complex to show in full.
 */
function argumentPreview(args: Record<string, unknown>): string[] | null {
  const lines = collectLines(
    Object.entries(args).filter(([key]) => !PREVIEW_SKIPPED_KEYS.has(key)),
  );
  if (
    !lines ||
    lines.length > PREVIEW_MAX_LINES ||
    lines.join('\n').length > PREVIEW_MAX_CHARS
  ) {
    return null;
  }
  return lines;
}

/**
 * The question the person sees, e.g. "Generate an image with flux-pro?", with
 * every argument listed. Null when the arguments cannot be shown in full.
 */
export function approvalPromptMessage(
  pending: Pick<PendingApproval, 'estimatedCredits' | 'toolName'>,
  args: Record<string, unknown>,
): string | null {
  const preview = argumentPreview(args);
  if (!preview) return null;
  const action =
    pending.toolName === 'generate' && typeof args.type === 'string'
      ? `Generate ${args.type === 'image' ? 'an image' : `a ${args.type}`}${
          typeof args.model === 'string' && args.model
            ? ` with ${args.model}`
            : ''
        }`
      : `Run "${getToolByName(pending.toolName)?.title ?? pending.toolName}"`;
  const cost =
    pending.estimatedCredits === undefined
      ? ''
      : ` It uses about ${pending.estimatedCredits} credits.`;
  return [
    `Genfeed needs your approval. ${action}?${cost}`,
    ...preview,
    'Accept to run it now, or decline to cancel it.',
  ].join('\n');
}

/**
 * Turn a pending-approval result into a prompt for the person, or null when
 * the result is not a pending approval or its arguments cannot be shown in
 * full (the call then keeps the review-inbox link).
 */
export async function promptForApproval(
  codec: RequestStateCodec<ApprovalPromptState>,
  ctx: ServerContext,
  call: { args: Record<string, unknown>; toolName: string },
  result: unknown,
): Promise<InputRequiredResult | null> {
  const pending = readPendingApproval(result);
  if (!pending) return null;
  const message = approvalPromptMessage(pending, call.args);
  if (!message) return null;
  return inputRequired({
    inputRequests: {
      [APPROVAL_INPUT_KEY]: inputRequired.elicit({
        message,
        requestedSchema: { properties: {}, type: 'object' },
      }),
    },
    // The called name, which the retry repeats; the approval may record the
    // execution name a catalog call maps to.
    requestState: await codec.mint(
      { approvalId: pending.approvalId, toolName: call.toolName },
      ctx,
    ),
  });
}
