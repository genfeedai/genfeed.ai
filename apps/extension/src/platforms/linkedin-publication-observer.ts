import type {
  PublicationCaptureAttempt,
  PublicationCaptureObservation,
  PublicationCaptureReply,
  PublicationCaptureResponseData,
} from '@genfeedai/contracts/interfaces/extension/extension-publication-observer.interface';
import {
  findLinkedInComposer,
  isLinkedInPublicationPage,
  isTrustedLinkedInSubmission,
  linkedInBaselineIds,
  matchingLinkedInPublicationCandidates,
} from '~platforms/linkedin-publication-dom';
import {
  removePublicationStatus,
  showPublicationStatus,
} from '~platforms/publication-status';
import {
  publicationCaptureAttemptAllowsUrl as allowsUrl,
  publicationCapturePageUrl as page,
  samePublicationCaptureScope as sameScope,
} from '~services/publication-capture-validation';
import { NOT_WRITTEN_BY_GENFEED } from '~services/publication-capture-written';

const normalize = (text: string) => text.replace(/\r\n/g, '\n').trim();
const textOf = (element: HTMLElement) =>
  normalize(element.innerText ?? element.textContent ?? '');
const recordingEnabled = (settings: unknown): boolean =>
  typeof settings === 'object' &&
  settings !== null &&
  'recordOwnPublications' in settings &&
  typeof settings.recordOwnPublications === 'boolean'
    ? settings.recordOwnPublications
    : true;
const ATTEMPT_WINDOW_MS = 60000;
const MAX_TEXT_BYTES = 1048576;
const UNCONFIRMED = 'Could not confirm publication';
const UNSAVED =
  'Could not save this recording. Keep this tab open and select Retry recording. Closing the browser may lose it.';
const NO_WORKSPACE =
  'Select a verified Genfeed workspace to record this publication';
const RECORDING_FAILED =
  'Published on LinkedIn; recording failed. Retry in Genfeed Settings.';

/**
 * Records a LinkedIn post or comment the user publishes with text the extension wrote.
 * A submit click only arms an attempt; success is a confirmed published permalink.
 */
export function attachLinkedInPublicationObserver(): () => void {
  if (!isLinkedInPublicationPage(location.href)) return () => undefined;
  let context: Extract<
    PublicationCaptureResponseData,
    { kind: 'context' }
  > | null = null;
  let active: PublicationCaptureAttempt | null = null;
  let frozenAttempt: PublicationCaptureAttempt | null = null;
  let frozenObservation: PublicationCaptureObservation | null = null;
  let generation = 0;
  let contextVersion = 0;
  let disposed = false;
  let completing = false;
  let armed = false;
  let observer: MutationObserver | null = null;
  let scanTimer: ReturnType<typeof setTimeout> | undefined;
  let confirmTimer: ReturnType<typeof setTimeout> | undefined;
  let expiryTimer: ReturnType<typeof setTimeout> | undefined;
  async function send(request: unknown): Promise<PublicationCaptureReply> {
    try {
      // sendMessage resolves undefined when no listener replies (background
      // restarting, extension reloaded); treat that like a failed send.
      const reply: PublicationCaptureReply | undefined =
        await chrome.runtime.sendMessage(request);
      return reply ?? { success: false, error: RECORDING_FAILED };
    } catch {
      return { success: false, error: RECORDING_FAILED };
    }
  }
  // The page is only watched while an attempt waits for its confirmation.
  function watch() {
    observer ??= new MutationObserver(() => {
      if (!isLinkedInPublicationPage(location.href)) {
        cleanup();
        return;
      }
      if (active && !allowsUrl(active, location.href)) cancel(UNCONFIRMED);
      if (!scanTimer)
        scanTimer = setTimeout(() => {
          scanTimer = undefined;
          scan();
        }, 100);
    });
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
      characterData: true,
    });
  }
  function unwatch() {
    observer?.disconnect();
    observer = null;
    clearTimeout(scanTimer);
    scanTimer = undefined;
  }
  function cancel(message?: string) {
    const old = active;
    active = null;
    generation++;
    completing = false;
    armed = false;
    clearTimeout(confirmTimer);
    confirmTimer = undefined;
    clearTimeout(expiryTimer);
    unwatch();
    if (old)
      void send({ event: 'publicationCaptureCancel', attemptId: old.id });
    if (message) showPublicationStatus(message);
  }
  async function refresh() {
    context = null;
    if (frozenObservation) removePublicationStatus();
    const version = ++contextVersion;
    const response = await send({ event: 'publicationCaptureContext' });
    if (disposed || version !== contextVersion) return;
    if (!response.success || response.data.kind !== 'context') return;
    context = response.data;
    if (!context.enabled) {
      frozenAttempt = null;
      frozenObservation = null;
      cancel();
      removePublicationStatus();
    } else if (
      active &&
      (!context.scope || !sameScope(active.scope, context.scope, true))
    ) {
      cancel();
    }
    if (
      frozenAttempt &&
      (!context.scope || !sameScope(frozenAttempt.scope, context.scope, false))
    ) {
      frozenAttempt = null;
      frozenObservation = null;
      generation++;
      removePublicationStatus();
    }
    if (
      context.enabled &&
      !active &&
      context.confirmed &&
      context.scope &&
      sameScope(context.confirmed.attempt.scope, context.scope, false)
    ) {
      frozenAttempt = context.confirmed.attempt;
      frozenObservation = context.confirmed.observation;
      recoveryStatus(completing);
    } else if (context.enabled && frozenObservation && !active) {
      recoveryStatus(completing);
    } else if (
      context.enabled &&
      !active &&
      context.pending &&
      !context.confirmed
    ) {
      active = context.pending;
      armed = true;
      expiryTimer = setTimeout(
        () => cancel(UNCONFIRMED),
        Math.max(0, active.startedAt + ATTEMPT_WINDOW_MS - Date.now()),
      );
      watch();
      scan();
    }
  }
  function recoveryStatus(disabled = false) {
    showPublicationStatus(UNSAVED, {
      label: 'Retry recording',
      disabled,
      onClick: () => {
        void completeFrozen(true);
      },
    });
  }
  async function completeFrozen(isRecovery = false) {
    if (
      disposed ||
      completing ||
      !frozenAttempt ||
      !frozenObservation ||
      !context?.enabled ||
      !context.scope ||
      !sameScope(frozenAttempt.scope, context.scope, false)
    )
      return;
    const captured = frozenAttempt;
    const observation = frozenObservation;
    const version = generation;
    completing = true;
    if (isRecovery) recoveryStatus(true);
    else showPublicationStatus('Recording published post');
    const response = await send({
      event: 'publicationCaptureComplete',
      observation,
    });
    if (disposed || frozenAttempt !== captured || version !== generation)
      return;
    completing = false;
    if (response.success === false && response.error === UNSAVED) {
      recoveryStatus();
      return;
    }
    frozenAttempt = null;
    frozenObservation = null;
    if (response.success && response.data.kind === 'recorded') {
      showPublicationStatus(
        response.data.result.created
          ? 'Published post recorded in Genfeed'
          : 'Already in Genfeed',
      );
    } else {
      showPublicationStatus(RECORDING_FAILED);
    }
  }
  function scan() {
    if (disposed || !active || completing || !armed) return;
    if (!isLinkedInPublicationPage(location.href)) {
      cleanup();
      return;
    }
    if (
      !allowsUrl(active, location.href) ||
      Date.now() > active.startedAt + ATTEMPT_WINDOW_MS
    ) {
      cancel(UNCONFIRMED);
      return;
    }
    if (
      matchingLinkedInPublicationCandidates(document, active).length === 0 ||
      confirmTimer
    )
      return;
    const captured = active;
    const version = generation;
    confirmTimer = setTimeout(async () => {
      confirmTimer = undefined;
      if (disposed || active !== captured || version !== generation) return;
      if (!allowsUrl(captured, location.href)) {
        cancel(UNCONFIRMED);
        return;
      }
      const matches = matchingLinkedInPublicationCandidates(document, captured);
      if (matches.length !== 1) {
        if (matches.length > 1) cancel('Could not identify one published post');
        return;
      }
      frozenAttempt = captured;
      frozenObservation = {
        attemptId: captured.id,
        description: captured.description,
        ...matches[0],
      };
      active = null;
      armed = false;
      clearTimeout(expiryTimer);
      unwatch();
      showPublicationStatus('Recording published post');
      await completeFrozen();
    }, 250);
  }
  const click = (event: MouseEvent) => {
    if (!event.isTrusted) return;
    const url = page(location.href);
    const composer = url
      ? findLinkedInComposer(event.target, url.origin)
      : null;
    if (
      !url ||
      !composer ||
      !isTrustedLinkedInSubmission(event.isTrusted, event.target, composer)
    )
      return;
    if (context && !context.enabled) return;
    if (active) {
      showPublicationStatus('Could not identify one published post');
      return;
    }
    if (!context?.enabled || !context.scope) {
      showPublicationStatus(NO_WORKSPACE);
      return;
    }
    const description = textOf(composer.editor);
    if (!description) {
      showPublicationStatus(UNCONFIRMED);
      return;
    }
    if (
      description.length > MAX_TEXT_BYTES ||
      new TextEncoder().encode(description).length > MAX_TEXT_BYTES
    ) {
      showPublicationStatus(
        'Publication is too large to record. It has not been recorded in Genfeed.',
      );
      return;
    }
    const baselineIds = linkedInBaselineIds(document, url.origin);
    if (composer.parent && !baselineIds.includes(composer.parent.externalId))
      baselineIds.push(composer.parent.externalId);
    if (baselineIds.length > 10000) {
      showPublicationStatus(UNCONFIRMED);
      return;
    }
    const attempt: PublicationCaptureAttempt = {
      id: crypto.randomUUID(),
      scope: context.scope,
      startedAt: Date.now(),
      documentUrl: location.href,
      authorHandle: null,
      description,
      baselineIds,
      surface: composer.parent
        ? { kind: 'linkedin-comment', parent: composer.parent }
        : { kind: 'linkedin-post' },
    };
    frozenAttempt = null;
    frozenObservation = null;
    completing = false;
    active = attempt;
    const version = ++generation;
    expiryTimer = setTimeout(() => cancel(UNCONFIRMED), ATTEMPT_WINDOW_MS);
    void send({ event: 'publicationCaptureBegin', attempt }).then((reply) => {
      if (disposed || active !== attempt || generation !== version) return;
      if (reply.success === false) {
        // Text not written with Genfeed is ignored without any notice.
        cancel(
          reply.error === NOT_WRITTEN_BY_GENFEED ? undefined : reply.error,
        );
        return;
      }
      armed = true;
      watch();
      showPublicationStatus('Waiting for publication');
      scan();
    });
  };
  const focus = () => {
    void refresh();
  };
  const changed = (changes: Record<string, chrome.storage.StorageChange>) => {
    const settings = changes['genfeed-settings'];
    const recordingToggled =
      settings &&
      recordingEnabled(settings.oldValue) !==
        recordingEnabled(settings.newValue);
    if (recordingToggled || changes.extension_workspace_changed) {
      context = null;
      cancel();
      frozenAttempt = null;
      frozenObservation = null;
      removePublicationStatus();
      void refresh();
    } else if (settings) {
      // Theme and auto-fill writes must not discard a pending confirmation.
      void refresh();
    }
  };
  function cleanup() {
    if (disposed) return;
    disposed = true;
    contextVersion++;
    cancel();
    frozenAttempt = null;
    frozenObservation = null;
    unwatch();
    clearTimeout(confirmTimer);
    clearTimeout(expiryTimer);
    document.removeEventListener('click', click, true);
    window.removeEventListener('focus', focus);
    window.removeEventListener('popstate', navigation);
    window.removeEventListener('genfeed-publication-navigation', navigation);
    window.removeEventListener('pagehide', cleanup);
    chrome.storage.onChanged.removeListener(changed);
    removePublicationStatus();
  }
  const navigation = () => {
    if (!isLinkedInPublicationPage(location.href)) {
      cleanup();
      return;
    }
    if (active && !allowsUrl(active, location.href)) cancel(UNCONFIRMED);
  };
  document.addEventListener('click', click, true);
  window.addEventListener('focus', focus);
  window.addEventListener('popstate', navigation);
  window.addEventListener('genfeed-publication-navigation', navigation);
  window.addEventListener('pagehide', cleanup);
  chrome.storage.onChanged.addListener(changed);
  void refresh();
  return cleanup;
}
