/**
 * Social-account warm-up capability matrix (#2222).
 *
 * Every `CredentialPlatform` is classified so enroll cannot silently inherit
 * a TikTok/X/Instagram blueprint. A `full_blueprint` requires reviewed product
 * guidance, structured catalog steps, signal provenance, publishing-gate
 * semantics, and an executable integration path. Native-only actions stay
 * `user_confirmed`; no platform may gain automated engagement.
 */

import { z } from 'zod';
import { CredentialPlatform, formatPlatformLabel, parsePlatform } from '../..';
import { getCurrentSocialWarmupBlueprint } from './social-warmup-blueprint.contract';

export const SOCIAL_WARMUP_CAPABILITY_REVIEWED_ON = '2026-08-14';

export const socialWarmupSupportClassValues = [
  'full_blueprint',
  'readiness_only',
  'not_supported',
] as const;

export const socialWarmupSupportClassSchema = z.enum(
  socialWarmupSupportClassValues,
);

export type SocialWarmupSupportClass = z.infer<
  typeof socialWarmupSupportClassSchema
>;

const socialWarmupTextSchema = z.string().trim().min(1).max(2_000);
const socialWarmupDateSchema = z.iso.date();

export const socialWarmupCapabilityUiSchema = z
  .object({
    body: socialWarmupTextSchema,
    headline: socialWarmupTextSchema,
  })
  .strict();

export const socialWarmupCapabilitySchema = z
  .object({
    accountType: socialWarmupTextSchema,
    connectionScopes: z.array(z.string().trim().min(1).max(200)).max(30),
    evidenceFreshness: socialWarmupTextSchema,
    nativeOnlyActions: z.array(z.string().trim().min(1).max(200)).max(20),
    platform: z.nativeEnum(CredentialPlatform),
    policyConstraints: socialWarmupTextSchema,
    profilePostSignals: socialWarmupTextSchema,
    publishingCapabilities: socialWarmupTextSchema,
    rationale: socialWarmupTextSchema,
    reviewedOn: socialWarmupDateSchema,
    support: socialWarmupSupportClassSchema,
    ui: socialWarmupCapabilityUiSchema,
  })
  .strict();

export type SocialWarmupCapability = z.infer<
  typeof socialWarmupCapabilitySchema
>;

export const socialWarmupEnrollmentRefusalSchema = z
  .object({
    body: socialWarmupTextSchema,
    headline: socialWarmupTextSchema,
    message: socialWarmupTextSchema,
    platform: z.string().trim().min(1).max(80),
    support: z.enum(['readiness_only', 'not_supported']),
  })
  .strict();

export type SocialWarmupEnrollmentRefusal = z.infer<
  typeof socialWarmupEnrollmentRefusalSchema
>;

type CapabilityDraft = Omit<SocialWarmupCapability, 'reviewedOn'> & {
  reviewedOn?: string;
};

function capability(draft: CapabilityDraft): SocialWarmupCapability {
  return socialWarmupCapabilitySchema.parse({
    reviewedOn: SOCIAL_WARMUP_CAPABILITY_REVIEWED_ON,
    ...draft,
  });
}

const NO_AUTOMATED_ENGAGEMENT =
  'No automated engagement. Native likes, comments, follows, replies, DMs, and watch/scroll behavior stay user_confirmed.';

function notSupported(draft: {
  accountType: string;
  connectionScopes?: readonly string[];
  evidenceFreshness: string;
  nativeOnlyActions?: readonly string[];
  platform: CredentialPlatform;
  policyConstraints?: string;
  profilePostSignals: string;
  publishingCapabilities: string;
  rationale: string;
  ui: { body: string; headline: string };
}): SocialWarmupCapability {
  return capability({
    accountType: draft.accountType,
    connectionScopes: [...(draft.connectionScopes ?? [])],
    evidenceFreshness: draft.evidenceFreshness,
    nativeOnlyActions: [...(draft.nativeOnlyActions ?? [])],
    platform: draft.platform,
    policyConstraints: draft.policyConstraints ?? NO_AUTOMATED_ENGAGEMENT,
    profilePostSignals: draft.profilePostSignals,
    publishingCapabilities: draft.publishingCapabilities,
    rationale: draft.rationale,
    support: 'not_supported',
    ui: draft.ui,
  });
}

function outOfSocialWarmupCatalog(
  platform: CredentialPlatform,
  destination: string,
): SocialWarmupCapability {
  const label = formatPlatformLabel(platform) ?? platform;
  return notSupported({
    accountType: destination,
    evidenceFreshness: `Reviewed ${SOCIAL_WARMUP_CAPABILITY_REVIEWED_ON}. Explicitly outside social-account warm-up unless a separate product requirement adds a readiness workflow.`,
    platform,
    profilePostSignals: 'None for social-account warm-up.',
    publishingCapabilities:
      'Publishing or ads may exist for this destination, but they are not a social-account warm-up path.',
    rationale: `${label} stays outside social-account warm-up. CMS, commerce, ads, messaging, and analytics destinations do not enroll in a guided social blueprint.`,
    ui: {
      body: `${label} is not a social account. Warm-up stays off this connection.`,
      headline: 'Warm-up does not apply',
    },
  });
}

const FULL_BLUEPRINT_UI = {
  body: 'This connected account can enroll in the current platform blueprint. Native-only actions stay user-confirmed.',
  headline: 'Guided warm-up available',
} as const;

export const SOCIAL_WARMUP_CAPABILITY_MATRIX = {
  [CredentialPlatform.TIKTOK]: capability({
    accountType:
      'TikTok creator/user Login Kit account. Authorized Display + Content Posting APIs.',
    connectionScopes: [
      'user.info.basic',
      'user.info.stats',
      'user.info.profile',
      'video.list',
      'video.upload',
      'video.publish',
    ],
    evidenceFreshness: `Reviewed ${SOCIAL_WARMUP_CAPABILITY_REVIEWED_ON} against the published catalog blueprint, TikTok OAuth scopes, and authorized-signals adapter.`,
    nativeOnlyActions: [
      'Use the native TikTok app',
      'Watch niche content',
      'Like and save selectively',
      'Follow relevant creators',
      'Leave contextual comments',
      'Check For You relevance',
    ],
    platform: CredentialPlatform.TIKTOK,
    policyConstraints: NO_AUTOMATED_ENGAGEMENT,
    profilePostSignals:
      'Authorized profile/statistics, owned public videos, creator posting capability, and Genfeed publish outcomes. For You, watch history, saves, and comments made are not API-visible.',
    publishingCapabilities:
      'Content Posting API with productized scheduler support. Publishing hold consumes enrollment signals.',
    rationale:
      'Published catalog blueprint with reviewed product guidance, structured steps, signal provenance, publishing-gate semantics, and an executable authorized-signal path.',
    support: 'full_blueprint',
    ui: FULL_BLUEPRINT_UI,
  }),
  [CredentialPlatform.TWITTER]: capability({
    accountType: 'X (Twitter) OAuth 2.0 user account.',
    connectionScopes: [
      'tweet.read',
      'tweet.write',
      'users.read',
      'media.write',
      'dm.read',
      'dm.write',
      'offline.access',
    ],
    evidenceFreshness: `Reviewed ${SOCIAL_WARMUP_CAPABILITY_REVIEWED_ON} against the published catalog blueprint and X OAuth scopes. Authorized-signal adapter is a sibling issue, not inherited from TikTok.`,
    nativeOnlyActions: [
      'Read the native Home/Following timeline',
      'Reply in existing conversations',
      'Like and bookmark selectively',
      'Follow relevant accounts',
      'Write first original posts in the native app when required',
    ],
    platform: CredentialPlatform.TWITTER,
    policyConstraints: NO_AUTOMATED_ENGAGEMENT,
    profilePostSignals:
      'Authorized user profile and owned tweets when scopes are granted. Home timeline ranking, reply quality, and bookmarks stay native-only.',
    publishingCapabilities:
      'Tweet and media publish with productized scheduler support.',
    rationale:
      'Published catalog blueprint with reviewed X product guidance and an executable connection. Thresholds and copy are X-specific, not TikTok.',
    support: 'full_blueprint',
    ui: FULL_BLUEPRINT_UI,
  }),
  [CredentialPlatform.INSTAGRAM]: capability({
    accountType:
      'Instagram professional account via Facebook Login / Graph, Page-linked.',
    connectionScopes: [
      'business_management',
      'instagram_basic',
      'pages_show_list',
      'pages_read_engagement',
      'instagram_content_publish',
      'instagram_manage_insights',
      'pages_manage_posts',
      'public_profile',
      'ads_management',
    ],
    evidenceFreshness: `Reviewed ${SOCIAL_WARMUP_CAPABILITY_REVIEWED_ON} against the published catalog blueprint and Instagram OAuth scopes. Authorized-signal adapter is a sibling issue.`,
    nativeOnlyActions: [
      'Use the native Instagram app',
      'Watch niche Reels',
      'Like, save, and comment selectively',
      'Reply to Stories',
      'Post Stories from the native app',
    ],
    platform: CredentialPlatform.INSTAGRAM,
    policyConstraints: NO_AUTOMATED_ENGAGEMENT,
    profilePostSignals:
      'Professional profile, owned media, and insights when scopes are granted. Explore ranking, Stories replies, and watch history stay native-only.',
    publishingCapabilities:
      'Feed, Reel, and carousel publish for professional accounts with productized scheduler support.',
    rationale:
      'Published catalog blueprint with reviewed Instagram product guidance and an executable Graph integration. Stories and consumption stay user-confirmed.',
    support: 'full_blueprint',
    ui: FULL_BLUEPRINT_UI,
  }),
  [CredentialPlatform.FACEBOOK]: capability({
    accountType: 'Facebook Page via user token + /me/accounts page token.',
    connectionScopes: [
      'ads_management',
      'ads_read',
      'public_profile',
      'email',
      'pages_show_list',
      'pages_manage_posts',
      'pages_read_engagement',
      'pages_manage_metadata',
      'publish_video',
    ],
    evidenceFreshness: `Reviewed ${SOCIAL_WARMUP_CAPABILITY_REVIEWED_ON} against FacebookService Graph v24 OAuth, page publish/insights, and the hidden Facebook scheduler channel.`,
    nativeOnlyActions: [
      'Browse and engage in the native Facebook app',
      'Like, comment, and share in feed',
      'Follow Pages and join Groups',
    ],
    platform: CredentialPlatform.FACEBOOK,
    policyConstraints: `${NO_AUTOMATED_ENGAGEMENT} FacebookService.postComment must not run as warm-up engagement. Ads scopes are Meta Ads reuse, not warm-up.`,
    profilePostSignals:
      'User profile (id, name, email, picture), Page list, and post analytics after publish. No native feed consumption or Group engagement signals.',
    publishingCapabilities:
      'Page text, image, video, and scheduled posts via Graph. Scheduler channel remains hidden until productized.',
    rationale:
      'Connected Page plus a backend publisher exist, but there is no reviewed warm-up skill, catalog blueprint, or authorized-signal adapter. Do not inherit TikTok thresholds.',
    support: 'readiness_only',
    ui: {
      body: 'Genfeed can confirm the Page is connected and can publish. A guided 5–7 day plan is not available yet. Native likes, comments, and follows stay manual.',
      headline: 'Facebook is connection-only',
    },
  }),
  [CredentialPlatform.THREADS]: capability({
    accountType: 'Threads user via graph.threads.net OAuth.',
    connectionScopes: [
      'threads_basic',
      'threads_content_publish',
      'threads_manage_insights',
      'threads_manage_replies',
      'threads_read_replies',
    ],
    evidenceFreshness: `Reviewed ${SOCIAL_WARMUP_CAPABILITY_REVIEWED_ON} against ThreadsController OAuth scopes, ThreadsService profile/publish containers, and the planned scheduler channel.`,
    nativeOnlyActions: [
      'Read the native Threads feed',
      'Reply in existing threads',
      'Like and follow from the native app',
    ],
    platform: CredentialPlatform.THREADS,
    policyConstraints: `${NO_AUTOMATED_ENGAGEMENT} threads_manage_replies must not automate warm-up replies.`,
    profilePostSignals:
      'Authorized id, username, profile picture, and biography. Insights and replies exist as scopes, not as a warm-up signal adapter.',
    publishingCapabilities:
      'Text, image, video, and carousel containers via ThreadsService. Scheduler status is planned, not productized.',
    rationale:
      'Connection and a publisher exist, but there is no reviewed Threads warm-up skill, structured steps, or publishing-gate semantics. Scheduler is still planned.',
    support: 'readiness_only',
    ui: {
      body: 'Genfeed can confirm the Threads account is connected. A guided warm-up plan is not available yet. Replies stay manual.',
      headline: 'Threads is connection-only',
    },
  }),
  [CredentialPlatform.PINTEREST]: capability({
    accountType: 'Pinterest user with board-level Pins.',
    connectionScopes: ['pins:read', 'pins:write'],
    evidenceFreshness: `Reviewed ${SOCIAL_WARMUP_CAPABILITY_REVIEWED_ON} against PinterestService default OAuth scopes, createPin, and the hidden Pinterest scheduler channel.`,
    nativeOnlyActions: [
      'Browse related Pins in the native app',
      'Save Pins to boards',
      'Follow relevant creators and boards',
    ],
    platform: CredentialPlatform.PINTEREST,
    policyConstraints: NO_AUTOMATED_ENGAGEMENT,
    profilePostSignals:
      'Pin create/read through v5. Default connect does not request user_accounts or boards:read, so profile and board inventory are incomplete for a guided plan.',
    publishingCapabilities:
      'Image Pin create to a stored board. Scheduler channel remains hidden until productized.',
    rationale:
      'Connected plus a backend publisher exist, but scopes are pin-write only and there is no reviewed Pinterest warm-up skill or catalog blueprint.',
    support: 'readiness_only',
    ui: {
      body: 'Genfeed can confirm Pinterest is connected and can create a Pin. A guided warm-up plan is not available yet.',
      headline: 'Pinterest is connection-only',
    },
  }),
  [CredentialPlatform.REDDIT]: capability({
    accountType: 'Reddit user posting to a chosen subreddit.',
    connectionScopes: ['identity', 'submit'],
    evidenceFreshness: `Reviewed ${SOCIAL_WARMUP_CAPABILITY_REVIEWED_ON} against RedditService OAuth (identity submit), /api/v1/me, submitPost, and the hidden Reddit scheduler channel.`,
    nativeOnlyActions: [
      'Read the target subreddit in the native app',
      'Vote and comment as a community member',
      'Learn subreddit rules and flair before posting',
    ],
    platform: CredentialPlatform.REDDIT,
    policyConstraints: `${NO_AUTOMATED_ENGAGEMENT} RedditService.postComment must not run as warm-up engagement. Subreddit rules stay operator-owned.`,
    profilePostSignals:
      'Identity via /api/v1/me. No karma history, comment history, or subreddit standing adapter for warm-up.',
    publishingCapabilities:
      'Link or text submit to a stored subreddit, optional flair. Scheduler channel remains hidden until productized.',
    rationale:
      'Connected plus a backend publisher exist, but there is no reviewed Reddit warm-up skill, karma/standing signals, or catalog blueprint. Comment API is not a warm-up action.',
    support: 'readiness_only',
    ui: {
      body: 'Genfeed can confirm Reddit is connected and can submit a post. A guided warm-up plan is not available yet. Votes and comments stay manual.',
      headline: 'Reddit is connection-only',
    },
  }),
  [CredentialPlatform.MASTODON]: capability({
    accountType:
      'Per-instance Mastodon account (HTTPS instance URL + OAuth app).',
    connectionScopes: ['read', 'write', 'push'],
    evidenceFreshness: `Reviewed ${SOCIAL_WARMUP_CAPABILITY_REVIEWED_ON} against MastodonService app registration scopes and the hidden Mastodon scheduler channel.`,
    nativeOnlyActions: [
      'Read the local and federated timelines in a native client',
      'Boost, favourite, and follow from the native client',
      'Respect instance rules and content warnings',
    ],
    platform: CredentialPlatform.MASTODON,
    policyConstraints: `${NO_AUTOMATED_ENGAGEMENT} Instance rules vary; Genfeed must not automate favourites, boosts, or follows.`,
    profilePostSignals:
      'Instance account profile (id, username, display name, avatar). No federated-timeline or instance-trust adapter.',
    publishingCapabilities:
      'Status + up to four media attachments with visibility. Scheduler channel remains hidden until productized.',
    rationale:
      'Connected plus a working publisher exist, but there is no reviewed Mastodon warm-up skill or catalog blueprint. Federation and instance policy cannot share TikTok thresholds.',
    support: 'readiness_only',
    ui: {
      body: 'Genfeed can confirm the Mastodon account is connected and can publish. A guided warm-up plan is not available yet.',
      headline: 'Mastodon is connection-only',
    },
  }),
  [CredentialPlatform.FANVUE]: capability({
    accountType: 'Fanvue creator via PKCE OAuth.',
    connectionScopes: [
      'openid',
      'offline_access',
      'offline',
      'read:self',
      'read:media',
      'write:media',
      'write:post',
    ],
    evidenceFreshness: `Reviewed ${SOCIAL_WARMUP_CAPABILITY_REVIEWED_ON} against FanvueService FANVUE_SCOPES and FanvuePublisherService. No scheduler capability entry.`,
    nativeOnlyActions: [
      'Complete the Fanvue creator profile in the native product',
      'Message subscribers only from the native product',
      'Set paid-content visibility in the native product',
    ],
    platform: CredentialPlatform.FANVUE,
    policyConstraints: `${NO_AUTOMATED_ENGAGEMENT} Adult-creator policy and paid visibility stay operator-owned. No automated DMs or engagement.`,
    profilePostSignals:
      'read:self and read:media exist as scopes. No warm-up signal adapter or account-age provenance.',
    publishingCapabilities:
      'Text and media posts via FanvueService.createPost. Not a productized scheduler channel.',
    rationale:
      'Connected plus a publisher exist, but there is no reviewed Fanvue warm-up skill, catalog blueprint, or scheduler capability. Not a 5–7 day social ramp.',
    support: 'readiness_only',
    ui: {
      body: 'Genfeed can confirm Fanvue is connected and can publish. A guided social warm-up plan is not available.',
      headline: 'Fanvue is connection-only',
    },
  }),
  [CredentialPlatform.YOUTUBE]: capability({
    accountType: 'YouTube channel via Google OAuth.',
    connectionScopes: [
      'https://www.googleapis.com/auth/youtube',
      'https://www.googleapis.com/auth/youtube.readonly',
      'https://www.googleapis.com/auth/youtube.force-ssl',
      'https://www.googleapis.com/auth/youtube.upload',
      'https://www.googleapis.com/auth/yt-analytics.readonly',
    ],
    evidenceFreshness: `Reviewed ${SOCIAL_WARMUP_CAPABILITY_REVIEWED_ON} against the published catalog blueprint, YouTube OAuth scopes, and authorized-signals adapter.`,
    nativeOnlyActions: [
      'Watch niche videos to completion in YouTube',
      'Search niche keywords in the native app',
      'Subscribe and watch from the subscription feed',
      'Like and comment from the native app',
      'Check Home feed relevance',
      'Complete channel setup in YouTube Studio',
    ],
    platform: CredentialPlatform.YOUTUBE,
    policyConstraints: NO_AUTOMATED_ENGAGEMENT,
    profilePostSignals:
      'Authorized channel metadata, owned uploads, publishing capability, and owned-video analytics when scopes are granted. Watch history, subscriptions, likes, comments made outside Genfeed, search activity, and homepage ranking stay native-only.',
    publishingCapabilities:
      'Productized draft, publish-now, and scheduled video/Shorts uploads. Publishing hold consumes enrollment signals.',
    rationale:
      'Published catalog blueprint with reviewed YouTube product guidance, structured Shorts-to-long-form steps, signal provenance, publishing-gate semantics, and an executable authorized-signal path.',
    support: 'full_blueprint',
    ui: FULL_BLUEPRINT_UI,
  }),
  [CredentialPlatform.LINKEDIN]: capability({
    accountType:
      'LinkedIn member via OIDC + w_member_social. Organization pages require separate organization scopes.',
    connectionScopes: [
      'openid',
      'profile',
      'email',
      'w_member_social',
      'r_member_social',
      'r_organization_social',
      'w_organization_social',
      'rw_organization_admin',
    ],
    evidenceFreshness: `Reviewed ${SOCIAL_WARMUP_CAPABILITY_REVIEWED_ON} against the published catalog blueprint, LinkedIn OAuth scopes, and authorized-signals adapter.`,
    nativeOnlyActions: [
      'Complete the LinkedIn profile in the native app',
      'Read the niche home feed',
      'Search niche keywords',
      'Save and react selectively',
      'Send personalized connection requests',
      'Comment on niche posts from the native app',
      'Send welcome messages without pitching',
      'Observe SSI in the native product',
    ],
    platform: CredentialPlatform.LINKEDIN,
    policyConstraints: `${NO_AUTOMATED_ENGAGEMENT} Connection requests, comments, reactions, saves, messages, and SSI stay native. Member and organization publishing stay separate claims.`,
    profilePostSignals:
      'Authorized member profile, owned posts, member publishing capability, organization-page identity, organization publishing, and owned-post performance when scopes are granted. Feed consumption, connection requests, comments, reactions, saves, messages, and SSI stay native-only.',
    publishingCapabilities:
      'Member post publish with productized scheduler support. Organization-page publish is a separate capability and is never inferred from w_member_social. Publishing hold consumes enrollment signals.',
    rationale:
      'Published catalog blueprint with reviewed LinkedIn product guidance, structured profile-to-cadence steps, signal provenance, publishing-gate semantics, and an executable authorized-signal path that distinguishes member versus organization connections.',
    support: 'full_blueprint',
    ui: FULL_BLUEPRINT_UI,
  }),
  [CredentialPlatform.SNAPCHAT]: notSupported({
    accountType:
      'Snapchat Ads account via Marketing API, not an organic creator profile.',
    connectionScopes: ['snapchat-marketing-api'],
    evidenceFreshness: `Reviewed ${SOCIAL_WARMUP_CAPABILITY_REVIEWED_ON} against SnapchatService (adsapi.snapchat.com, SNAP_AD creatives) and the missing organic scheduler capability.`,
    nativeOnlyActions: ['Use Snapchat ads manager in the native ads product'],
    platform: CredentialPlatform.SNAPCHAT,
    policyConstraints:
      'Ads creatives are not social-account warm-up. No automated engagement and no organic Story/Spotlight path.',
    profilePostSignals:
      'No organic profile, Spotlight, or Story signals. Analytics helper still returns zeros.',
    publishingCapabilities:
      'SNAP_AD media/creatives against an ad account. No organic social publisher or scheduler catalog entry.',
    rationale:
      'The executable path is the Marketing API, not organic social-account warm-up. Same class as Google Ads until a Snapchat creator connection exists.',
    ui: {
      body: 'This Snapchat connection is an ads account. Social-account warm-up does not apply.',
      headline: 'Snapchat warm-up is not available',
    },
  }),
  [CredentialPlatform.X_ADS]: notSupported({
    accountType:
      'X Ads account via Ads API, distinct from the organic TWITTER credential.',
    connectionScopes: ['ads.read', 'ads.write', 'offline.access'],
    evidenceFreshness: `Reviewed ${SOCIAL_WARMUP_CAPABILITY_REVIEWED_ON} against XAdsService (X Ads API, promoted-tweet campaigns) and the missing organic scheduler capability.`,
    nativeOnlyActions: ['Use the X Ads Manager in the native ads product'],
    platform: CredentialPlatform.X_ADS,
    policyConstraints:
      'Promoted-tweet campaigns are not social-account warm-up. No automated engagement and no organic timeline path.',
    profilePostSignals:
      'No organic profile, timeline, or engagement signals. Ads campaigns operate on an existing tweet id, not organic posting.',
    publishingCapabilities:
      'Paused promoted-tweet campaign creation against an ad account. No organic social publisher or scheduler catalog entry.',
    rationale:
      'The executable path is the X Ads API, not organic social-account warm-up. Same class as Google Ads and Snapchat Ads until an X Ads creator connection exists.',
    ui: {
      body: 'This X Ads connection is an ads account. Social-account warm-up does not apply.',
      headline: 'X Ads warm-up is not available',
    },
  }),
  [CredentialPlatform.WORDPRESS]: outOfSocialWarmupCatalog(
    CredentialPlatform.WORDPRESS,
    'Self-hosted or WordPress.com publishing destination.',
  ),
  [CredentialPlatform.SHOPIFY]: outOfSocialWarmupCatalog(
    CredentialPlatform.SHOPIFY,
    'Shopify store / commerce destination.',
  ),
  [CredentialPlatform.GOOGLE_ADS]: outOfSocialWarmupCatalog(
    CredentialPlatform.GOOGLE_ADS,
    'Google Ads account.',
  ),
  [CredentialPlatform.GOOGLE_SEARCH_CONSOLE]: outOfSocialWarmupCatalog(
    CredentialPlatform.GOOGLE_SEARCH_CONSOLE,
    'Search analytics property, not a social account.',
  ),
  [CredentialPlatform.DISCORD]: outOfSocialWarmupCatalog(
    CredentialPlatform.DISCORD,
    'Discord server messaging destination.',
  ),
  [CredentialPlatform.TELEGRAM]: outOfSocialWarmupCatalog(
    CredentialPlatform.TELEGRAM,
    'Telegram bot/channel messaging destination.',
  ),
  [CredentialPlatform.SLACK]: outOfSocialWarmupCatalog(
    CredentialPlatform.SLACK,
    'Slack workspace messaging destination.',
  ),
  [CredentialPlatform.WHATSAPP]: outOfSocialWarmupCatalog(
    CredentialPlatform.WHATSAPP,
    'WhatsApp messaging destination.',
  ),
  [CredentialPlatform.TWITCH]: outOfSocialWarmupCatalog(
    CredentialPlatform.TWITCH,
    'Twitch live-streaming destination.',
  ),
  [CredentialPlatform.MEDIUM]: outOfSocialWarmupCatalog(
    CredentialPlatform.MEDIUM,
    'Medium article publishing destination.',
  ),
  [CredentialPlatform.GHOST]: outOfSocialWarmupCatalog(
    CredentialPlatform.GHOST,
    'Ghost CMS publishing destination.',
  ),
  [CredentialPlatform.BEEHIIV]: outOfSocialWarmupCatalog(
    CredentialPlatform.BEEHIIV,
    'Beehiiv newsletter destination.',
  ),
  [CredentialPlatform.DEV_TO]: outOfSocialWarmupCatalog(
    CredentialPlatform.DEV_TO,
    'Dev.to article publishing destination.',
  ),
  [CredentialPlatform.UNIPILE]: outOfSocialWarmupCatalog(
    CredentialPlatform.UNIPILE,
    'Unipile inbox aggregator, not a social post target.',
  ),
  [CredentialPlatform.RESTREAM]: outOfSocialWarmupCatalog(
    CredentialPlatform.RESTREAM,
    'Restream multistream + unified chat, not a social post target.',
  ),
  [CredentialPlatform.PRODUCT_HUNT]: outOfSocialWarmupCatalog(
    CredentialPlatform.PRODUCT_HUNT,
    'Product Hunt launch destination. No Genfeed credential warm-up path.',
  ),
  [CredentialPlatform.HACKER_NEWS]: outOfSocialWarmupCatalog(
    CredentialPlatform.HACKER_NEWS,
    'Hacker News destination. No Genfeed credential warm-up path.',
  ),
} as const satisfies Record<CredentialPlatform, SocialWarmupCapability>;

export const SOCIAL_WARMUP_NAMED_CANDIDATE_PLATFORMS = [
  CredentialPlatform.FACEBOOK,
  CredentialPlatform.THREADS,
  CredentialPlatform.PINTEREST,
  CredentialPlatform.REDDIT,
  CredentialPlatform.SNAPCHAT,
  CredentialPlatform.MASTODON,
  CredentialPlatform.FANVUE,
] as const;

export const SOCIAL_WARMUP_OUT_OF_CATALOG_PLATFORMS = [
  CredentialPlatform.WORDPRESS,
  CredentialPlatform.SHOPIFY,
  CredentialPlatform.GOOGLE_ADS,
] as const;

/**
 * Platforms that already have a reviewed authorized-signal adapter.
 * Expansion to another platform requires its own adapter — never inherit
 * TikTok/X/Instagram/YouTube/LinkedIn evidence keys.
 */
export const SOCIAL_WARMUP_AUTHORIZED_SIGNAL_ADAPTERS = [
  CredentialPlatform.INSTAGRAM,
  CredentialPlatform.LINKEDIN,
  CredentialPlatform.TIKTOK,
  CredentialPlatform.TWITTER,
  CredentialPlatform.YOUTUBE,
] as const;

export const SOCIAL_WARMUP_EXPANSION_REQUIREMENTS = [
  'reviewed_catalog_blueprint',
  'capability_full_blueprint',
  'authorized_signal_adapter',
  'native_only_user_confirmed',
  'no_automated_engagement',
  'publishing_gate_consumes_enrollment_signals',
] as const;

export type SocialWarmupExpansionRequirement =
  (typeof SOCIAL_WARMUP_EXPANSION_REQUIREMENTS)[number];

export interface SocialWarmupExpansionGate {
  isEnabled: boolean;
  missing: SocialWarmupExpansionRequirement[];
  platform: CredentialPlatform | string;
  signalBoundary: {
    authorized: string;
    nativeOnly: readonly string[];
    policyConstraints: string;
  };
  support: SocialWarmupSupportClass;
}

const UNKNOWN_PLATFORM_REFUSAL = socialWarmupEnrollmentRefusalSchema.parse({
  body: 'This connection is not supported for social-account warm-up.',
  headline: 'Warm-up is not available',
  message: 'This connection is not supported for social-account warm-up.',
  platform: 'unknown',
  support: 'not_supported',
});

export function getSocialWarmupSupport(
  platform: CredentialPlatform | string,
): SocialWarmupCapability | undefined {
  const parsed = parsePlatform(platform);
  if (!parsed) {
    return undefined;
  }

  return SOCIAL_WARMUP_CAPABILITY_MATRIX[parsed];
}

export function getSocialWarmupSupportClass(
  platform: CredentialPlatform | string,
): SocialWarmupSupportClass {
  return getSocialWarmupSupport(platform)?.support ?? 'not_supported';
}

export function isSocialWarmupEnrollmentAllowed(
  platform: CredentialPlatform | string,
): boolean {
  return getSocialWarmupSupportClass(platform) === 'full_blueprint';
}

export function getSocialWarmupSupportCopy(
  platform: CredentialPlatform | string,
): {
  body: string;
  headline: string;
  support: SocialWarmupSupportClass;
} {
  const capability = getSocialWarmupSupport(platform);
  if (!capability) {
    return {
      body: UNKNOWN_PLATFORM_REFUSAL.body,
      headline: UNKNOWN_PLATFORM_REFUSAL.headline,
      support: 'not_supported',
    };
  }

  return {
    body: capability.ui.body,
    headline: capability.ui.headline,
    support: capability.support,
  };
}

export function getSocialWarmupEnrollmentRefusal(
  platform: CredentialPlatform | string,
): SocialWarmupEnrollmentRefusal | undefined {
  const capability = getSocialWarmupSupport(platform);
  if (!capability) {
    return UNKNOWN_PLATFORM_REFUSAL;
  }

  if (capability.support === 'full_blueprint') {
    return undefined;
  }

  const label = formatPlatformLabel(capability.platform) ?? capability.platform;
  const supportLabel =
    capability.support === 'readiness_only'
      ? 'readiness-only'
      : 'not supported';

  return socialWarmupEnrollmentRefusalSchema.parse({
    body: capability.ui.body,
    headline: capability.ui.headline,
    message: `${label} is ${supportLabel} for social-account warm-up. ${capability.ui.body}`,
    platform: capability.platform,
    support: capability.support,
  });
}

export function listSocialWarmupPlatformsBySupport(
  support: SocialWarmupSupportClass,
): CredentialPlatform[] {
  return Object.values(CredentialPlatform).filter(
    (platform) => SOCIAL_WARMUP_CAPABILITY_MATRIX[platform].support === support,
  );
}

export function hasSocialWarmupAuthorizedSignalAdapter(
  platform: CredentialPlatform | string,
): boolean {
  const parsed = parsePlatform(platform);
  if (!parsed) {
    return false;
  }

  return (
    SOCIAL_WARMUP_AUTHORIZED_SIGNAL_ADAPTERS as readonly string[]
  ).includes(parsed);
}

export function evaluateSocialWarmupExpansionGate(
  platform: CredentialPlatform | string,
): SocialWarmupExpansionGate {
  const parsed = parsePlatform(platform);
  const capability = parsed ? getSocialWarmupSupport(parsed) : undefined;
  const blueprint = parsed
    ? getCurrentSocialWarmupBlueprint(parsed)
    : undefined;
  const missing: SocialWarmupExpansionRequirement[] = [];

  if (!blueprint) {
    missing.push('reviewed_catalog_blueprint');
  }
  if (capability?.support !== 'full_blueprint') {
    missing.push('capability_full_blueprint');
  }
  if (!hasSocialWarmupAuthorizedSignalAdapter(platform)) {
    missing.push('authorized_signal_adapter');
  }
  if (!capability?.nativeOnlyActions.length) {
    missing.push('native_only_user_confirmed');
  }
  if (
    !capability ||
    !/no automated engagement/i.test(capability.policyConstraints)
  ) {
    missing.push('no_automated_engagement');
  }
  if (
    !capability ||
    !/publishing hold|productized scheduler/i.test(
      capability.publishingCapabilities,
    )
  ) {
    missing.push('publishing_gate_consumes_enrollment_signals');
  }

  return {
    isEnabled: missing.length === 0,
    missing,
    platform: parsed ?? platform,
    signalBoundary: {
      authorized:
        capability?.profilePostSignals ??
        'No reviewed authorized-signal boundary is published for this connection.',
      nativeOnly: capability?.nativeOnlyActions ?? [],
      policyConstraints:
        capability?.policyConstraints ??
        'No reviewed social warm-up policy is published for this connection.',
    },
    support: capability?.support ?? 'not_supported',
  };
}
