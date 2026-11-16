import { CredentialPlatform } from '@genfeedai/contracts';

/**
 * The publishers that cannot confirm an uncertain publish, and why. A publisher
 * either has `verifyPublished` or an entry here (the coverage spec holds it to
 * that), so a provider never goes without a decision.
 *
 * Without `verifyPublished` a timed-out publish is retried blind while the
 * retry budget lasts, and the receipt is the only protection against a
 * duplicate. Each reason names what would have to change for a lookup to exist.
 */
export const UNVERIFIABLE_PUBLISH_REASONS: Readonly<
  Partial<Record<CredentialPlatform, string>>
> = {
  [CredentialPlatform.DISCORD]:
    "A webhook can fetch a message only by the id Discord returns when the post succeeds, and it cannot list the channel's messages, so a post that timed out has no id to look up.",
  [CredentialPlatform.FANVUE]:
    "Listing the creator's own posts needs a read scope the connection does not request; the scope change is tracked in #10311.",
  [CredentialPlatform.GENFEED]:
    "Publishes to Genfeed's own store in one local step, so there is no provider call whose outcome can be unknown.",
  [CredentialPlatform.MEDIUM]:
    "Medium's API creates posts and lists publications but has no endpoint to list a user's own posts.",
  [CredentialPlatform.PINTEREST]:
    "Listing the account's own pins needs a read scope the connection does not request; the scope change is tracked in #10311.",
  [CredentialPlatform.REDDIT]:
    "Listing the account's own submissions needs a read scope the connection does not request; the scope change is tracked in #10311.",
  [CredentialPlatform.SNAPCHAT]:
    'The publisher creates a Marketing API creative whose response carries only its id. There is no idempotency key, and a creative is told apart only by an optional headline and a media id that can be reused, which does not prove it came from this attempt.',
  [CredentialPlatform.TELEGRAM]:
    "The Bot API has no call that reads a chat's history or looks a message up, and sendMessage takes no idempotency key, so a post that timed out cannot be found afterwards.",
  [CredentialPlatform.TIKTOK]:
    'A timed-out publish has no publish id in its receipt, and the status lookup needs one. An inbox handoff is not a published video to find by time.',
  [CredentialPlatform.WHATSAPP]:
    'The Cloud API has no message lookup and no idempotency key; delivery is reported only by webhook.',
};
