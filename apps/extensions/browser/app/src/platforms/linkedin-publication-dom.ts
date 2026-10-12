import type {
  LinkedInPublicationCandidate,
  LinkedInPublicationComposer,
  PublicationCaptureAttempt,
  PublicationCaptureParent,
} from '@genfeedai/contracts/interfaces/extension/extension-publication-observer.interface';
import {
  canonicalLinkedInUrn,
  linkedInPermalink,
  linkedInPostUrn,
  publicationCaptureLinkedInSlug,
  publicationCapturePageUrl,
  publicationCapturePlatform,
  validPublicationCaptureIdentity,
} from '~services/publication-capture-validation';
import { normalizePublicationWrittenText } from '~services/publication-capture-written';

// LinkedIn exposes no test ids, so these are the class names its share box, comment box,
// feed update and toast carry. Anything that stops matching fails closed: nothing is captured.
const POST_SUBMIT = 'button.share-actions__primary-action';
const EDITOR =
  '.ql-editor[contenteditable="true"], [role="textbox"][contenteditable="true"]';
const COMMENT_ROOT = 'form.comments-comment-box__form, .comments-comment-box';
const COMMENT_SUBMIT = 'button.comments-comment-box__submit-button';
const COMMENT_ENTITY = '[data-id^="urn:li:comment:"]';
const COMMENT_BODY =
  '.comments-comment-item__main-content, .comments-comment-entity__content';
const COMMENT_ACTOR =
  '.comments-comment-meta a[href*="/in/"], .comments-post-meta a[href*="/in/"]';
const UPDATE_BODY =
  '.update-components-text, .feed-shared-update-v2__description, .feed-shared-text';
const UPDATE_ACTOR =
  '.update-components-actor a[href*="/in/"], .feed-shared-actor a[href*="/in/"]';
const TOAST_LINKS =
  '.artdeco-toast-item a[href], .artdeco-toasts a[href], [data-test-artdeco-toast-item] a[href]';
const POST_URN = /^urn:li:(?:activity|share|ugcPost):\d+$/;
const POST_PATH =
  /^\/feed\/update\/(urn:li:(?:activity|share|ugcPost):\d+)\/?$/;
const ID_TIME_SHIFT = BigInt(22);
const MAX_CLOCK_DRIFT_MS = 400 * 24 * 60 * 60 * 1000;
const SKEW_MS = 120_000;

const textOf = (element: Element) =>
  normalizePublicationWrittenText(
    (element as HTMLElement).innerText ?? element.textContent ?? '',
  );
export function isLinkedInPublicationPage(value: string): boolean {
  return publicationCapturePlatform(value) === 'linkedin';
}
function postContainerUrn(element: Element): string | null {
  for (
    let node: Element | null = element.closest('[data-urn]');
    node;
    node = node.parentElement?.closest('[data-urn]') ?? null
  ) {
    const urn = node.getAttribute('data-urn') ?? '';
    if (POST_URN.test(urn)) return urn;
  }
  return null;
}
function parentOf(
  root: Element,
  origin: string,
): PublicationCaptureParent | null {
  const comment = root.closest(COMMENT_ENTITY);
  const id = comment
    ? canonicalLinkedInUrn(comment.getAttribute('data-id'))
    : postContainerUrn(root);
  const post = id ? linkedInPostUrn(id) : null;
  const url = post ? linkedInPermalink(origin, post) : null;
  return id && url ? { externalId: id, url } : null;
}
/** The composer a click landed in: the share-box Post button, or a comment/reply Send button. */
export function findLinkedInComposer(
  target: EventTarget | null,
  origin: string,
): LinkedInPublicationComposer | null {
  if (!(target instanceof Element)) return null;
  const post = target.closest<HTMLElement>(POST_SUBMIT);
  const comment = post ? null : target.closest<HTMLElement>(COMMENT_SUBMIT);
  const submit = post ?? comment;
  const root = post
    ? post.closest('[role="dialog"]')
    : (comment?.closest(COMMENT_ROOT) ?? null);
  if (!submit || !root) return null;
  const editors = [...root.querySelectorAll<HTMLElement>(EDITOR)];
  if (editors.length !== 1) return null;
  if (post) {
    // A share box never contains a comment box; refuse a mixed container.
    return root.querySelector(COMMENT_ROOT)
      ? null
      : { root, editor: editors[0], submit, kind: 'post', parent: null };
  }
  const parent = parentOf(root, origin);
  return parent
    ? { root, editor: editors[0], submit, kind: 'comment', parent }
    : null;
}
export function isTrustedLinkedInSubmission(
  isTrusted: boolean,
  target: EventTarget | null,
  composer: LinkedInPublicationComposer,
): boolean {
  return (
    isTrusted &&
    target instanceof Node &&
    composer.submit.contains(target) &&
    !composer.submit.hasAttribute('disabled') &&
    composer.submit.getAttribute('aria-disabled') !== 'true'
  );
}
function toastUrns(document: Document, origin: string): string[] {
  return [
    ...new Set(
      [...document.querySelectorAll<HTMLAnchorElement>(TOAST_LINKS)].flatMap(
        (anchor) => {
          try {
            const url = new URL(anchor.getAttribute('href') ?? '', origin);
            const urn = POST_PATH.exec(url.pathname)?.[1];
            return urn && url.origin === origin && !url.search ? [urn] : [];
          } catch {
            return [];
          }
        },
      ),
    ),
  ];
}
/** Everything already on the page when the user submits: none of it can be the new publication. */
export function linkedInBaselineIds(
  document: Document,
  origin: string,
): string[] {
  const ids = new Set<string>(toastUrns(document, origin));
  for (const element of document.querySelectorAll('[data-urn],[data-id]'))
    for (const name of ['data-urn', 'data-id']) {
      const urn = canonicalLinkedInUrn(element.getAttribute(name));
      if (urn) ids.add(urn);
    }
  return [...ids];
}
function authorSlug(
  scope: Element,
  selector: string,
  origin: string,
): string | null {
  for (const anchor of scope.querySelectorAll<HTMLAnchorElement>(selector)) {
    try {
      const url = new URL(anchor.getAttribute('href') ?? '', origin);
      const slug = /^\/in\/([^/]+)\/?$/.exec(url.pathname)?.[1]?.toLowerCase();
      if (
        publicationCapturePlatform(url.href) === 'linkedin' &&
        publicationCaptureLinkedInSlug(slug)
      )
        return slug;
    } catch {
      /* A malformed href is not an author. */
    }
  }
  return null;
}
/** LinkedIn ids are snowflakes: the leading bits are the creation time in milliseconds. */
function idTime(urn: string): number | null {
  const id = /(\d+)\)?$/.exec(urn)?.[1];
  if (!id) return null;
  try {
    return Number(BigInt(id) >> ID_TIME_SHIFT);
  } catch {
    return null;
  }
}
/**
 * When the publication happened. A readable id must fall near the attempt (an older element
 * that merely scrolled into view is not this publication); an unreadable one is dated by
 * observation. The date is clamped into the window the capture contract accepts.
 */
function publicationTime(
  urn: string,
  attempt: PublicationCaptureAttempt,
  now: number,
): string | null {
  const decoded = idTime(urn);
  const readable =
    decoded !== null && Math.abs(decoded - now) < MAX_CLOCK_DRIFT_MS;
  if (
    readable &&
    (decoded < attempt.startedAt - SKEW_MS || decoded > now + SKEW_MS)
  )
    return null;
  const lower = Math.floor(attempt.startedAt / 1000) * 1000;
  const upper = Math.min(attempt.startedAt + 60000, now + 5000);
  if (upper < lower) return null;
  return new Date(
    Math.min(Math.max(readable ? decoded : now, lower), upper),
  ).toISOString();
}
function postCandidates(
  document: Document,
  attempt: PublicationCaptureAttempt,
  origin: string,
  now: number,
): LinkedInPublicationCandidate[] {
  return toastUrns(document, origin).flatMap((urn) => {
    const publicationDate = publicationTime(urn, attempt, now);
    const url = linkedInPermalink(origin, urn);
    if (!publicationDate || !url) return [];
    // When the update itself is on the page its text must be the text that was submitted.
    const update = document.querySelector(`[data-urn="${urn}"]`);
    const body = update?.querySelector(UPDATE_BODY);
    if (
      body &&
      textOf(body) !== normalizePublicationWrittenText(attempt.description)
    )
      return [];
    return [
      {
        externalId: urn,
        url,
        authorHandle: update ? authorSlug(update, UPDATE_ACTOR, origin) : null,
        publicationDate,
      },
    ];
  });
}
function commentCandidates(
  document: Document,
  attempt: PublicationCaptureAttempt,
  parent: PublicationCaptureParent,
  origin: string,
  now: number,
): LinkedInPublicationCandidate[] {
  const post = linkedInPostUrn(parent.externalId);
  const text = normalizePublicationWrittenText(attempt.description);
  return [...document.querySelectorAll(COMMENT_ENTITY)].flatMap((entity) => {
    const urn = canonicalLinkedInUrn(entity.getAttribute('data-id'));
    const body = entity.querySelector(COMMENT_BODY);
    const publicationDate = urn ? publicationTime(urn, attempt, now) : null;
    const url = urn ? linkedInPermalink(origin, urn) : null;
    return urn &&
      url &&
      publicationDate &&
      body &&
      linkedInPostUrn(urn) === post &&
      !attempt.baselineIds.includes(urn) &&
      textOf(body) === text
      ? [
          {
            externalId: urn,
            url,
            authorHandle: authorSlug(entity, COMMENT_ACTOR, origin),
            publicationDate,
          },
        ]
      : [];
  });
}
/** Publications on the page that this attempt, and only this attempt, could have produced. */
export function matchingLinkedInPublicationCandidates(
  document: Document,
  attempt: PublicationCaptureAttempt,
  now = Date.now(),
): LinkedInPublicationCandidate[] {
  const origin = publicationCapturePageUrl(attempt.documentUrl)?.origin ?? '';
  const surface = attempt.surface;
  const found =
    surface.kind === 'linkedin-post'
      ? postCandidates(document, attempt, origin, now)
      : surface.kind === 'linkedin-comment'
        ? commentCandidates(document, attempt, surface.parent, origin, now)
        : [];
  return [
    ...new Map(
      found
        .filter(
          (candidate) =>
            !attempt.baselineIds.includes(candidate.externalId) &&
            validPublicationCaptureIdentity(
              origin,
              candidate.externalId,
              candidate.url,
              candidate.authorHandle,
            ),
        )
        .map((candidate) => [candidate.externalId, candidate] as const),
    ).values(),
  ];
}
