import { ANONYMISER_TOKEN_PATTERN } from './golden-set.constants';
import type {
  AnonymisationContext,
  GoldenSetScopeSnapshot,
  PreparedTerm,
  ResidualCategory,
} from './golden-set.types';

function compareCodePoints(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function prepareTerms(context: AnonymisationContext): PreparedTerm[] {
  const groups = new Map<string, [Set<string>, boolean]>();
  function add(
    term: string,
    brandFixtureId: string | null,
    isOrganization: boolean,
  ): void {
    const normalized = term.trim().replace(/^@/, '').toLowerCase();
    const variants = normalized.includes('-')
      ? [normalized, normalized.replace(/-/g, ' ')]
      : [normalized];
    for (const variant of variants) {
      if (variant.length < 3) continue;
      const group: [Set<string>, boolean] = groups.get(variant) ?? [
        new Set<string>(),
        false,
      ];
      if (brandFixtureId !== null) group[0].add(brandFixtureId);
      group[1] = group[1] || isOrganization;
      groups.set(variant, group);
    }
  }
  for (const entry of context.brandTerms)
    add(entry.term, entry.brandFixtureId, false);
  for (const term of context.organizationTerms) add(term, null, true);
  for (const term of context.personTerms) add(term, null, false);
  return Array.from(groups, ([term, [brandIds, isOrganization]]) => ({
    term,
    token:
      brandIds.size === 1
        ? (brandIds.values().next().value ?? '[organization]')
        : brandIds.size > 1 || isOrganization
          ? '[organization]'
          : '[person]',
  })).sort(
    (left, right) =>
      right.term.length - left.term.length ||
      compareCodePoints(left.term, right.term),
  );
}

function buildRules(
  context: AnonymisationContext,
  isDetector: boolean,
): Array<[RegExp, string, ResidualCategory]> {
  const ids = [
    ...new Set(
      context.knownIds.map((id) => id.trim()).filter((id) => id.length > 0),
    ),
  ].sort(
    (left, right) =>
      right.length - left.length || compareCodePoints(left, right),
  );
  const rules: Array<[RegExp, string, ResidualCategory]> = ids.map((id) => [
    new RegExp(escapeRegExp(id), 'g'),
    '[id]',
    'id',
  ]);
  rules.push(
    [/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, '[email]', 'email'],
    [
      /\b(?:https?:\/\/|www\.)[^\s<>"'()[\]]*[^\s<>"'()[\].,!?;:]/gi,
      '[url]',
      'url',
    ],
    [
      /(?<![\p{L}\p{N}_@/])@[A-Za-z0-9_](?:[A-Za-z0-9_.]*[A-Za-z0-9_])?/gu,
      '[handle]',
      'handle',
    ],
    [
      /\b(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+(?:com|net|org|io|ai|co|app|dev|shop|store|me|tv|fm|xyz|uk|de|fr|eu|us|ca|au|example)\b(?:\/[^\s<>"'()[\]]*[^\s<>"'()[\].,!?;:])?/gi,
      '[url]',
      'url',
    ],
  );
  for (const { term, token } of prepareTerms(context)) {
    rules.push([
      new RegExp(
        `(?<![\\p{L}\\p{N}_])${escapeRegExp(term)}(?![\\p{L}\\p{N}_])`,
        'giu',
      ),
      token,
      token.startsWith('brand-')
        ? 'brand'
        : token === '[organization]'
          ? 'organization'
          : 'person',
    ]);
  }
  if (!isDetector)
    rules.push([
      /\b(?:Mr|Mrs|Ms|Mx|Dr|Prof)\.?\s+\p{Lu}[\p{L}'-]+(?:\s+\p{Lu}[\p{L}'-]+)?/gu,
      '[person]',
      'person',
    ]);
  rules.push(
    [/\bc[a-z0-9]{24}\b/g, '[id]', 'id'],
    [
      /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi,
      '[id]',
      'id',
    ],
    [/\b[0-9a-f]{24}\b/gi, '[id]', 'id'],
  );
  return rules;
}

function collectClaims(
  text: string,
  context: AnonymisationContext,
  isDetector: boolean,
  categories?: Set<ResidualCategory>,
): Array<[number, number, string, ResidualCategory | null]> {
  let claims: Array<[number, number, string, ResidualCategory | null]> = [];
  if (isDetector) {
    for (const match of text.matchAll(new RegExp(ANONYMISER_TOKEN_PATTERN))) {
      claims.push([match.index, match.index + match[0].length, match[0], null]);
    }
  }
  for (const [pattern, token, category] of buildRules(context, isDetector)) {
    for (const match of text.matchAll(pattern)) {
      const start = match.index;
      const end = start + match[0].length;
      const hasPartialOverlap = claims.some(
        ([claimStart, claimEnd]) =>
          claimStart < end &&
          start < claimEnd &&
          !(start <= claimStart && claimEnd <= end),
      );
      if (hasPartialOverlap) continue;
      claims = claims.filter(
        ([claimStart, claimEnd]) => !(start <= claimStart && claimEnd <= end),
      );
      claims.push([start, end, token, category]);
      categories?.add(category);
    }
  }
  return claims.sort(([left], [right]) => left - right);
}

export function anonymiseText(
  text: string,
  context: AnonymisationContext,
): string {
  let output = '';
  let cursor = 0;
  for (const [start, end, token] of collectClaims(text, context, false)) {
    output += text.slice(cursor, start) + token;
    cursor = end;
  }
  return output + text.slice(cursor);
}

export function findResidualIdentifiers(
  text: string,
  context: AnonymisationContext,
): ResidualCategory[] {
  const categories = new Set<ResidualCategory>();
  collectClaims(text, context, true, categories);
  return [...categories].sort(compareCodePoints);
}

function readRecord(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function readTerm(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0
    ? value.trim()
    : null;
}

export function buildAnonymisationContext(
  snapshot: GoldenSetScopeSnapshot,
  brandFixtureIdsByBrandId: ReadonlyMap<string, string>,
): AnonymisationContext {
  const context: AnonymisationContext = {
    knownIds: [
      snapshot.organization.id,
      ...snapshot.brands.map((brand) => brand.id),
    ],
    brandTerms: [],
    organizationTerms: [],
    personTerms: [],
  };
  const brandIds = new Set(snapshot.brands.map((brand) => brand.id));
  function addOwnedTerm(value: unknown, brandId: unknown): void {
    const term = readTerm(value);
    if (term === null) return;
    const brandFixtureId =
      typeof brandId === 'string' && brandIds.has(brandId)
        ? brandFixtureIdsByBrandId.get(brandId)
        : undefined;
    if (brandFixtureId !== undefined)
      context.brandTerms.push({ term, brandFixtureId });
    else context.organizationTerms.push(term);
  }
  for (const value of [snapshot.organization.label, snapshot.organization.slug])
    addOwnedTerm(value, null);
  for (const brand of snapshot.brands) {
    for (const value of [brand.label, brand.slug])
      addOwnedTerm(value, brand.id);
  }
  for (const credential of snapshot.credentials) {
    for (const value of [
      credential.externalHandle,
      credential.externalName,
      credential.username,
    ])
      addOwnedTerm(value, credential.brandId);
  }
  for (const profile of snapshot.profiles) {
    const data = readRecord(profile.data);
    const handles: unknown[] = Array.isArray(data.handles)
      ? data.handles
      : Object.values(readRecord(data.handles));
    for (const handle of handles) addOwnedTerm(handle, data.brandId);
  }
  for (const { user } of snapshot.members) {
    for (const value of [
      user.firstName,
      user.lastName,
      user.name,
      user.handle,
    ]) {
      const term = readTerm(value);
      if (term !== null) context.personTerms.push(term);
    }
    const firstName = readTerm(user.firstName);
    const lastName = readTerm(user.lastName);
    if (firstName !== null && lastName !== null)
      context.personTerms.push(`${firstName} ${lastName}`);
  }
  for (const records of [
    snapshot.posts,
    snapshot.batchItems,
    snapshot.evaluations,
    snapshot.newsletters,
    snapshot.profiles,
    snapshot.contextBases,
    snapshot.contextEntries,
    snapshot.linkedPosts,
    snapshot.linkedArticles,
    snapshot.linkedNewsletters,
    snapshot.linkedBatchItems,
    snapshot.threadChildren,
  ]) {
    for (const record of records) {
      const id = readTerm(record.id);
      if (id !== null) context.knownIds.push(id);
    }
  }
  context.knownIds = [
    ...new Set(
      context.knownIds.map(readTerm).filter((id): id is string => id !== null),
    ),
  ].sort(
    (left, right) =>
      right.length - left.length || compareCodePoints(left, right),
  );
  context.brandTerms.sort(
    (left, right) =>
      compareCodePoints(left.term, right.term) ||
      compareCodePoints(left.brandFixtureId, right.brandFixtureId),
  );
  context.organizationTerms = [...new Set(context.organizationTerms)].sort(
    compareCodePoints,
  );
  context.personTerms = [...new Set(context.personTerms)].sort(
    compareCodePoints,
  );
  return context;
}
