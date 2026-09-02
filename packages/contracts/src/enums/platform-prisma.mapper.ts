/**
 * Domain `Platform` / `CredentialPlatform` stay product-lowercase (OAuth/UI/posts).
 * Prisma `credentials.platform` is the SCREAMING_SNAKE enum `CredentialPlatform`
 * (with the intentional exception `DEVTO`, not `DEV_TO`).
 *
 * Always map at the credential read/write boundary. Do not write domain lowercase
 * into `prisma.credential.findFirst({ where: { platform } })` and do not
 * invent dual status maps for String columns like `posts.platform`.
 *
 * @see packages/prisma/prisma/schema.prisma `enum CredentialPlatform`
 * @see packages/contracts/src/enums/platform.enum.ts
 * @see .agents/memory/rules/enum_source_of_truth.md
 */
import { Platform } from './platform.enum';
import { parsePlatform } from './platform.util';

/**
 * Postgres / Prisma `CredentialPlatform` labels.
 * Kept as string literals so `@genfeedai/contracts` does not depend on `@genfeedai/prisma`.
 */
export const PRISMA_CREDENTIAL_PLATFORM_VALUES = [
  'YOUTUBE',
  'INSTAGRAM',
  'TIKTOK',
  'FACEBOOK',
  'GOOGLE_ADS',
  'GOOGLE_SEARCH_CONSOLE',
  'TWITTER',
  'X_ADS',
  'LINKEDIN',
  'PINTEREST',
  'REDDIT',
  'DISCORD',
  'TELEGRAM',
  'TWITCH',
  'MEDIUM',
  'THREADS',
  'FANVUE',
  'SLACK',
  'WORDPRESS',
  'SNAPCHAT',
  'WHATSAPP',
  'MASTODON',
  'GHOST',
  'SHOPIFY',
  'BEEHIIV',
  'UNIPILE',
  'DEVTO',
  'RESTREAM',
] as const;

export type PrismaCredentialPlatformValue =
  (typeof PRISMA_CREDENTIAL_PLATFORM_VALUES)[number];

/** Alias used in agent docs / call sites that say "CredentialPlatformValue". */
export type CredentialPlatformValue = PrismaCredentialPlatformValue;

const PRISMA_CREDENTIAL_PLATFORM_SET = new Set<string>(
  PRISMA_CREDENTIAL_PLATFORM_VALUES,
);

/**
 * Domain product ids that are not credential platforms (no Prisma enum member).
 * Rejected by {@link toPrismaCredentialPlatform}.
 */
const DOMAIN_ONLY_PLATFORMS = new Set<string>([
  Platform.PRODUCT_HUNT,
  Platform.HACKER_NEWS,
]);

/**
 * Normalize free text into a Prisma `CredentialPlatform` label.
 *
 * Accepts:
 * - domain lowercase (`instagram`, `devto`)
 * - Prisma SCREAMING (`INSTAGRAM`, `DEVTO`)
 * - aliases via {@link parsePlatform} (`x` → TWITTER, `meta` → FACEBOOK)
 * - hyphen/underscore variants (`google-ads` → GOOGLE_ADS, `dev_to` → DEVTO)
 *
 * Returns `undefined` for null/empty/unknown — never throws, never forces a cast.
 * (Spelling the forbidden cast out here would trip `check:type-assertions`,
 * which matches raw lines including comments.)
 */
export function toPrismaCredentialPlatform(
  input: string | null | undefined,
): PrismaCredentialPlatformValue | undefined {
  if (typeof input !== 'string') {
    return undefined;
  }

  const trimmed = input.trim();
  if (!trimmed) {
    return undefined;
  }

  // Already a valid Prisma label (incl. DEVTO).
  if (PRISMA_CREDENTIAL_PLATFORM_SET.has(trimmed)) {
    return trimmed as PrismaCredentialPlatformValue;
  }

  // Domain aliases first (x → twitter, meta → facebook).
  const parsed = parsePlatform(trimmed);
  const base = (parsed ?? trimmed).trim().toLowerCase().replace(/-/g, '_');

  if (!base || DOMAIN_ONLY_PLATFORMS.has(base)) {
    return undefined;
  }

  // Domain Platform.DEV_TO = 'devto'; free text often uses 'dev_to' / 'DEV_TO'.
  // Prisma stores DEVTO (no underscore).
  if (base === 'devto' || base === 'dev_to') {
    return 'DEVTO';
  }

  const candidate = base.toUpperCase();
  if (!PRISMA_CREDENTIAL_PLATFORM_SET.has(candidate)) {
    return undefined;
  }

  return candidate as PrismaCredentialPlatformValue;
}

/**
 * Map a Prisma `CredentialPlatform` label back to domain {@link Platform}.
 * Unknown / non-credential values return `undefined` (never invent a dual map).
 */
export function fromPrismaCredentialPlatform(
  value: string | null | undefined,
): Platform | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }

  if (trimmed === 'DEVTO' || trimmed.toLowerCase() === 'devto') {
    return Platform.DEV_TO;
  }

  // Prefer parsePlatform so SCREAMING and lowercase both land on domain values.
  const parsed = parsePlatform(trimmed);
  if (parsed && !DOMAIN_ONLY_PLATFORMS.has(parsed)) {
    // Only return if the platform exists as a Prisma credential platform
    // (or would, for domain-only rejects above).
    if (toPrismaCredentialPlatform(parsed)) {
      return parsed;
    }
  }

  // Direct SCREAMING → lowercase when parsePlatform missed (shouldn't for known set).
  const lower = trimmed.toLowerCase();
  if (isPlatformValue(lower) && toPrismaCredentialPlatform(lower)) {
    return lower as Platform;
  }

  return undefined;
}

function isPlatformValue(value: string): value is Platform {
  return (Object.values(Platform) as string[]).includes(value);
}

export function isPrismaCredentialPlatform(
  value: unknown,
): value is PrismaCredentialPlatformValue {
  return typeof value === 'string' && PRISMA_CREDENTIAL_PLATFORM_SET.has(value);
}
