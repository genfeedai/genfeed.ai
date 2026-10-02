import type { ExtensionWorkspaceSnapshot } from '@genfeedai/contracts/interfaces';
import type { ExtensionPublicationCaptureResult } from '@genfeedai/contracts/interfaces/content/extension-publication.interface';
import type {
  PublicationCaptureConfirmed,
  PublicationCaptureObservation,
  PublicationCaptureOutboxEntry,
  PublicationCapturePending,
  PublicationCaptureReply,
  PublicationCaptureScope,
  PublicationCaptureSenderBinding,
} from '@genfeedai/contracts/interfaces/extension/extension-publication-observer.interface';
import { apiEndpoint } from '~services/environment.service';
import {
  publicationCaptureBody as body,
  publicationCaptureHandle as handle,
  publicationCaptureHomeUrl as home,
  publicationCaptureKeys as keys,
  publicationCaptureNumericId as numeric,
  publicationCaptureRecord as object,
  parsePublicationCaptureAttempt as parseAttempt,
  parsePublicationCaptureObservation as parseObservation,
  samePublicationCaptureScope as same,
  parsePublicationCaptureScope as scope,
  publicationCaptureText as text,
  publicationCaptureUuid as uuid,
  validPublicationCaptureObservation as validObservation,
} from '~services/publication-capture-validation';
import {
  assertWorkspace,
  getWorkspaceState,
  requireWorkspace,
  scopedWorkspaceRequest,
  subscribeWorkspace,
} from '~services/workspace.service';

const PENDING = 'genfeed-publication-pending-v1';
const OUTBOX = 'genfeed-publication-outbox-v1';
const SETTINGS = 'genfeed-settings';
const CONFIRMED = 'genfeed-publication-confirmed-v1';
const confirmedMemory = new Map<string, PublicationCaptureConfirmed>();
const RETAIN =
  'Could not save this recording. Keep this tab open and select Retry recording. Closing the browser may lose it.';
const UNAVAILABLE =
  'Recording is not available on this server yet. Retry after Genfeed is updated.';
const FAILED = 'Published on X; recording failed. Retry in Genfeed Settings.';
let queue: Promise<unknown> = Promise.resolve();
const inFlight = new Map<string, Promise<PublicationCaptureReply>>();
function serial<T>(operation: () => Promise<T>): Promise<T> {
  const next = queue.then(operation);
  queue = next.catch(() => undefined);
  return next;
}
async function enabled(): Promise<boolean> {
  const result = await chrome.storage.local.get(SETTINGS);
  const value = object(result[SETTINGS]);
  return typeof value?.recordOwnPublications === 'boolean'
    ? value.recordOwnPublications
    : true;
}
async function current(): Promise<ExtensionWorkspaceSnapshot> {
  if (getWorkspaceState().status !== 'ready')
    throw new Error(
      'Select a verified Genfeed workspace to record this publication',
    );
  const snapshot = await requireWorkspace();
  if (!snapshot.brandId)
    throw new Error(
      'Select a verified Genfeed workspace to record this publication',
    );
  return snapshot;
}
function currentScope(
  snapshot: ExtensionWorkspaceSnapshot,
): PublicationCaptureScope {
  return {
    userId: snapshot.userId,
    organizationId: snapshot.organizationId,
    brandId: snapshot.brandId ?? '',
    revision: snapshot.revision,
  };
}
async function pendingEntries(): Promise<
  Record<string, PublicationCapturePending>
> {
  const result = await chrome.storage.session.get(PENDING);
  if (result[PENDING] === undefined) return {};
  const raw = object(result[PENDING]);
  if (!raw)
    throw new Error(
      'Could not read publication recordings. Existing storage has been preserved.',
    );
  const entries: Record<string, PublicationCapturePending> = {};
  for (const [id, value] of Object.entries(raw)) {
    const v = object(value);
    const attempt = parseAttempt(v?.attempt);
    if (
      !/^\d+$/.test(id) ||
      !v ||
      !keys(v, ['tabId', 'origin', 'attempt']) ||
      v.tabId !== Number(id) ||
      !text(v.origin) ||
      !attempt ||
      home(attempt.documentUrl)?.origin !== v.origin
    )
      throw new Error(
        'Could not read publication recordings. Existing storage has been preserved.',
      );
    entries[id] = { tabId: Number(id), origin: v.origin, attempt };
  }
  return entries;
}
function senderBinding(value: unknown): PublicationCaptureSenderBinding | null {
  const v = object(value);
  if (
    !v ||
    !keys(v, ['tabId', 'origin']) ||
    typeof v.tabId !== 'number' ||
    !Number.isSafeInteger(v.tabId) ||
    v.tabId < 0 ||
    !text(v.origin)
  )
    return null;
  const origin = home(`${v.origin}/home`);
  if (!origin || origin.origin !== v.origin) return null;
  return { tabId: v.tabId, origin: v.origin };
}
function bound(
  left: PublicationCaptureSenderBinding,
  right: PublicationCaptureSenderBinding,
): boolean {
  return left.tabId === right.tabId && left.origin === right.origin;
}
function equalObservation(
  left: PublicationCaptureObservation,
  right: PublicationCaptureObservation,
): boolean {
  return (
    left.attemptId === right.attemptId &&
    left.externalId === right.externalId &&
    left.url === right.url &&
    left.authorHandle === right.authorHandle &&
    left.description === right.description &&
    left.publicationDate === right.publicationDate
  );
}
async function confirmedEntries(): Promise<
  Record<string, PublicationCaptureConfirmed>
> {
  const result = await chrome.storage.session.get(CONFIRMED);
  const raw = result[CONFIRMED] === undefined ? {} : object(result[CONFIRMED]);
  if (!raw)
    throw new Error(
      'Could not read publication recordings. Existing storage has been preserved.',
    );
  const entries: Record<string, PublicationCaptureConfirmed> = {};
  for (const [id, value] of Object.entries(raw)) {
    const v = object(value);
    const binding = senderBinding(v?.binding);
    const attempt = parseAttempt(v?.attempt);
    const observation = parseObservation(v?.observation);
    if (
      !v ||
      !keys(v, ['binding', 'attempt', 'observation', 'observedAt']) ||
      !binding ||
      !attempt ||
      !observation ||
      id !== attempt.id ||
      home(attempt.documentUrl)?.origin !== binding.origin ||
      typeof v.observedAt !== 'number' ||
      !Number.isFinite(v.observedAt) ||
      v.observedAt < attempt.startedAt ||
      v.observedAt > attempt.startedAt + 60000 ||
      !validObservation(attempt, observation, v.observedAt)
    )
      throw new Error(
        'Could not read publication recordings. Existing storage has been preserved.',
      );
    entries[id] = { binding, attempt, observation, observedAt: v.observedAt };
  }
  for (const [id, item] of confirmedMemory) entries[id] = item;
  for (const [id, item] of Object.entries(entries))
    confirmedMemory.set(id, item);
  return entries;
}
function entryFromConfirmed(
  item: PublicationCaptureConfirmed,
): PublicationCaptureOutboxEntry {
  return {
    id: item.attempt.id,
    sourceBinding: item.binding,
    scope: item.attempt.scope,
    input: {
      brandId: item.attempt.scope.brandId,
      platform: 'twitter',
      publicationKind: 'post',
      description: item.attempt.description,
      publicationDate: item.observation.publicationDate,
      url: item.observation.url,
      externalId: item.observation.externalId,
      author: { handle: item.attempt.authorHandle },
      observedVisibility: 'unknown',
    },
    createdAt: item.observedAt,
    status: 'queued',
  };
}
function entryMatches(
  entry: PublicationCaptureOutboxEntry,
  observation: PublicationCaptureObservation,
): boolean {
  return (
    entry.id === observation.attemptId &&
    entry.input.externalId === observation.externalId &&
    entry.input.url === observation.url &&
    entry.input.description === observation.description &&
    entry.input.publicationDate === observation.publicationDate &&
    entry.input.author?.handle === observation.authorHandle
  );
}
async function removeConfirmed(id: string): Promise<void> {
  const entries = await confirmedEntries();
  delete entries[id];
  await chrome.storage.session.set({ [CONFIRMED]: entries });
  confirmedMemory.delete(id);
}
async function promote(
  item: PublicationCaptureConfirmed,
  entries: PublicationCaptureOutboxEntry[],
): Promise<PublicationCaptureOutboxEntry> {
  const next = entryFromConfirmed(item);
  try {
    await chrome.storage.local.set({ [OUTBOX]: [...entries, next] });
  } catch {
    // Keep the exact accepted observation even if neither storage area can write.
    const recovery = await confirmedEntries();
    recovery[next.id] = item;
    try {
      await chrome.storage.session.set({ [CONFIRMED]: recovery });
    } catch {
      /* In-memory recovery remains explicitly unsaved. */
    }
    throw new Error(RETAIN);
  }
  const pending = await pendingEntries();
  if (pending[String(item.binding.tabId)]?.attempt.id === next.id)
    delete pending[String(item.binding.tabId)];
  try {
    await chrome.storage.session.set({ [PENDING]: pending });
  } catch {
    /* Local outbox already owns this observation. */
  }
  try {
    await removeConfirmed(next.id);
  } catch {
    /* Existing confirmed recovery is replay-safe; local outbox takes precedence. */
  }
  return next;
}
async function outboxEntries(): Promise<PublicationCaptureOutboxEntry[]> {
  const result = await chrome.storage.local.get(OUTBOX);
  if (result[OUTBOX] === undefined) return [];
  if (!Array.isArray(result[OUTBOX]))
    throw new Error(
      'Could not read publication recordings. Existing storage has been preserved.',
    );
  const entries: PublicationCaptureOutboxEntry[] = [];
  for (const value of result[OUTBOX]) {
    const v = object(value);
    const s = scope(v?.scope);
    const input = object(v?.input);
    const author = object(input?.author);
    if (
      !v ||
      !keys(v, [
        'id',
        'scope',
        'input',
        'createdAt',
        'status',
        'error',
        'sourceBinding',
      ]) ||
      !senderBinding(v.sourceBinding) ||
      !uuid(v.id) ||
      !s ||
      !input ||
      !keys(input, [
        'brandId',
        'platform',
        'publicationKind',
        'url',
        'externalId',
        'description',
        'publicationDate',
        'author',
        'observedVisibility',
      ]) ||
      input.brandId !== s.brandId ||
      input.platform !== 'twitter' ||
      input.publicationKind !== 'post' ||
      !text(input.url) ||
      !numeric(input.externalId) ||
      !body(input.description) ||
      !text(input.publicationDate, 64) ||
      !Number.isFinite(Date.parse(input.publicationDate)) ||
      !author ||
      !keys(author, ['handle']) ||
      !handle(author.handle) ||
      input.observedVisibility !== 'unknown' ||
      !validObservation(
        {
          id: v.id,
          scope: s,
          startedAt: Date.parse(String(input.publicationDate)),
          documentUrl: `${senderBinding(v.sourceBinding)?.origin}/home`,
          authorHandle: String(author.handle).toLowerCase(),
          description: String(input.description),
          baselineIds: [],
        },
        {
          attemptId: v.id,
          externalId: String(input.externalId),
          url: String(input.url),
          authorHandle: String(author.handle).toLowerCase(),
          description: String(input.description),
          publicationDate: String(input.publicationDate),
        },
        Date.parse(String(input.publicationDate)),
      ) ||
      typeof v.createdAt !== 'number' ||
      !Number.isFinite(v.createdAt) ||
      !['queued', 'recording', 'failed'].includes(String(v.status)) ||
      (v.error !== undefined && !text(v.error, 512)) ||
      entries.some((entry) => entry.id === v.id)
    )
      throw new Error(
        'Could not read publication recordings. Existing storage has been preserved.',
      );
    const status =
      v.status === 'recording' && !inFlight.has(v.id) ? 'queued' : v.status;
    if (status !== 'queued' && status !== 'recording' && status !== 'failed')
      throw new Error('Invalid recording storage.');
    entries.push({
      id: v.id,
      sourceBinding: senderBinding(
        v.sourceBinding,
      ) as PublicationCaptureSenderBinding,
      scope: s,
      input: {
        brandId: s.brandId,
        platform: 'twitter',
        publicationKind: 'post',
        url: input.url,
        externalId: input.externalId,
        description: input.description,
        publicationDate: input.publicationDate,
        author: { handle: author.handle },
        observedVisibility: 'unknown',
      },
      createdAt: v.createdAt,
      status,
      ...(typeof v.error === 'string' ? { error: v.error } : {}),
    });
  }
  return entries;
}
function result(value: unknown): ExtensionPublicationCaptureResult | null {
  const v = object(value);
  if (
    !v ||
    !text(v.postId, 255) ||
    typeof v.created !== 'boolean' ||
    !['permalink', 'context-only', 'unavailable'].includes(String(v.urlKind)) ||
    ![
      'eligible',
      'missing-external-id',
      'missing-credential',
      'unsupported-platform',
      'unsupported-publication-kind',
      'provider-id-unresolved',
    ].includes(String(v.analyticsAvailability)) ||
    !['public', 'private', 'unlisted', 'unknown'].includes(
      String(v.observedVisibility),
    )
  )
    return null;
  for (const key of [
    'source',
    'externalId',
    'url',
    'contextUrl',
    'credentialId',
  ])
    if (v[key] !== null && typeof v[key] !== 'string') return null;
  const identity = object(v.urlIdentity);
  if (
    v.urlIdentity !== null &&
    (!identity ||
      ![
        'instagram-shortcode',
        'linkedin-activity',
        'facebook-post-token',
        'platform-publication-id',
      ].includes(String(identity.kind)) ||
      !text(identity.value))
  )
    return null;
  // Every API field has been structurally validated; retain the original source on replay.
  return v as unknown as ExtensionPublicationCaptureResult;
}
async function record(
  entry: PublicationCaptureOutboxEntry,
  snapshot: ExtensionWorkspaceSnapshot,
): Promise<PublicationCaptureReply> {
  const existing = inFlight.get(entry.id);
  if (existing) return existing;
  const operation = (async (): Promise<PublicationCaptureReply> => {
    try {
      await serial(async () => {
        if (!(await enabled()))
          throw new Error('Publication recording is disabled.');
        assertWorkspace(snapshot);
        const entries = await outboxEntries();
        const found = entries.find((item) => item.id === entry.id);
        if (!found || !same(found.scope, currentScope(snapshot), false))
          throw new Error('This recording belongs to another workspace.');
        found.status = 'recording';
        delete found.error;
        await chrome.storage.local.set({ [OUTBOX]: entries });
      });
      assertWorkspace(snapshot);
      const response = await scopedWorkspaceRequest(
        `${apiEndpoint}/agent-tools/record_external_publication/execute`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            parameters: entry.input,
            context: { brandId: entry.scope.brandId },
          }),
        },
        snapshot,
      );
      assertWorkspace(snapshot);
      const envelope = object(await response.json().catch(() => null));
      const typed = envelope?.success === true ? result(envelope.data) : null;
      if (!response.ok || !typed) {
        const unavailable =
          response.status === 404 ||
          (response.status === 400 &&
            /(?:unknown|not found|not registered).*(?:tool|action)|(?:tool|action).*(?:unknown|not found|not registered)/i.test(
              typeof envelope?.error === 'string'
                ? envelope.error
                : typeof envelope?.message === 'string'
                  ? envelope.message
                  : '',
            ));
        throw new Error(unavailable ? UNAVAILABLE : FAILED);
      }
      await serial(async () => {
        const entries = await outboxEntries();
        try {
          await chrome.storage.local.set({
            [OUTBOX]: entries.filter((item) => item.id !== entry.id),
          });
        } catch {
          const retained = entries.find((item) => item.id === entry.id);
          if (retained) {
            retained.status = 'queued';
            try {
              await chrome.storage.local.set({ [OUTBOX]: entries });
            } catch {
              /* Existing durable entry remains replay-safe. */
            }
          }
        }
      });
      try {
        await serial(() => removeConfirmed(entry.id));
      } catch {
        /* Retain replay-safe recovery if session cleanup fails. */
      }
      return {
        success: true,
        data: { kind: 'recorded', attemptId: entry.id, result: typed },
      };
    } catch (error) {
      const message =
        error instanceof Error && error.message === UNAVAILABLE
          ? UNAVAILABLE
          : FAILED;
      try {
        await serial(async () => {
          const entries = await outboxEntries();
          const found = entries.find((item) => item.id === entry.id);
          if (found) {
            found.status = 'failed';
            found.error = message;
            await chrome.storage.local.set({ [OUTBOX]: entries });
          }
        });
      } catch {
        /* Preserve the previous durable journal on storage failure. */
      }
      return { success: false, error: message };
    }
  })();
  inFlight.set(entry.id, operation);
  void operation.finally(() => {
    if (inFlight.get(entry.id) === operation) inFlight.delete(entry.id);
  });
  return operation;
}
export async function handlePublicationCaptureMessage(
  request: unknown,
  sender: chrome.runtime.MessageSender,
): Promise<PublicationCaptureReply> {
  try {
    const r = object(request);
    if (!r || typeof r.event !== 'string' || sender.id !== chrome.runtime.id)
      throw new Error('Publication recording request was rejected.');
    const isExtension = [
      'publicationCaptureList',
      'publicationCaptureRetry',
      'publicationCaptureDismiss',
    ].includes(r.event);
    const url = home(sender.url);
    if (isExtension) {
      if (
        sender.tab ||
        !sender.url ||
        !sender.url.startsWith(chrome.runtime.getURL('')) ||
        new URL(sender.url).protocol !== 'chrome-extension:'
      )
        throw new Error('Publication recording request was rejected.');
    } else if (
      !url ||
      !Number.isInteger(sender.tab?.id) ||
      (sender.tab?.id ?? -1) < 0 ||
      sender.frameId !== 0
    )
      throw new Error('Publication recording request was rejected.');
    const allowed =
      r.event === 'publicationCaptureBegin'
        ? ['event', 'attempt']
        : r.event === 'publicationCaptureComplete'
          ? ['event', 'observation']
          : r.event === 'publicationCaptureCancel'
            ? ['event', 'attemptId']
            : ['publicationCaptureRetry', 'publicationCaptureDismiss'].includes(
                  r.event,
                )
              ? ['event', 'id']
              : ['event'];
    if (!keys(r, allowed))
      throw new Error('Publication recording request was rejected.');
    const snapshot = await current();
    const s = currentScope(snapshot);
    const isEnabled = await enabled();
    if (r.event === 'publicationCaptureList') {
      const entries = await serial(async () => {
        const local = await outboxEntries();
        const recovery = await confirmedEntries();
        return [
          ...local,
          ...Object.values(recovery)
            .filter(
              (item) => !local.some((entry) => entry.id === item.attempt.id),
            )
            .map((item) => ({
              ...entryFromConfirmed(item),
              status: 'failed' as const,
              error:
                'Not saved for durable retry. Keep the browser open and retry.',
            })),
        ];
      });
      assertWorkspace(snapshot);
      return {
        success: true,
        data: {
          kind: 'list',
          enabled: isEnabled,
          entries: entries
            .filter((entry) => same(entry.scope, s, false))
            .map((entry) => ({
              id: entry.id,
              status: entry.status,
              description: entry.input.description,
              publicationDate: entry.input.publicationDate,
              ...(entry.error ? { error: entry.error } : {}),
            })),
        },
      };
    }
    if (r.event === 'publicationCaptureContext') {
      const pending = await serial(async () => {
        const entries = await pendingEntries();
        const key = String(sender.tab?.id);
        const found = entries[key];
        if (
          found &&
          (!isEnabled ||
            !same(found.attempt.scope, s) ||
            Date.now() - found.attempt.startedAt > 60000 ||
            found.origin !== url?.origin)
        ) {
          delete entries[key];
          await chrome.storage.session.set({ [PENDING]: entries });
          return null;
        }
        if (found && (await confirmedEntries())[found.attempt.id]) return null;
        return found?.attempt ?? null;
      });
      const recovery = await serial(confirmedEntries);
      assertWorkspace(snapshot);
      const matches = Object.values(recovery).filter(
        (item) =>
          item.binding.tabId === sender.tab?.id &&
          item.binding.origin === url?.origin &&
          same(item.attempt.scope, s, false),
      );
      return {
        success: true,
        data: {
          kind: 'context',
          enabled: isEnabled,
          scope: s,
          pending,
          confirmed: matches.length === 1 ? matches[0] : null,
        },
      };
    }
    if (r.event === 'publicationCaptureDismiss') {
      if (!uuid(r.id)) throw new Error('Invalid recording.');
      await serial(async () => {
        assertWorkspace(snapshot);
        const entries = await outboxEntries();
        const recovery = await confirmedEntries();
        const found = entries.find((entry) => entry.id === r.id);
        const retained = recovery[String(r.id)];
        const originalScope = found?.scope ?? retained?.attempt.scope;
        if (
          !originalScope ||
          !same(originalScope, s, false) ||
          inFlight.has(String(r.id))
        )
          throw new Error('This recording is unavailable.');
        await chrome.storage.local.set({
          [OUTBOX]: entries.filter((entry) => entry.id !== r.id),
        });
        await removeConfirmed(String(r.id));
      });
      return { success: true, data: { kind: 'dismissed', id: r.id } };
    }
    if (!isEnabled) {
      await serial(async () => {
        await pendingEntries(); // Refuse to overwrite malformed storage.
        await chrome.storage.session.set({ [PENDING]: {} });
      });
      throw new Error('Publication recording is disabled.');
    }
    if (r.event === 'publicationCaptureRetry') {
      if (!uuid(r.id)) throw new Error('Invalid recording.');
      const prepared = await serial(async () => {
        assertWorkspace(snapshot);
        if (!(await enabled()))
          throw new Error('Publication recording is disabled.');
        const entries = await outboxEntries();
        const recovery = await confirmedEntries();
        const item = recovery[String(r.id)];
        let found = entries.find((entry) => entry.id === r.id);
        const originalScope = found?.scope ?? item?.attempt.scope;
        if (!originalScope || !same(originalScope, s, false))
          throw new Error('This recording belongs to another workspace.');
        if (!found && item) found = await promote(item, entries);
        if (!found) throw new Error('This recording is unavailable.');
        return { reply: record(found, snapshot) };
      });
      return prepared.reply;
    }
    const tabId = sender.tab?.id ?? -1;
    const key = String(tabId);
    if (r.event === 'publicationCaptureCancel') {
      if (!uuid(r.attemptId)) throw new Error('Invalid recording.');
      await serial(async () => {
        if (!(await enabled()))
          throw new Error('Publication recording is disabled.');
        const entries = await pendingEntries();
        if (
          entries[key]?.attempt.id === r.attemptId &&
          entries[key].origin === url?.origin
        ) {
          delete entries[key];
          await chrome.storage.session.set({ [PENDING]: entries });
        }
      });
      return {
        success: true,
        data: { kind: 'cancelled', attemptId: r.attemptId },
      };
    }
    if (r.event === 'publicationCaptureBegin') {
      const attempt = parseAttempt(r.attempt);
      if (
        !attempt ||
        !same(attempt.scope, s) ||
        home(attempt.documentUrl)?.origin !== url?.origin ||
        attempt.startedAt < Date.now() - 5000 ||
        attempt.startedAt > Date.now() + 1000
      )
        throw new Error('Publication recording request was rejected.');
      await serial(async () => {
        assertWorkspace(snapshot);
        if (!(await enabled()))
          throw new Error('Publication recording is disabled.');
        const entries = await pendingEntries();
        if (
          entries[key] &&
          Date.now() - entries[key].attempt.startedAt <= 60000 &&
          !confirmedMemory.has(entries[key].attempt.id)
        )
          throw new Error('Could not identify one published post');
        if (
          (await confirmedEntries())[attempt.id] ||
          (await outboxEntries()).some((entry) => entry.id === attempt.id)
        )
          throw new Error('Recording already exists.');
        entries[key] = { tabId, origin: url?.origin ?? '', attempt };
        await chrome.storage.session.set({ [PENDING]: entries });
      });
      return { success: true, data: { kind: 'armed', attemptId: attempt.id } };
    }
    if (r.event === 'publicationCaptureComplete') {
      const observation = parseObservation(r.observation);
      if (!observation)
        throw new Error('Publication recording request was rejected.');
      const binding = { tabId, origin: url?.origin ?? '' };
      const prepared = await serial(async () => {
        assertWorkspace(snapshot);
        if (!(await enabled()))
          throw new Error('Publication recording is disabled.');
        const entries = await outboxEntries();
        const found = entries.find((item) => item.id === observation.attemptId);
        if (found) {
          if (
            !bound(found.sourceBinding, binding) ||
            !same(found.scope, s, false) ||
            !entryMatches(found, observation)
          )
            throw new Error('Conflicting publication observation.');
          return {
            reply:
              inFlight.get(found.id) ??
              Promise.resolve<PublicationCaptureReply>({
                success: true,
                data: { kind: 'queued', attemptId: found.id },
              }),
          };
        }
        const recovery = await confirmedEntries();
        let confirmed = recovery[observation.attemptId];
        if (confirmed) {
          if (
            !bound(confirmed.binding, binding) ||
            !same(confirmed.attempt.scope, s, false) ||
            !equalObservation(confirmed.observation, observation)
          )
            throw new Error('Conflicting publication observation.');
        } else {
          const pending = await pendingEntries();
          const original = pending[key];
          const observedAt = Date.now();
          if (
            !original ||
            original.origin !== binding.origin ||
            !same(original.attempt.scope, s) ||
            observedAt < original.attempt.startedAt ||
            observedAt > original.attempt.startedAt + 60000 ||
            !validObservation(original.attempt, observation, observedAt)
          )
            throw new Error('Could not confirm publication');
          confirmed = {
            binding,
            attempt: original.attempt,
            observation,
            observedAt,
          };
          confirmedMemory.set(observation.attemptId, confirmed);
        }
        const entry = await promote(confirmed, entries);
        // Reserve initial dispatch while serialized, before a duplicate can inspect the entry.
        return { reply: record(entry, snapshot) };
      });
      return prepared.reply;
    }
    throw new Error('Publication recording request was rejected.');
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error &&
        [
          RETAIN,
          'Could not identify one published post',
          'Could not confirm publication',
          'Publication recording is disabled.',
          'Select a verified Genfeed workspace to record this publication',
          'Could not read publication recordings. Existing storage has been preserved.',
        ].includes(error.message)
          ? error.message
          : 'Publication recording request was rejected.',
    };
  }
}
export function initializePublicationCapture(): () => void {
  const cancel = () => {
    void serial(async () => {
      const entries = await pendingEntries();
      const state = getWorkspaceState();
      const active =
        state.status === 'ready' && state.snapshot.brandId
          ? currentScope(state.snapshot)
          : null;
      const isEnabled = await enabled();
      if (state.status === 'refreshing') return;
      for (const [key, entry] of Object.entries(entries))
        if (
          !isEnabled ||
          !active ||
          !same(entry.attempt.scope, active) ||
          Date.now() - entry.attempt.startedAt > 60000
        )
          delete entries[key];
      await chrome.storage.session.set({ [PENDING]: entries });
    }).catch(() => undefined);
  };
  void serial(async () => {
    const entries = await outboxEntries();
    await confirmedEntries();
    await chrome.storage.local.set({ [OUTBOX]: entries });
  }).catch(() => undefined);
  const unsubscribe = subscribeWorkspace(cancel);
  const storage = (
    changes: Record<string, chrome.storage.StorageChange>,
    area: string,
  ) => {
    if (area === 'local' && changes[SETTINGS]) cancel();
  };
  const removed = (id: number) => {
    void serial(async () => {
      const entries = await pendingEntries();
      delete entries[String(id)];
      await chrome.storage.session.set({ [PENDING]: entries });
    }).catch(() => undefined);
  };
  const updated = (id: number, change: chrome.tabs.OnUpdatedInfo) => {
    if (change.url && !home(change.url)) removed(id);
  };
  chrome.storage.onChanged.addListener(storage);
  chrome.tabs.onRemoved.addListener(removed);
  chrome.tabs.onUpdated.addListener(updated);
  cancel();
  return () => {
    unsubscribe();
    chrome.storage.onChanged.removeListener(storage);
    chrome.tabs.onRemoved.removeListener(removed);
    chrome.tabs.onUpdated.removeListener(updated);
  };
}
