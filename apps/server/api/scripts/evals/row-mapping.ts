import { createHash } from 'node:crypto';
import {
  ContentFormat,
  PostCategory,
  PostFormat,
  parseReviewDecision,
  ReviewDecision,
} from '@genfeedai/contracts';
import { CONTENT_EVAL_THRESHOLDS } from '../../../../../scripts/content-eval/contracts';
import type { ScoreBand } from '../../../../../scripts/content-eval/rows';
import type {
  GoldenBatchItemRecord,
  GoldenCandidate,
  GoldenContentKind,
  GoldenContextEntryRecord,
  GoldenDecision,
  GoldenEvaluationRecord,
  GoldenLabel,
  GoldenLabelSource,
  GoldenNewsletterRecord,
  GoldenPostRecord,
  GoldenProfileRecord,
  GoldenSetExcluded,
  GoldenSetScopeSnapshot,
} from './golden-set.types';

function record(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function string(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}
function records(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}
function decision(value: unknown): GoldenDecision | null {
  const parsed = parseReviewDecision(value).decision;
  if (parsed === ReviewDecision.APPROVED) return 'approve';
  if (
    parsed === ReviewDecision.REJECTED ||
    parsed === ReviewDecision.REQUEST_CHANGES
  )
    return 'reject';
  return null;
}
function evaluationDecision(value: unknown): GoldenDecision | null {
  if (typeof value !== 'string') return null;
  return value.toLowerCase() === 'needs_changes' ? 'reject' : decision(value);
}
function epoch(value: unknown): number {
  const parsed = Date.parse(string(value) ?? '');
  return Number.isNaN(parsed) ? Number.NEGATIVE_INFINITY : parsed;
}
function label(
  source: GoldenLabelSource,
  raterKey: string,
  value: GoldenDecision | null,
  createdAt: Date,
  id: string,
  score: number | null = null,
): GoldenLabel[] {
  return value === null && score === null
    ? []
    : [
        {
          source,
          raterKey,
          decision: value,
          score,
          order: [createdAt.getTime(), id],
        },
      ];
}
function latestReviewers(
  value: unknown,
  dateKey: string,
): Map<string, Record<string, unknown>> {
  const latest = new Map<string, Record<string, unknown>>();
  for (const event of records(value)) {
    const reviewerId = string(event.reviewerId);
    if (reviewerId === null) continue;
    const prior = latest.get(reviewerId);
    if (!prior || epoch(event[dateKey]) >= epoch(prior[dateKey]))
      latest.set(reviewerId, event);
  }
  return latest;
}
function reviewLabels(
  source: GoldenLabelSource,
  column: unknown,
  events: unknown,
  createdAt: Date,
  id: string,
): GoldenLabel[] {
  const latest = latestReviewers(events, 'reviewedAt');
  return latest.size === 0
    ? label(source, 'column', decision(column), createdAt, id)
    : [...latest].flatMap(([reviewerId, event]) =>
        label(source, reviewerId, decision(event.decision), createdAt, id),
      );
}
export function resolvePostKind(
  post: GoldenPostRecord,
): GoldenContentKind | null {
  if (post.parentId !== null) return null;
  if (post.format === PostFormat.THREAD) return 'thread';
  if (post.category === PostCategory.ARTICLE) return 'article';
  if (post.category === PostCategory.IMAGE) return 'image-caption';
  if (
    [PostCategory.VIDEO, PostCategory.REEL, PostCategory.STORY].some(
      (category) => category === post.category,
    )
  )
    return 'script';
  if (
    post.category === PostCategory.TEXT ||
    post.category === PostCategory.POST
  )
    return 'social-post';
  return null;
}
export function resolveBatchItemKind(
  item: GoldenBatchItemRecord,
): GoldenContentKind | null {
  const data = record(item.data);
  if (data.type === 'engagement') return null;
  if (
    data.format === ContentFormat.IMAGE ||
    data.format === ContentFormat.CAROUSEL
  )
    return 'image-caption';
  if (
    [ContentFormat.VIDEO, ContentFormat.REEL, ContentFormat.STORY].some(
      (format) => format === data.format,
    )
  )
    return 'script';
  return null;
}
export function extractPostLabels(post: GoldenPostRecord): GoldenLabel[] {
  return reviewLabels(
    'post-review',
    post.reviewDecision,
    post.reviewEvents,
    post.createdAt,
    post.id,
  );
}
export function extractBatchItemLabels(
  item: GoldenBatchItemRecord,
): GoldenLabel[] {
  return reviewLabels(
    'batch-item-review',
    item.reviewDecision,
    record(item.data).reviewEvents,
    item.createdAt,
    item.id,
  );
}
export function extractEvaluationLabels(
  evaluation: GoldenEvaluationRecord,
): GoldenLabel[] {
  const data = record(evaluation.data);
  const review = record(data.review);
  const reviewerId = string(review.reviewerId);
  const labels: GoldenLabel[] = [];
  if (reviewerId !== null) {
    labels.push(
      ...label(
        'evaluation-decision',
        reviewerId,
        evaluationDecision(review.decision),
        evaluation.createdAt,
        evaluation.id,
      ),
    );
    if (
      typeof review.reviewerScore === 'number' &&
      Number.isFinite(review.reviewerScore)
    ) {
      const score = Math.max(0, Math.min(100, review.reviewerScore));
      labels.push(
        ...label(
          'evaluation-score',
          reviewerId,
          score / 100 >= CONTENT_EVAL_THRESHOLDS.acceptedMinScore
            ? 'approve'
            : 'reject',
          evaluation.createdAt,
          evaluation.id,
          score,
        ),
      );
    }
  }
  for (const [id, comment] of latestReviewers(
    data.reviewerComments,
    'createdAt',
  )) {
    if (id !== reviewerId)
      labels.push(
        ...label(
          'evaluation-decision',
          id,
          evaluationDecision(comment.decision),
          evaluation.createdAt,
          evaluation.id,
        ),
      );
  }
  return labels;
}
export function extractNewsletterLabels(
  newsletter: GoldenNewsletterRecord,
): GoldenLabel[] {
  return newsletter.approvedAt !== null && newsletter.approvedByUserId !== null
    ? label(
        'newsletter-approval',
        'approval',
        'approve',
        newsletter.createdAt,
        newsletter.id,
      )
    : [];
}
export function extractHarnessLabels(
  profile: GoldenProfileRecord,
): GoldenLabel[] {
  const data = record(profile.data);
  return [
    ...records(data.avoidFeedback).flatMap(() =>
      label('harness-avoid', 'avoid', 'reject', profile.createdAt, profile.id),
    ),
    ...['good', 'avoid'].flatMap((kind) => {
      const values = record(data.examples)[kind];
      return Array.isArray(values)
        ? values
            .filter((value): value is string => typeof value === 'string')
            .filter(
              (value) =>
                kind === 'good' ||
                !records(data.avoidFeedback).some(
                  (entry) => entry.content === value,
                ),
            )
            .flatMap(() =>
              label(
                'harness-seed',
                'operator',
                kind === 'good' ? 'approve' : 'reject',
                profile.createdAt,
                profile.id,
              ),
            )
        : [];
    }),
  ];
}
export function extractWinnerLabels(
  entry: GoldenContextEntryRecord,
): GoldenLabel[] {
  return label(
    'harness-winner',
    'engagement',
    'approve',
    entry.createdAt,
    entry.id,
  );
}
export function scoreToBand(score: number): ScoreBand {
  const index = Math.min(3, Math.floor(Math.max(0, Math.min(100, score)) / 25));
  return { min: index * 0.25, max: (index + 1) * 0.25 };
}
export function collectCandidates(snapshot: GoldenSetScopeSnapshot) {
  const candidates = new Map<string, GoldenCandidate>();
  const excluded: GoldenSetExcluded = {
    conflict: 0,
    copyOfReview: 0,
    emptyText: 0,
    missingContent: 0,
    noBrand: 0,
    noLabel: 0,
    outOfScopeBrand: 0,
    residualIdentifier: 0,
    unsupportedKind: 0,
  };
  const posts = new Map(
    [...snapshot.linkedPosts, ...snapshot.posts].map((post) => [post.id, post]),
  );
  const batches = new Map(
    [...snapshot.linkedBatchItems, ...snapshot.batchItems].map((item) => [
      item.id,
      item,
    ]),
  );
  const newsletters = new Map(
    [...snapshot.linkedNewsletters, ...snapshot.newsletters].map((item) => [
      item.id,
      item,
    ]),
  );
  const articles = new Map(
    snapshot.linkedArticles.map((item) => [item.id, item]),
  );
  function add(
    contentKey: string,
    contentKind: GoldenContentKind | null,
    brandId: string | null,
    text: string,
    promptBase: string | null,
    platform: string | null,
    labels: GoldenLabel[],
  ) {
    if (contentKind === null) {
      excluded.unsupportedKind++;
      return;
    }
    if (!brandId || !snapshot.brands.some((brand) => brand.id === brandId)) {
      excluded.noBrand++;
      return;
    }
    if (
      snapshot.scope.brandIds.length > 0 &&
      !snapshot.scope.brandIds.includes(brandId)
    ) {
      excluded.outOfScopeBrand++;
      return;
    }
    const prior = candidates.get(contentKey);
    if (prior) prior.labels.push(...labels);
    else
      candidates.set(contentKey, {
        contentKey,
        contentKind,
        brandId,
        text,
        promptBase,
        platform: platform?.toLowerCase() ?? null,
        labels,
      });
  }
  function addPost(
    post: GoldenPostRecord,
    labels: GoldenLabel[],
    fallbackBrand: string | null = null,
  ) {
    const kind = resolvePostKind(post);
    const children = snapshot.threadChildren
      .filter((child) => child.parentId === post.id)
      .sort(
        (a, b) =>
          a.order - b.order ||
          a.createdAt.getTime() - b.createdAt.getTime() ||
          (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
      );
    const text =
      kind === 'thread'
        ? [
            post.description,
            ...children.map((child) => child.description),
          ].join('\n\n')
        : post.description;
    add(
      `post:${post.id}`,
      kind,
      post.brandId || fallbackBrand,
      text,
      kind === 'image-caption' ? null : post.promptUsed,
      post.platform,
      labels,
    );
  }
  function addBatch(
    item: GoldenBatchItemRecord,
    labels: GoldenLabel[],
    fallbackBrand: string | null = null,
  ) {
    const data = record(item.data);
    add(
      `batch_item:${item.id}`,
      resolveBatchItemKind(item),
      item.brandId ?? fallbackBrand,
      string(data.caption) ?? '',
      null,
      string(data.platform),
      labels,
    );
  }
  function addNewsletter(
    item: GoldenNewsletterRecord,
    labels: GoldenLabel[],
    fallbackBrand: string | null = null,
  ) {
    add(
      `newsletter:${item.id}`,
      'newsletter',
      item.brandId ?? fallbackBrand,
      item.content ?? item.summary ?? '',
      item.generationPrompt,
      null,
      labels,
    );
  }
  function isReviewed(value: string | null): boolean {
    return decision(value) !== null;
  }
  for (const post of snapshot.posts) addPost(post, extractPostLabels(post));
  for (const item of snapshot.batchItems) {
    const post = posts.get(string(record(item.data).postId) ?? '');
    if (post && isReviewed(post.reviewDecision)) {
      excluded.copyOfReview++;
      continue;
    }
    addBatch(item, extractBatchItemLabels(item));
  }
  for (const item of snapshot.newsletters)
    addNewsletter(item, extractNewsletterLabels(item));
  for (const evaluation of snapshot.evaluations) {
    const fallbackBrand = string(record(evaluation.data).brandId);
    if (evaluation.contentType === 'post') {
      const post = posts.get(evaluation.contentId ?? '');
      if (!post) excluded.missingContent++;
      else addPost(post, extractEvaluationLabels(evaluation), fallbackBrand);
    } else if (evaluation.contentType === 'article') {
      const article = articles.get(evaluation.contentId ?? '');
      if (!article) excluded.missingContent++;
      else
        add(
          `article:${article.id}`,
          'article',
          article.brandId ?? fallbackBrand,
          article.content ?? article.summary ?? '',
          null,
          null,
          extractEvaluationLabels(evaluation),
        );
    } else excluded.unsupportedKind++;
  }
  for (const entry of snapshot.contextEntries) {
    const data = record(entry.data);
    const metadata = record(data.metadata);
    const postId = string(metadata.postId);
    const base = snapshot.contextBases.find(
      (base) => base.id === entry.contextBaseId,
    );
    const brandId = string(record(base?.data).brandId);
    const post = posts.get(postId ?? '');
    if (post) addPost(post, extractWinnerLabels(entry), brandId);
    else if (postId !== null) excluded.missingContent++;
    else
      add(
        `winner:${entry.id}`,
        'social-post',
        brandId,
        (string(data.content) ?? '').replace(/^Winning post[^:]*: /, ''),
        null,
        string(metadata.platform),
        extractWinnerLabels(entry),
      );
  }
  for (const profile of snapshot.profiles) {
    const data = record(profile.data);
    const brandId = string(data.brandId);
    const feedback = records(data.avoidFeedback);
    for (const entry of feedback) {
      const source = string(entry.source) ?? '';
      const labels = label(
        'harness-avoid',
        'avoid',
        'reject',
        profile.createdAt,
        profile.id,
      );
      const post = source.startsWith('post:')
        ? posts.get(source.slice(5))
        : undefined;
      const item = source.startsWith('batch_item:')
        ? batches.get(source.slice(11))
        : undefined;
      const newsletter = source.startsWith('newsletter:')
        ? newsletters.get(source.slice(11))
        : undefined;
      if (
        (post && isReviewed(post.reviewDecision)) ||
        (item && isReviewed(item.reviewDecision))
      ) {
        excluded.copyOfReview++;
        continue;
      }
      if (post) addPost(post, labels, brandId);
      else if (item) addBatch(item, labels, brandId);
      else if (newsletter) addNewsletter(newsletter, labels, brandId);
      else
        add(
          `harness-avoid:${profile.id}:${source}`,
          'social-post',
          brandId,
          string(entry.content) ?? '',
          null,
          null,
          labels,
        );
    }
    for (const kind of ['good', 'avoid']) {
      const values = record(data.examples)[kind];
      if (!Array.isArray(values)) continue;
      for (const text of values) {
        if (
          typeof text !== 'string' ||
          (kind === 'avoid' && feedback.some((entry) => entry.content === text))
        )
          continue;
        const hash = createHash('sha256')
          .update(text)
          .digest('hex')
          .slice(0, 16);
        add(
          `harness-seed:${profile.id}:${kind}:${hash}`,
          'social-post',
          brandId,
          text,
          null,
          null,
          label(
            'harness-seed',
            'operator',
            kind === 'good' ? 'approve' : 'reject',
            profile.createdAt,
            profile.id,
          ),
        );
      }
    }
  }
  return { candidates, excluded };
}
