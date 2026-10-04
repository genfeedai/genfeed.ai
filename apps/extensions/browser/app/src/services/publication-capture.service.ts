import type { ExtensionWorkspaceSnapshot } from '@genfeedai/contracts/interfaces';
import type {
  PublicationCaptureConfirmed,
  PublicationCaptureOutboxEntry,
  PublicationCapturePending,
  PublicationCaptureReply,
  PublicationCaptureScope,
} from '@genfeedai/contracts/interfaces/extension/extension-publication-observer.interface';
import { apiEndpoint } from '~services/environment.service';
import {
  createPublicationReplyIntent,
  PUBLICATION_REPLY_INTENTS_KEY as INTENTS,
  matchesPublicationReplyIntent,
  readPublicationReplyIntents as readIntents,
} from '~services/publication-capture-intents';
import {
  samePublicationCaptureSenderBinding as bound,
  publicationCaptureEntryFromConfirmed as entryFromConfirmed,
  publicationCaptureEntryMatches as entryMatches,
  samePublicationCaptureObservation as equalObservation,
  parsePublicationCaptureOutbox,
  parsePublicationCaptureResult as result,
  parsePublicationCaptureSenderBinding as senderBinding,
} from '~services/publication-capture-record';
import {
  publicationCaptureAttemptAllowsUrl as allowsUrl,
  publicationCaptureComposeUrl as compose,
  publicationCaptureKeys as keys,
  publicationCaptureRecord as object,
  PUBLICATION_REPLY_INTENT_LIFETIME_MS,
  publicationCapturePageUrl as page,
  parsePublicationCaptureAttempt as parseAttempt,
  parsePublicationCaptureObservation as parseObservation,
  samePublicationCaptureScope as same,
  publicationCaptureText as text,
  publicationCaptureUuid as uuid,
  validPublicationCaptureObservation as validObservation,
} from '~services/publication-capture-validation';
import {
  addPublicationWrittenText,
  matchesPublicationWrittenText,
  NOT_WRITTEN_BY_GENFEED,
  prunePublicationWrittenTexts,
  readPublicationWrittenTexts as readWritten,
  PUBLICATION_WRITTEN_KEY as WRITTEN,
} from '~services/publication-capture-written';
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
  const snapshot = await requireWorkspace();
  assertWorkspace(snapshot);
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
      page(attempt.documentUrl)?.origin !== v.origin
    )
      throw new Error(
        'Could not read publication recordings. Existing storage has been preserved.',
      );
    entries[id] = { tabId: Number(id), origin: v.origin, attempt };
  }
  return entries;
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
      page(attempt.documentUrl)?.origin !== binding.origin ||
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
  const stored = await chrome.storage.local.get(OUTBOX);
  return parsePublicationCaptureOutbox(
    stored[OUTBOX],
    new Set(inFlight.keys()),
  );
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
/** Remember text the extension just wrote into a composer so only it is captured. */
export async function registerExtensionWrittenText(
  content: unknown,
  sender: chrome.runtime.MessageSender,
): Promise<boolean> {
  try {
    const url = page(sender.url);
    const tabId = sender.tab?.id;
    if (
      sender.id !== chrome.runtime.id ||
      typeof content !== 'string' ||
      !url ||
      typeof tabId !== 'number' ||
      !Number.isInteger(tabId) ||
      tabId < 0 ||
      sender.frameId !== 0
    )
      return false;
    return await serial(async () => {
      if (!(await enabled())) return false;
      const snapshot = await current();
      const now = Date.now();
      const entries = prunePublicationWrittenTexts(await readWritten(), now);
      if (
        !addPublicationWrittenText(
          entries,
          String(tabId),
          url.origin,
          currentScope(snapshot),
          content,
          now,
        )
      )
        return false;
      await chrome.storage.session.set({ [WRITTEN]: entries });
      return true;
    });
  } catch {
    return false;
  }
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
    const url = page(sender.url);
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
      r.event === 'publicationCaptureReplyIntent'
        ? ['event', 'intent']
        : r.event === 'publicationCaptureReplyIntentCancel'
          ? ['event', 'intentId']
          : r.event === 'publicationCaptureBegin'
            ? ['event', 'attempt']
            : r.event === 'publicationCaptureComplete'
              ? ['event', 'observation']
              : r.event === 'publicationCaptureCancel'
                ? ['event', 'attemptId']
                : [
                      'publicationCaptureRetry',
                      'publicationCaptureDismiss',
                    ].includes(r.event)
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
            found.origin !== url?.origin ||
            !allowsUrl(found.attempt, sender.url))
        ) {
          delete entries[key];
          await chrome.storage.session.set({ [PENDING]: entries });
          return null;
        }
        if (found && (await confirmedEntries())[found.attempt.id]) return null;
        return found?.attempt ?? null;
      });
      await serial(async () => {
        const intents = await readIntents();
        for (const [key, intent] of Object.entries(intents))
          if (
            !isEnabled ||
            !same(intent.input.scope, s) ||
            Date.now() >
              intent.input.createdAt + PUBLICATION_REPLY_INTENT_LIFETIME_MS ||
            (intent.binding.tabId === sender.tab?.id &&
              (!url ||
                intent.binding.origin !== url.origin ||
                (url.href !== intent.input.documentUrl && !compose(url.href))))
          )
            delete intents[key];
        await chrome.storage.session.set({ [INTENTS]: intents });
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
        await readIntents();
        await chrome.storage.session.set({
          [PENDING]: {},
          [INTENTS]: {},
        });
        await chrome.storage.session.remove(WRITTEN);
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
    if (
      r.event === 'publicationCaptureReplyIntent' ||
      r.event === 'publicationCaptureReplyIntentCancel'
    ) {
      const binding = { tabId, origin: url?.origin ?? '' };
      const intentId = await serial(async () => {
        assertWorkspace(snapshot);
        if (!(await enabled()))
          throw new Error('Publication recording is disabled.');
        const entries = await readIntents();
        if (r.event === 'publicationCaptureReplyIntentCancel') {
          if (!uuid(r.intentId)) throw new Error('Invalid recording.');
          const found = entries[key];
          if (found && found.id === r.intentId && bound(found.binding, binding))
            delete entries[key];
          await chrome.storage.session.set({ [INTENTS]: entries });
          return r.intentId;
        }
        const intent = createPublicationReplyIntent(
          r.intent,
          binding,
          s,
          Date.now(),
        );
        if (!intent)
          throw new Error('Publication recording request was rejected.');
        entries[key] = intent;
        await chrome.storage.session.set({ [INTENTS]: entries });
        return intent.id;
      });
      return {
        success: true,
        data: {
          kind:
            r.event === 'publicationCaptureReplyIntent'
              ? 'reply-intent'
              : 'reply-intent-cancelled',
          intentId,
        },
      };
    }
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
        page(attempt.documentUrl)?.origin !== url?.origin ||
        !allowsUrl(attempt, sender.url) ||
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
        const intents = await readIntents();
        for (const [intentKey, intent] of Object.entries(intents))
          if (
            Date.now() >
              intent.input.createdAt + PUBLICATION_REPLY_INTENT_LIFETIME_MS ||
            !same(intent.input.scope, s)
          )
            delete intents[intentKey];
        const storedWritten = await readWritten();
        const written = prunePublicationWrittenTexts(storedWritten, Date.now());
        const writtenChanged =
          JSON.stringify(written) !== JSON.stringify(storedWritten);
        if (
          !matchesPublicationWrittenText(
            written,
            key,
            url?.origin ?? '',
            s,
            attempt.description,
            Date.now(),
          )
        ) {
          if (writtenChanged)
            await chrome.storage.session.set({ [WRITTEN]: written });
          throw new Error(NOT_WRITTEN_BY_GENFEED);
        }
        if (attempt.surface.kind === 'x-reply-modal') {
          const intent = intents[key];
          if (
            !intent ||
            !matchesPublicationReplyIntent(
              intent,
              attempt,
              { tabId, origin: url?.origin ?? '' },
              Date.now(),
            )
          )
            throw new Error('Publication recording request was rejected.');
          delete intents[key];
        }
        entries[key] = { tabId, origin: url?.origin ?? '', attempt };
        await chrome.storage.session.set({
          [PENDING]: entries,
          [INTENTS]: intents,
          ...(writtenChanged ? { [WRITTEN]: written } : {}),
        });
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
            !allowsUrl(original.attempt, sender.url) ||
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
          NOT_WRITTEN_BY_GENFEED,
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
      const intents = await readIntents();
      const state = getWorkspaceState();
      const active =
        state.status === 'ready' && state.snapshot.brandId
          ? currentScope(state.snapshot)
          : null;
      const isEnabled = await enabled();
      if (
        isEnabled &&
        (state.status === 'loading' || state.status === 'refreshing')
      )
        return;
      for (const [key, entry] of Object.entries(entries))
        if (
          !isEnabled ||
          !active ||
          !same(entry.attempt.scope, active) ||
          Date.now() - entry.attempt.startedAt > 60000
        )
          delete entries[key];
      for (const [key, intent] of Object.entries(intents))
        if (
          !isEnabled ||
          !active ||
          !same(intent.input.scope, active) ||
          Date.now() >
            intent.input.createdAt + PUBLICATION_REPLY_INTENT_LIFETIME_MS
        )
          delete intents[key];
      await chrome.storage.session.set({
        [PENDING]: entries,
        [INTENTS]: intents,
      });
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
      const intents = await readIntents();
      const written = await readWritten();
      delete entries[String(id)];
      delete intents[String(id)];
      const hadWritten = String(id) in written;
      delete written[String(id)];
      await chrome.storage.session.set({
        [PENDING]: entries,
        [INTENTS]: intents,
        ...(hadWritten ? { [WRITTEN]: written } : {}),
      });
    }).catch(() => undefined);
  };
  const updated = (id: number, change: chrome.tabs.OnUpdatedInfo) => {
    if (!change.url) return;
    void serial(async () => {
      const entries = await pendingEntries();
      const intents = await readIntents();
      const key = String(id);
      if (entries[key] && !allowsUrl(entries[key].attempt, change.url))
        delete entries[key];
      const intent = intents[key];
      const url = page(change.url);
      if (
        intent &&
        (!url ||
          intent.binding.origin !== url.origin ||
          (url.href !== intent.input.documentUrl && !compose(url.href)))
      )
        delete intents[key];
      await chrome.storage.session.set({
        [PENDING]: entries,
        [INTENTS]: intents,
      });
    }).catch(() => undefined);
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
