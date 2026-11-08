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
 * runs nothing and leaves the approval pending in the review inbox.
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
  const decision =
    response.kind !== 'elicit' || response.action === 'cancel'
      ? 'cancel'
      : response.action === 'accept'
        ? 'approve'
        : 'decline';
  return {
    answer: { approvalId: state.approvalId, decision },
    wasPrompted: true,
  };
}

interface PendingApproval {
  approvalId: string;
  estimatedCredits?: number;
  /** The price range, when the cost cannot be estimated up front. */
  pricingSummary?: string;
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
    ...(typeof content.pricingSummary === 'string' && content.pricingSummary
      ? { pricingSummary: content.pricingSummary }
      : {}),
    toolName: content.toolName,
  };
}

const PREVIEW_MAX_LINES = 24;
const PREVIEW_MAX_CHARS = 2400;
/** Repeated spaces, or any whitespace other than a single space. */
const UNUSUAL_WHITESPACE = /\s\s|[^\S ]/;
const STARTS_WITH_VOWEL = /^[aeiou]/i;

/** Whether a string would read as another JSON value (a number, null, "x"). */
function readsAsJson(value: string): boolean {
  try {
    JSON.parse(value);
    return true;
  } catch {
    return false;
  }
}

/**
 * A string exactly as stored: plain text as is, and quoted with escapes when
 * it is empty, has line breaks, tabs, repeated or edge spaces, or would read
 * as another value (the text "null" or "42"), so nothing is hidden.
 */
function previewString(value: string): string {
  const isPlain =
    value !== '' &&
    value === value.trim() &&
    !UNUSUAL_WHITESPACE.test(value) &&
    !readsAsJson(value);
  return isPlain ? value : JSON.stringify(value);
}

function isScalar(value: unknown): boolean {
  return (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  );
}

/**
 * Every value the call carries, nested objects included, as "path: value"
 * lines. Nulls and empty values are shown too, since they can clear a field.
 * A list of plain values is shown as one JSON list, keeping each item's
 * boundary and type. Returns null when a value cannot be shown in full: the
 * person must not approve something they cannot see, so the call keeps the
 * inbox link.
 */
function previewLines(value: unknown, path: string): string[] | null {
  if (value === undefined) return [];
  if (typeof value === 'string') return [`- ${path}: ${previewString(value)}`];
  if (isScalar(value)) return [`- ${path}: ${String(value)}`];
  if (Array.isArray(value)) {
    if (value.every(isScalar)) return [`- ${path}: ${JSON.stringify(value)}`];
    return collectLines(
      value.map((entry, index) => [`${path}[${index}]`, entry]),
    );
  }
  if (isRecord(value)) {
    const entries = Object.entries(value);
    if (entries.length === 0) return [`- ${path}: {}`];
    return collectLines(
      entries.map(([key, entry]) => [`${path}.${key}`, entry]),
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
 * organization, text, destination, timing) when the client shows nothing but
 * this prompt. Null when the arguments are too large or too complex to show
 * in full.
 */
function argumentPreview(args: Record<string, unknown>): string[] | null {
  const lines = collectLines(Object.entries(args));
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
  pending: Pick<
    PendingApproval,
    'estimatedCredits' | 'pricingSummary' | 'toolName'
  >,
  args: Record<string, unknown>,
): string | null {
  const preview = argumentPreview(args);
  if (!preview) return null;
  const action =
    pending.toolName === 'generate' && typeof args.type === 'string'
      ? `Generate ${STARTS_WITH_VOWEL.test(args.type) ? 'an' : 'a'} ${args.type}${
          typeof args.model === 'string' && args.model
            ? ` with ${args.model}`
            : ''
        }`
      : `Run "${getToolByName(pending.toolName)?.title ?? pending.toolName}"`;
  const cost =
    pending.estimatedCredits !== undefined
      ? ` It uses about ${pending.estimatedCredits} credits.`
      : pending.pricingSummary
        ? ` ${pending.pricingSummary}`
        : '';
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
