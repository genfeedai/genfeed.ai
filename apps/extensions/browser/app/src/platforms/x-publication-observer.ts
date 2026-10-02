import {
  extractXPublicationIdentity,
  findXPublicationComposer,
  findXPublicationModalComposer,
  findXPublicationReplyTarget,
  isTrustedXSubmission,
  isXHome,
  isXPublicationPage,
  matchingXPublicationCandidates,
  readXPublicationAuthorHandle,
} from '~platforms/x-publication-dom';

export {
  extractXPublicationCandidate,
  findXPublicationComposer,
  isTrustedXSubmission,
  isXHome,
  isXPublicationPage,
  matchingXPublicationCandidates,
} from '~platforms/x-publication-dom';

import type {
  PublicationCaptureAttempt,
  PublicationCaptureObservation,
  PublicationCaptureReply,
  PublicationCaptureReplyIntentInput,
  PublicationCaptureResponseData,
  XPublicationModalComposer,
  XPublicationReplyTarget,
} from '@genfeedai/contracts/interfaces/extension/extension-publication-observer.interface';
import {
  removePublicationStatus,
  showPublicationStatus,
} from '~platforms/publication-status';
import {
  publicationCaptureAttemptAllowsUrl as allowsUrl,
  publicationCaptureComposeUrl as compose,
  PUBLICATION_REPLY_ASSOCIATION_WINDOW_MS,
  PUBLICATION_REPLY_INTENT_LIFETIME_MS,
  publicationCapturePageUrl as page,
} from '~services/publication-capture-validation';

const normalize = (text: string) => text.replace(/\r\n/g, '\n').trim();
const textOf = (element: HTMLElement) =>
  normalize(element.innerText ?? element.textContent ?? '');
export function attachXPublicationObserver(): () => void {
  if (!isXPublicationPage(location.href)) return () => undefined;
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
  let intent: PublicationCaptureReplyIntentInput | null = null;
  let intentId: string | null = null;
  let intentGeneration = 0;
  let replyTarget: XPublicationReplyTarget | null = null;
  let modal: XPublicationModalComposer | null = null;
  let oldModals = new Set<Element>();
  let returnUrl: string | null = compose(location.href)
    ? null
    : (page(location.href)?.href ?? null);
  let scanTimer: ReturnType<typeof setTimeout> | undefined;
  let confirmTimer: ReturnType<typeof setTimeout> | undefined;
  let expiryTimer: ReturnType<typeof setTimeout> | undefined;
  async function send(request: unknown): Promise<PublicationCaptureReply> {
    try {
      return await chrome.runtime.sendMessage(request);
    } catch {
      return {
        success: false,
        error: 'Published on X; recording failed. Retry in Genfeed Settings.',
      };
    }
  }
  function cancel(message?: string) {
    const old = active;
    active = null;
    generation++;
    completing = false;
    armed = false;
    clearTimeout(confirmTimer);
    clearTimeout(expiryTimer);
    if (old)
      void send({ event: 'publicationCaptureCancel', attemptId: old.id });
    if (message) showPublicationStatus(message);
  }
  function cancelIntent() {
    const id = intentId;
    intent = null;
    intentId = null;
    replyTarget = null;
    modal = null;
    intentGeneration++;
    if (id)
      void send({ event: 'publicationCaptureReplyIntentCancel', intentId: id });
  }
  function intentLocallyValid(): boolean {
    const url = page(location.href);
    return Boolean(
      intent &&
        url &&
        url.origin === page(intent.documentUrl)?.origin &&
        (url.href === intent.documentUrl || compose(url.href)) &&
        Date.now() >= intent.createdAt &&
        Date.now() <= intent.createdAt + PUBLICATION_REPLY_INTENT_LIFETIME_MS &&
        readXPublicationAuthorHandle(document) === intent.authorHandle,
    );
  }
  function intentValid(): boolean {
    return Boolean(
      intent &&
        intentLocallyValid() &&
        context?.enabled &&
        context.scope &&
        JSON.stringify(context.scope) === JSON.stringify(intent.scope),
    );
  }
  function associateModal() {
    if (!intent) return;
    if (
      !intentLocallyValid() ||
      (context === null ? !modal || !intentId : !intentValid())
    ) {
      cancelIntent();
      return;
    }
    if (
      !modal &&
      Date.now() > intent.createdAt + PUBLICATION_REPLY_ASSOCIATION_WINDOW_MS
    ) {
      cancelIntent();
      return;
    }
    const found = findXPublicationModalComposer(document);
    if (
      modal &&
      (!found ||
        found.dialog !== modal.dialog ||
        found.editor !== modal.editor ||
        found.submit !== modal.submit)
    ) {
      cancelIntent();
      return;
    }
    if (
      !modal &&
      found &&
      found.kind === 'reply' &&
      !oldModals.has(found.dialog) &&
      compose(location.href) &&
      replyTarget
    )
      modal = found;
  }
  function beginIntent(target: XPublicationReplyTarget) {
    cancel();
    cancelIntent();
    if (!context?.enabled || !context.scope) return;
    const authorHandle = readXPublicationAuthorHandle(document);
    const url = page(location.href);
    if (
      !authorHandle ||
      !url ||
      compose(url.href) ||
      page(target.parent.url)?.origin !== url.origin
    )
      return;
    const input: PublicationCaptureReplyIntentInput = {
      scope: context.scope,
      createdAt: Date.now(),
      documentUrl: url.href,
      authorHandle,
      parent: target.parent,
    };
    intent = input;
    replyTarget = target;
    oldModals = new Set(document.querySelectorAll('[role="dialog"]'));
    const version = ++intentGeneration;
    void send({ event: 'publicationCaptureReplyIntent', intent: input }).then(
      (response) => {
        if (!response.success || response.data.kind !== 'reply-intent') {
          if (intent === input) cancelIntent();
          return;
        }
        if (disposed || intent !== input || intentGeneration !== version) {
          void send({
            event: 'publicationCaptureReplyIntentCancel',
            intentId: response.data.intentId,
          });
          return;
        }
        if (
          Date.now() >
            input.createdAt + PUBLICATION_REPLY_ASSOCIATION_WINDOW_MS ||
          !intentValid()
        ) {
          cancelIntent();
          void send({
            event: 'publicationCaptureReplyIntentCancel',
            intentId: response.data.intentId,
          });
          return;
        }
        associateModal();
        if (intent !== input) {
          void send({
            event: 'publicationCaptureReplyIntentCancel',
            intentId: response.data.intentId,
          });
          return;
        }
        intentId = response.data.intentId;
      },
    );
  }
  async function refresh() {
    context = null;
    if (frozenObservation) removePublicationStatus();
    const version = ++contextVersion;
    const response = await send({ event: 'publicationCaptureContext' });
    if (disposed || version !== contextVersion) return;
    if (response.success && response.data.kind === 'context') {
      context = response.data;
      if (!context.enabled) {
        frozenAttempt = null;
        frozenObservation = null;
        cancel();
        cancelIntent();
        removePublicationStatus();
      } else if (
        active &&
        (!context.scope ||
          JSON.stringify(active.scope) !== JSON.stringify(context.scope))
      ) {
        cancel();
      }
      associateModal();
      if (
        frozenAttempt &&
        (!context.scope || !sameIdentity(frozenAttempt.scope, context.scope))
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
        sameIdentity(context.confirmed.attempt.scope, context.scope)
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
          () => cancel('Could not confirm publication'),
          Math.max(0, active.startedAt + 60000 - Date.now()),
        );
        scan();
      }
    } else cancelIntent();
  }
  function sameIdentity(
    left: PublicationCaptureAttempt['scope'],
    right: PublicationCaptureAttempt['scope'],
  ): boolean {
    return (
      left.userId === right.userId &&
      left.organizationId === right.organizationId &&
      left.brandId === right.brandId
    );
  }
  const unsaved =
    'Could not save this recording. Keep this tab open and select Retry recording. Closing the browser may lose it.';
  function recoveryStatus(disabled = false) {
    showPublicationStatus(unsaved, {
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
      !sameIdentity(frozenAttempt.scope, context.scope)
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
    if (response.success === false && response.error === unsaved) {
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
      showPublicationStatus(
        'Published on X; recording failed. Retry in Genfeed Settings.',
      );
    }
  }
  function scan() {
    if (disposed || !active || completing || !armed) return;
    if (!isXPublicationPage(location.href)) {
      cleanup();
      return;
    }
    if (
      !allowsUrl(active, location.href) ||
      readXPublicationAuthorHandle(document) !== active.authorHandle
    ) {
      cancel('Could not confirm publication');
      return;
    }
    if (Date.now() > active.startedAt + 60000) {
      cancel('Could not confirm publication');
      return;
    }
    const candidates = matchingXPublicationCandidates(document, active);
    if (candidates.length > 0 && !confirmTimer) {
      const captured = active;
      const version = generation;
      confirmTimer = setTimeout(async () => {
        confirmTimer = undefined;
        if (disposed || active !== captured || version !== generation) return;
        if (
          !allowsUrl(captured, location.href) ||
          readXPublicationAuthorHandle(document) !== captured.authorHandle
        ) {
          cancel('Could not confirm publication');
          return;
        }
        const matches = matchingXPublicationCandidates(document, captured);
        if (matches.length !== 1) {
          if (matches.length > 1)
            cancel('Could not identify one published post');
          return;
        }
        const candidate = matches[0];
        frozenAttempt = captured;
        frozenObservation = { attemptId: captured.id, ...candidate };
        active = null;
        armed = false;
        clearTimeout(expiryTimer);
        clearTimeout(scanTimer);
        scanTimer = undefined;
        showPublicationStatus('Recording published post');
        await completeFrozen();
      }, 250);
    }
  }
  const observer = new MutationObserver(() => {
    if (!isXPublicationPage(location.href)) {
      cleanup();
      return;
    }
    associateModal();
    if (
      active &&
      (!allowsUrl(active, location.href) ||
        readXPublicationAuthorHandle(document) !== active.authorHandle)
    )
      cancel('Could not confirm publication');
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
  const click = (event: MouseEvent) => {
    if (!event.isTrusted) return;
    if (
      event.target instanceof Element &&
      event.target.closest('[data-testid="app-bar-close"]')
    ) {
      cancelIntent();
      if (active) cancel('Could not confirm publication');
      return;
    }
    const target = findXPublicationReplyTarget(event.target);
    if (target) {
      beginIntent(target);
      return;
    }
    associateModal();
    const dialog = compose(location.href)
      ? findXPublicationModalComposer(document)
      : null;
    const composer =
      dialog ??
      (isXHome(location.href) ? findXPublicationComposer(document) : null);
    if (
      !composer ||
      !isTrustedXSubmission(event.isTrusted, event.target, composer)
    )
      return;
    if (
      dialog?.kind === 'reply' &&
      (!intent ||
        !intentId ||
        !modal ||
        modal.dialog !== dialog.dialog ||
        modal.editor !== dialog.editor ||
        modal.submit !== dialog.submit ||
        !intentValid())
    ) {
      cancelIntent();
      showPublicationStatus('Could not confirm publication');
      return;
    }
    if (dialog?.kind === 'post') cancelIntent();
    if (active) {
      showPublicationStatus('Could not identify one published post');
      return;
    }
    if (!context?.enabled) {
      if (context && !context.enabled) return;
      showPublicationStatus(
        'Select a verified Genfeed workspace to record this publication',
      );
      return;
    }
    if (!context.scope) {
      showPublicationStatus(
        'Select a verified Genfeed workspace to record this publication',
      );
      return;
    }
    const authorHandle = readXPublicationAuthorHandle(document);
    if (!authorHandle) {
      cancelIntent();
      showPublicationStatus('Could not confirm publication');
      return;
    }
    const description = textOf(composer.editor);
    if (!description) {
      showPublicationStatus('Could not confirm publication');
      return;
    }
    if (
      description.length > 1048576 ||
      new TextEncoder().encode(description).length > 1048576
    ) {
      showPublicationStatus(
        'Publication is too large to record. It has not been recorded in Genfeed.',
      );
      return;
    }
    const baselineIds = [
      ...new Set(
        [
          ...document.querySelectorAll(
            'article[data-testid="tweet"][role="article"]',
          ),
        ].flatMap((article) => {
          const candidate = extractXPublicationIdentity(article);
          return candidate ? [candidate.externalId] : [];
        }),
      ),
    ];
    if (
      dialog?.kind === 'reply' &&
      intent &&
      !baselineIds.includes(intent.parent.externalId)
    )
      baselineIds.push(intent.parent.externalId);
    if (baselineIds.length > 10000) {
      showPublicationStatus('Could not confirm publication');
      return;
    }
    const attempt: PublicationCaptureAttempt = {
      id: crypto.randomUUID(),
      scope: context.scope,
      startedAt: Date.now(),
      documentUrl: location.href,
      authorHandle,
      description,
      baselineIds,
      surface:
        dialog?.kind === 'reply' && intent && intentId
          ? {
              kind: 'x-reply-modal',
              returnUrl: intent.documentUrl,
              replyIntentId: intentId,
              parent: intent.parent,
            }
          : dialog
            ? { kind: 'x-post-modal', returnUrl }
            : { kind: 'x-home' },
    };
    frozenAttempt = null;
    frozenObservation = null;
    completing = false;
    active = attempt;
    // Begin owns atomic token consumption; clear only local node-bound state here.
    intent = null;
    intentId = null;
    modal = null;
    replyTarget = null;
    intentGeneration++;
    const version = ++generation;
    expiryTimer = setTimeout(
      () => cancel('Could not confirm publication'),
      60000,
    );
    showPublicationStatus('Waiting for publication');
    void send({ event: 'publicationCaptureBegin', attempt }).then((reply) => {
      if (disposed || active !== attempt || generation !== version) return;
      if (reply.success === false) {
        cancel(reply.error);
        return;
      }
      armed = true;
      scan();
    });
  };
  const focus = () => {
    void refresh();
  };
  const changed = (changes: Record<string, chrome.storage.StorageChange>) => {
    if (changes['genfeed-settings'] || changes.extension_workspace_changed) {
      context = null;
      cancel();
      cancelIntent();
      frozenAttempt = null;
      frozenObservation = null;
      removePublicationStatus();
      void refresh();
    }
  };
  function cleanup() {
    if (disposed) return;
    disposed = true;
    contextVersion++;
    cancel();
    cancelIntent();
    frozenAttempt = null;
    frozenObservation = null;
    observer.disconnect();
    clearTimeout(scanTimer);
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
    if (!isXPublicationPage(location.href)) {
      cleanup();
      return;
    }
    if (
      active &&
      (!allowsUrl(active, location.href) ||
        readXPublicationAuthorHandle(document) !== active.authorHandle)
    )
      cancel('Could not confirm publication');
    associateModal();
    if (!compose(location.href)) returnUrl = page(location.href)?.href ?? null;
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
