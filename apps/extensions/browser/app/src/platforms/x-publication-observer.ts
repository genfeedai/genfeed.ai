import type {
  PublicationCaptureAttempt,
  PublicationCaptureObservation,
  PublicationCaptureReply,
  PublicationCaptureResponseData,
  XPublicationCandidate,
  XPublicationComposer,
} from '@genfeedai/contracts/interfaces/extension/extension-publication-observer.interface';
import {
  removePublicationStatus,
  showPublicationStatus,
} from '~platforms/publication-status';

const normalize = (text: string) => text.replace(/\r\n/g, '\n').trim();
const textOf = (element: HTMLElement) =>
  normalize(element.innerText ?? element.textContent ?? '');
export function isXHome(url: string): boolean {
  try {
    const value = new URL(url);
    return (
      value.protocol === 'https:' &&
      ['x.com', 'www.x.com', 'twitter.com', 'www.twitter.com'].includes(
        value.hostname,
      ) &&
      /^\/home\/?$/.test(value.pathname)
    );
  } catch {
    return false;
  }
}
export function findXPublicationComposer(
  document: Document,
): XPublicationComposer | null {
  const buttons = [
    ...document.querySelectorAll<HTMLElement>(
      '[data-testid="tweetButtonInline"]',
    ),
  ];
  const editors = [
    ...document.querySelectorAll<HTMLElement>(
      '[data-testid="tweetTextarea_0"][role="textbox"][contenteditable="true"]',
    ),
  ];
  if (buttons.length !== 1 || editors.length !== 1) return null;
  const submit = buttons[0];
  const editor = editors[0];
  for (let root = submit.parentElement; root; root = root.parentElement) {
    if (root.closest('article,[role="dialog"]')) return null;
    if (
      root.contains(editor) &&
      root.querySelectorAll('[data-testid="tweetButtonInline"]').length === 1 &&
      root.querySelectorAll(
        '[data-testid="tweetTextarea_0"][role="textbox"][contenteditable="true"]',
      ).length === 1
    )
      return { root, editor, submit };
  }
  return null;
}
export function isTrustedXSubmission(
  isTrusted: boolean,
  target: EventTarget | null,
  composer: XPublicationComposer,
): boolean {
  return (
    isTrusted &&
    target instanceof Node &&
    composer.submit.contains(target) &&
    !composer.submit.hasAttribute('disabled') &&
    composer.submit.getAttribute('aria-disabled') !== 'true'
  );
}
export function extractXPublicationCandidate(
  article: Element,
): XPublicationCandidate | null {
  if (!article.matches('article[data-testid="tweet"][role="article"]'))
    return null;
  const header = article.querySelector('[data-testid="User-Name"]');
  if (!header) return null;
  const anchors = [...header.querySelectorAll<HTMLAnchorElement>('a[href]')];
  const profiles = anchors.filter((anchor) =>
    /^\/[a-z0-9_]{1,15}$/i.test(new URL(anchor.href).pathname),
  );
  if (!profiles.length) return null;
  const authorHandle = new URL(profiles[0].href).pathname
    .slice(1)
    .toLowerCase();
  if (
    profiles.some(
      (anchor) =>
        new URL(anchor.href).pathname.toLowerCase() !== `/${authorHandle}`,
    )
  )
    return null;
  const statuses = anchors.filter(
    (anchor) =>
      new RegExp(`^/${authorHandle}/status/\\d+$`, 'i').test(
        new URL(anchor.href).pathname,
      ) && anchor.querySelector('time[datetime]'),
  );
  if (statuses.length !== 1) return null;
  const anchor = statuses[0];
  const url = new URL(anchor.href);
  if (
    url.protocol !== 'https:' ||
    !['x.com', 'www.x.com', 'twitter.com', 'www.twitter.com'].includes(
      url.hostname,
    ) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  )
    return null;
  const time = anchor.querySelector('time[datetime]')?.getAttribute('datetime');
  if (!time || !Number.isFinite(Date.parse(time))) return null;
  const bodies = [
    ...article.querySelectorAll<HTMLElement>('[data-testid="tweetText"]'),
  ].filter((element) => {
    if (
      !(
        header.compareDocumentPosition(element) &
        Node.DOCUMENT_POSITION_FOLLOWING
      )
    )
      return false;
    for (
      let parent = element.parentElement;
      parent && parent !== article;
      parent = parent.parentElement
    )
      if (parent.tagName === 'A' || parent.getAttribute('role') === 'link')
        return false;
    return true;
  });
  if (bodies.length !== 1) return null;
  const description = textOf(bodies[0]);
  if (!description) return null;
  return {
    externalId: url.pathname.split('/').at(-1) ?? '',
    url: url.href,
    authorHandle,
    description,
    publicationDate: time,
  };
}
export function matchingXPublicationCandidates(
  document: Document,
  attempt: PublicationCaptureAttempt,
  now = Date.now(),
): XPublicationCandidate[] {
  return [
    ...new Map(
      [
        ...document.querySelectorAll(
          'article[data-testid="tweet"][role="article"]',
        ),
      ].flatMap((article) => {
        const candidate = extractXPublicationCandidate(article);
        if (!candidate) return [];
        const time = Date.parse(candidate.publicationDate);
        return candidate.authorHandle === attempt.authorHandle &&
          candidate.description === attempt.description &&
          !attempt.baselineIds.includes(candidate.externalId) &&
          time >= Math.floor(attempt.startedAt / 1000) * 1000 &&
          time <= attempt.startedAt + 60000 &&
          time <= now + 5000
          ? [[candidate.externalId, candidate] as const]
          : [];
      }),
    ).values(),
  ];
}
export function attachXPublicationObserver(): () => void {
  if (!isXHome(location.href)) return () => undefined;
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
        removePublicationStatus();
      } else if (
        active &&
        (!context.scope ||
          JSON.stringify(active.scope) !== JSON.stringify(context.scope))
      ) {
        cancel();
      }
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
    }
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
    if (!isXHome(location.href)) {
      cleanup();
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
    if (!isXHome(location.href)) {
      cleanup();
      return;
    }
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
    const composer = findXPublicationComposer(document);
    if (
      !composer ||
      !isTrustedXSubmission(event.isTrusted, event.target, composer)
    )
      return;
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
    const account = document.querySelector(
      '[data-testid="SideNav_AccountSwitcher_Button"]',
    );
    const handles =
      (account?.textContent ?? '').match(/@[a-z0-9_]{1,15}(?![a-z0-9_])/gi) ??
      [];
    if (handles.length !== 1) {
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
          const candidate = extractXPublicationCandidate(article);
          return candidate ? [candidate.externalId] : [];
        }),
      ),
    ];
    if (baselineIds.length > 10000) {
      showPublicationStatus('Could not confirm publication');
      return;
    }
    const attempt: PublicationCaptureAttempt = {
      id: crypto.randomUUID(),
      scope: context.scope,
      startedAt: Date.now(),
      documentUrl: location.href,
      authorHandle: handles[0].slice(1).toLowerCase(),
      description,
      baselineIds,
    };
    frozenAttempt = null;
    frozenObservation = null;
    completing = false;
    active = attempt;
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
    frozenAttempt = null;
    frozenObservation = null;
    observer.disconnect();
    clearTimeout(scanTimer);
    clearTimeout(confirmTimer);
    clearTimeout(expiryTimer);
    document.removeEventListener('click', click, true);
    window.removeEventListener('focus', focus);
    window.removeEventListener('popstate', navigation);
    window.removeEventListener('pagehide', cleanup);
    chrome.storage.onChanged.removeListener(changed);
    removePublicationStatus();
  }
  const navigation = () => {
    if (!isXHome(location.href)) cleanup();
  };
  document.addEventListener('click', click, true);
  window.addEventListener('focus', focus);
  window.addEventListener('popstate', navigation);
  window.addEventListener('pagehide', cleanup);
  chrome.storage.onChanged.addListener(changed);
  void refresh();
  return cleanup;
}
