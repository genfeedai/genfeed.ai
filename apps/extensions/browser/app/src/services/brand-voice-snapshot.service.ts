import {
  type NativeHostVoiceSnapshotV1,
  nativeHostVoiceSnapshotV1Schema,
} from '@genfeedai/contracts/api-types/contracts/native-host.contract';
import { NATIVE_HOST_VOICE_LIMITS } from '@genfeedai/contracts/constants';
import type { ExtensionWorkspaceSnapshot } from '@genfeedai/contracts/interfaces';
import type { LocalVoiceSource } from '@genfeedai/contracts/interfaces/extension/extension-action-routing.interface';
import { HttpRequestError } from '~services/http-request-error';
import {
  assertWorkspace,
  scopedWorkspaceRequest,
} from '~services/workspace.service';
import { logger } from '~utils/logger.util';

const CACHE_KEY_PREFIX = 'genfeed-voice-snapshot:';
const CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const REFRESH_INTERVAL_MS = 60 * 60 * 1000;
const LIVE_TIMEOUT_MS = 5_000;
const NO_APPROVED_VOICE = 'brand_identity_unavailable';

/** The brand voice could not be read and no recent copy exists, so a local run must not guess. */
export class VoiceUnavailableError extends Error {
  constructor() {
    super(
      'Genfeed could not load your approved brand voice, so nothing was written locally. Retry when Genfeed is reachable.',
    );
    this.name = 'VoiceUnavailableError';
  }
}

export interface LocalVoice {
  savedAt: string | null;
  snapshot: NativeHostVoiceSnapshotV1 | null;
  source: LocalVoiceSource;
}

interface CachedVoice {
  savedAt: number;
  snapshot: unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function text(value: unknown, max: number): string | undefined {
  return typeof value === 'string' && value.trim()
    ? value.trim().slice(0, max)
    : undefined;
}

function textList(value: unknown, maxItems: number, max: number): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => text(item, max))
    .filter((item): item is string => item !== undefined)
    .slice(0, maxItems);
}

function appliesToText(rule: Record<string, unknown>): boolean {
  const kinds = rule.appliesToMediaKinds;
  return !Array.isArray(kinds) || kinds.includes('text');
}

function ruleTexts(rules: unknown, max: number, maxItems: number): string[] {
  if (!Array.isArray(rules)) return [];
  return rules
    .filter(isRecord)
    .filter(appliesToText)
    .map((rule) => text(rule.text, max))
    .filter((item): item is string => item !== undefined)
    .slice(0, maxItems);
}

function factText(
  rule: Record<string, unknown>,
  max: number,
): string | undefined {
  const subject = text(rule.subject, 120);
  const predicate = text(rule.predicate, 120);
  const value =
    typeof rule.value === 'string' ||
    typeof rule.value === 'number' ||
    typeof rule.value === 'boolean'
      ? String(rule.value)
      : undefined;
  if (!subject || !predicate || value === undefined) return undefined;
  const unit = text(rule.unit, 24);
  return `${subject} ${predicate}: ${value}${unit ? ` ${unit}` : ''}`.slice(
    0,
    max,
  );
}

/**
 * The text-relevant part of the approved brand identity, bounded for the host.
 * Anything not approved, or that does not fit the protocol, projects to null.
 */
export function projectVoiceSnapshot(
  raw: unknown,
): NativeHostVoiceSnapshotV1 | null {
  if (!isRecord(raw) || raw.approval !== 'approved') return null;
  const limits = NATIVE_HOST_VOICE_LIMITS;
  const identity = isRecord(raw.identity) ? raw.identity : {};
  const voice = isRecord(raw.voice) ? raw.voice : {};
  const rules = isRecord(raw.generationRules) ? raw.generationRules : {};
  const facts = Array.isArray(rules.facts)
    ? rules.facts
        .filter(isRecord)
        .filter(appliesToText)
        .sort(
          (a, b) => Number(b.required === true) - Number(a.required === true),
        )
        .map((rule) => factText(rule, limits.listItemChars))
        .filter((item): item is string => item !== undefined)
        .slice(0, limits.ruleItems)
    : [];
  const examples = Array.isArray(rules.examples)
    ? rules.examples
        .filter(isRecord)
        .map((example) => ({
          polarity: example.polarity === 'negative' ? 'negative' : 'positive',
          text: text(example.text, limits.examplesChars),
        }))
        .filter(
          (
            example,
          ): example is { polarity: 'negative' | 'positive'; text: string } =>
            example.text !== undefined,
        )
        .slice(0, limits.examples)
    : [];
  const candidate = {
    brandId: text(raw.brandId, 128),
    contentHash: text(raw.contentHash, 128),
    identity: {
      description: text(identity.description, limits.identityChars),
      language: text(identity.language, 64),
      name: text(identity.name, limits.nameChars),
      positioning: text(identity.positioning, limits.identityChars),
    },
    resolvedAt: text(raw.resolvedAt, 64),
    revisionId: text(raw.revisionId, 128),
    rules: {
      avoid: ruleTexts(rules.avoid, limits.listItemChars, limits.ruleItems),
      examples,
      facts,
      mandatory: ruleTexts(
        rules.mandatory,
        limits.listItemChars,
        limits.ruleItems,
      ),
    },
    schemaVersion: 1,
    voice: {
      audience: textList(
        voice.audience,
        limits.listItems,
        limits.listItemChars,
      ),
      avoid: textList(voice.avoid, limits.listItems, limits.listItemChars),
      guidelines: text(voice.guidelines, limits.guidelinesChars),
      messagingPillars: textList(
        voice.messagingPillars,
        limits.listItems,
        limits.listItemChars,
      ),
      sample: text(voice.sample, limits.sampleChars),
      style: text(voice.style, limits.identityChars),
      tone: text(voice.tone, limits.identityChars),
      values: textList(voice.values, limits.listItems, limits.listItemChars),
    },
  };
  const parsed = nativeHostVoiceSnapshotV1Schema.safeParse(candidate);
  return parsed.success ? parsed.data : null;
}

function cacheKey(workspace: ExtensionWorkspaceSnapshot): string {
  return `${CACHE_KEY_PREFIX}${workspace.userId}:${workspace.organizationId}:${workspace.brandId}`;
}

async function readCache(
  workspace: ExtensionWorkspaceSnapshot,
): Promise<{ savedAt: number; snapshot: NativeHostVoiceSnapshotV1 } | null> {
  const key = cacheKey(workspace);
  const stored = (await chrome.storage.local.get(key))[key] as
    | CachedVoice
    | undefined;
  if (
    !stored ||
    typeof stored.savedAt !== 'number' ||
    Date.now() - stored.savedAt > CACHE_MAX_AGE_MS
  )
    return null;
  const parsed = nativeHostVoiceSnapshotV1Schema.safeParse(stored.snapshot);
  // A copy for another brand is never used, whatever the key says.
  return parsed.success && parsed.data.brandId === workspace.brandId
    ? { savedAt: stored.savedAt, snapshot: parsed.data }
    : null;
}

async function writeCache(
  workspace: ExtensionWorkspaceSnapshot,
  snapshot: NativeHostVoiceSnapshotV1 | null,
): Promise<void> {
  const key = cacheKey(workspace);
  if (snapshot) {
    await chrome.storage.local.set({
      [key]: { savedAt: Date.now(), snapshot } satisfies CachedVoice,
    });
  } else {
    await chrome.storage.local.remove(key);
  }
}

/**
 * Reads the approved brand voice from Genfeed. `null` means the brand has no
 * approved voice; a sign-in or access failure throws so it is recovered, not
 * worked around; anything else throws VoiceUnavailableError.
 */
async function fetchLiveVoice(
  workspace: ExtensionWorkspaceSnapshot,
): Promise<NativeHostVoiceSnapshotV1 | null> {
  if (!workspace.brandId) throw new VoiceUnavailableError();
  let response: Response;
  try {
    response = await scopedWorkspaceRequest(
      `/brands/${encodeURIComponent(workspace.brandId)}/generation-receipts/identity-preview`,
      { method: 'GET', signal: AbortSignal.timeout(LIVE_TIMEOUT_MS) },
      workspace,
    );
  } catch (error) {
    if (
      error instanceof TypeError ||
      (error instanceof DOMException && error.name === 'TimeoutError')
    ) {
      throw new VoiceUnavailableError();
    }
    throw error;
  }
  if (response.status === 401 || response.status === 403) {
    throw new HttpRequestError(
      'Genfeed did not authorize reading this brand voice. Open Genfeed and check your access.',
      response.status === 401 ? 'unauthorized' : 'http',
      response.status,
    );
  }
  const body: unknown = await response.json().catch(() => null);
  if (
    response.status === 409 &&
    JSON.stringify(body).includes(NO_APPROVED_VOICE)
  ) {
    assertWorkspace(workspace);
    return null;
  }
  const attributes =
    isRecord(body) && isRecord(body.data) && isRecord(body.data.attributes)
      ? body.data.attributes
      : null;
  const snapshot =
    response.ok && attributes
      ? projectVoiceSnapshot(attributes.snapshot)
      : null;
  assertWorkspace(workspace);
  if (!snapshot) throw new VoiceUnavailableError();
  return snapshot;
}

/**
 * The brand voice for a local run: live from Genfeed, else a copy under a day
 * old for the same user, workspace and brand, else the run stops. A brand with
 * no approved voice runs without one, as the cloud action does.
 */
export async function loadLocalVoice(
  workspace: ExtensionWorkspaceSnapshot,
): Promise<LocalVoice> {
  try {
    const snapshot = await fetchLiveVoice(workspace);
    await writeCache(workspace, snapshot).catch((error: unknown) =>
      logger.warn('Could not cache the brand voice', error),
    );
    return snapshot
      ? { savedAt: null, snapshot, source: 'live' }
      : { savedAt: null, snapshot: null, source: 'none' };
  } catch (error) {
    if (!(error instanceof VoiceUnavailableError)) throw error;
    const cached = await readCache(workspace).catch(() => null);
    if (!cached) throw error;
    return {
      savedAt: new Date(cached.savedAt).toISOString(),
      snapshot: cached.snapshot,
      source: 'cached',
    };
  }
}

const lastRefreshAt = new Map<string, number>();

/**
 * Keeps a recent copy of the approved voice while Genfeed is reachable, so a
 * later outage can still be answered in the brand voice. Best effort.
 */
export async function refreshLocalVoiceCache(
  workspace: ExtensionWorkspaceSnapshot,
): Promise<void> {
  const key = cacheKey(workspace);
  if (Date.now() - (lastRefreshAt.get(key) ?? 0) < REFRESH_INTERVAL_MS) return;
  lastRefreshAt.set(key, Date.now());
  try {
    await writeCache(workspace, await fetchLiveVoice(workspace));
  } catch (error) {
    lastRefreshAt.delete(key);
    logger.warn('Could not refresh the brand voice copy', error);
  }
}
