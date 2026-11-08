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

/** The question the person sees, e.g. "Generate an image with flux-pro?". */
export function approvalPromptMessage(
  pending: Pick<PendingApproval, 'estimatedCredits' | 'toolName'>,
  args: Record<string, unknown>,
): string {
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
  return `Genfeed needs your approval. ${action}?${cost} Accept to run it now, or decline to cancel it.`;
}

/**
 * Turn a pending-approval result into a prompt for the person, or null when
 * the result is not a pending approval.
 */
export async function promptForApproval(
  codec: RequestStateCodec<ApprovalPromptState>,
  ctx: ServerContext,
  result: unknown,
  args: Record<string, unknown>,
): Promise<InputRequiredResult | null> {
  const pending = readPendingApproval(result);
  if (!pending) return null;
  return inputRequired({
    inputRequests: {
      [APPROVAL_INPUT_KEY]: inputRequired.elicit({
        message: approvalPromptMessage(pending, args),
        requestedSchema: { properties: {}, type: 'object' },
      }),
    },
    requestState: await codec.mint(
      { approvalId: pending.approvalId, toolName: pending.toolName },
      ctx,
    ),
  });
}
