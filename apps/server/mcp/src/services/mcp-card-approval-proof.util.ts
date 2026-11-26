import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

/**
 * The Approve button on the MCP App approval card (#9754). The card's click and
 * a model's `resolve_approval` call reach the server as the same request, so a
 * click is told apart by a proof only the card view holds. The server returns
 * the proof in the pending result's `_meta`, which a host hands to the view and
 * keeps out of the model's context. It names one approval and one member, and
 * it expires, so a copied proof approves nothing else and nothing later.
 */

const CARD_APPROVAL_PROOF_TTL_MS = 10 * 60 * 1000;

export interface CardApprovalProofs {
  /** A proof the card can send back to approve this one approval. */
  mint(approvalId: string): string;
  /** Whether the proof was minted for this approval, for this member, and is still fresh. */
  verify(approvalId: string, proof: unknown): boolean;
}

/**
 * Proofs keyed from the service key the MCP server already shares with the
 * API, bound to the calling member. Null without a service key or a member:
 * the card then offers only Decline and the review-inbox link.
 */
export function createCardApprovalProofs(
  serviceKey: unknown,
  member: { token?: string; userId?: string },
  now: () => number = Date.now,
): CardApprovalProofs | null {
  const memberId = member.userId || member.token;
  if (typeof serviceKey !== 'string' || !serviceKey || !memberId) return null;
  const key = createHash('sha256')
    .update(`genfeed.mcp.card-approval:${serviceKey}`)
    .digest();
  const sign = (approvalId: string, expiresAt: number) =>
    createHmac('sha256', key)
      .update(`${memberId}\0${approvalId}\0${expiresAt}`)
      .digest('base64url');
  return {
    mint(approvalId) {
      const expiresAt = now() + CARD_APPROVAL_PROOF_TTL_MS;
      return `${expiresAt}.${sign(approvalId, expiresAt)}`;
    },
    verify(approvalId, proof) {
      if (typeof proof !== 'string') return false;
      const [expiry, signature, ...rest] = proof.split('.');
      const expiresAt = Number(expiry);
      if (rest.length > 0 || !signature || !Number.isSafeInteger(expiresAt)) {
        return false;
      }
      if (expiresAt < now()) return false;
      const expected = Buffer.from(sign(approvalId, expiresAt));
      const given = Buffer.from(signature);
      return (
        given.length === expected.length && timingSafeEqual(given, expected)
      );
    },
  };
}
