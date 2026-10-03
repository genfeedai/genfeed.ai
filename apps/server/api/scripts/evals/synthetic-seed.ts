import {
  ContentFormat,
  PostCategory,
  PostFormat,
  ReviewDecision,
} from '@genfeedai/contracts';
import type {
  GoldenBrandRecord,
  GoldenPostRecord,
  GoldenSetScopeSnapshot,
} from './golden-set.types';

const SYNTHETIC_BRANDS = [
  {
    id: 'synthetic-brand-kelder',
    label: 'KELDER',
    slug: 'kelder',
    topics: [
      'a skillet for a quiet breakfast',
      'a stockpot for vegetable broth',
      'a saucepan for citrus glaze',
      'a roasting tray for garden roots',
    ],
  },
  {
    id: 'synthetic-brand-quillmoor',
    label: 'Quillmoor Paper Co.',
    slug: 'quillmoor',
    topics: [
      'a notebook for small observations',
      'a card for a thoughtful thank you',
      'a planner for a gentle weekly rhythm',
      'a sketch pad for imagined gardens',
    ],
  },
  {
    id: 'synthetic-brand-tarnfield',
    label: 'Tarnfield Outdoor',
    slug: 'tarnfield',
    topics: [
      'a daypack for a woodland loop',
      'a rain shell for a misty ridge',
      'a flask for a hillside rest',
      'a trail pouch for a short ramble',
    ],
  },
] as const;
const TIERS = [
  {
    name: 'strong',
    decision: ReviewDecision.APPROVED,
    score: 88,
    line: 'Start with one useful detail, show how it helps, and invite a considered next step.',
  },
  {
    name: 'middling',
    decision: ReviewDecision.APPROVED,
    score: 64,
    line: 'Here is a useful option to explore for the next ordinary day.',
  },
  {
    name: 'weak',
    decision: ReviewDecision.REJECTED,
    score: 18,
    line: 'Amazing things are amazing. Buy everything immediately, because everything is perfect.',
  },
] as const;
type SyntheticBrand = (typeof SYNTHETIC_BRANDS)[number];
type SyntheticTier = (typeof TIERS)[number];
function identifiers(brand: GoldenBrandRecord): string {
  return `${brand.label} at Golden Synthetic Studio. Mara Lindqvist and Tobias Venn share @${brand.slug}_studio, https://${brand.slug}.example/notes and hello@${brand.slug}.example. Reference c0123456789abcdef01234567.`;
}
function socialPost(
  brand: SyntheticBrand,
  topic: string,
  tier: SyntheticTier,
): string {
  return `A ${tier.name} social note about ${topic}. ${tier.line} ${identifiers(brand)}`;
}
function thread(
  brand: SyntheticBrand,
  topic: string,
  tier: SyntheticTier,
): string {
  return `Thread opening (${tier.name}): consider ${topic}. ${tier.line} ${identifiers(brand)}`;
}
function article(
  brand: SyntheticBrand,
  topic: string,
  tier: SyntheticTier,
): string {
  return `An invented ${tier.name} field guide to ${topic}.\n\nBegin with the situation, examine a practical choice, and leave room for reflection. ${tier.line}\n\n${identifiers(brand)}`;
}
function script(
  brand: SyntheticBrand,
  topic: string,
  tier: SyntheticTier,
): string {
  return `Short video (${tier.name}) about ${topic}.\nScene 1: reveal the item on a plain table.\nScene 2: demonstrate one everyday use.\nVoiceover: ${tier.line}\n${identifiers(brand)}`;
}
function newsletter(
  brand: SyntheticBrand,
  topic: string,
  tier: SyntheticTier,
): string {
  return `A ${tier.name} letter about ${topic}.\n\nThis week we explore one modest idea and a practical way to try it. ${tier.line}\n\nUntil next time. ${identifiers(brand)}`;
}
function imageCaption(
  brand: SyntheticBrand,
  topic: string,
  tier: SyntheticTier,
): string {
  return `A still-life caption (${tier.name}) for ${topic}. Soft side light reveals the shape and texture. ${tier.line} ${identifiers(brand)}`;
}
export function buildSyntheticSnapshot(): GoldenSetScopeSnapshot {
  const organization = {
    id: 'synthetic-org-golden',
    label: 'Golden Synthetic Studio',
    slug: 'golden-synthetic-studio',
  };
  const createdAt = new Date('2026-01-15T12:00:00.000Z');
  const scoped = {
    organizationId: organization.id,
    isDeleted: false,
    createdAt,
  };
  const snapshot: GoldenSetScopeSnapshot = {
    scope: { organizationId: organization.id, brandIds: [] },
    organization,
    brands: SYNTHETIC_BRANDS.map(({ id, label, slug }) => ({
      id,
      label,
      slug,
    })),
    credentials: SYNTHETIC_BRANDS.map((brand) => ({
      brandId: brand.id,
      externalHandle: `@${brand.slug}_studio`,
      externalName: null,
      username: null,
    })),
    members: [
      {
        user: {
          firstName: 'Mara',
          lastName: 'Lindqvist',
          name: 'Mara Lindqvist',
          handle: 'mara_lindqvist',
        },
      },
      {
        user: {
          firstName: 'Tobias',
          lastName: 'Venn',
          name: 'Tobias Venn',
          handle: 'tobias_venn',
        },
      },
    ],
    posts: [],
    batchItems: [],
    evaluations: [],
    newsletters: [],
    profiles: [],
    contextBases: [],
    contextEntries: [],
    linkedPosts: [],
    linkedArticles: [],
    linkedNewsletters: [],
    linkedBatchItems: [],
    threadChildren: [],
  };
  for (const brand of SYNTHETIC_BRANDS) {
    const avoidFeedback: Array<{
      source: string;
      content: string;
      addedAt: string;
    }> = [];
    const baseId = `synthetic-winners-${brand.slug}`;
    snapshot.contextBases.push({
      ...scoped,
      id: baseId,
      data: { brandId: brand.id, purpose: 'harness-performance-winners' },
    });
    for (const [index, topic] of brand.topics.entries()) {
      for (const tier of TIERS) {
        const suffix = `${brand.slug}-${index + 1}-${tier.name}`;
        const postId = `synthetic-social-${suffix}`;
        const post: GoldenPostRecord = {
          ...scoped,
          id: postId,
          brandId: brand.id,
          parentId: null,
          order: 0,
          format: PostFormat.STANDARD,
          category: PostCategory.TEXT,
          description: socialPost(brand, topic, tier),
          promptUsed: `Write an invented social post about ${topic} for ${brand.label}.`,
          platform: 'instagram',
          reviewDecision: tier.decision,
          reviewEvents: [],
        };
        snapshot.posts.push(post);
        if (index < 2)
          snapshot.evaluations.push({
            ...scoped,
            id: `synthetic-evaluation-social-${suffix}`,
            contentType: 'post',
            contentId: postId,
            data: {
              brandId: brand.id,
              review: {
                reviewerId: 'synthetic-reviewer',
                decision: tier.decision,
                reviewerScore: tier.score,
                reviewedAt: createdAt.toISOString(),
              },
            },
          });
        if (index < 2 && tier.name === 'strong')
          snapshot.contextEntries.push({
            ...scoped,
            id: `synthetic-winner-${suffix}`,
            contextBaseId: baseId,
            data: {
              content: `Winning post: ${post.description}`,
              metadata: { postId, platform: 'instagram' },
            },
          });
        const threadId = `synthetic-thread-${suffix}`;
        snapshot.posts.push({
          ...post,
          id: threadId,
          format: PostFormat.THREAD,
          description: thread(brand, topic, tier),
          promptUsed: `Write an invented thread about ${topic} for ${brand.label}.`,
        });
        for (let child = 1; child <= 2; child++)
          snapshot.threadChildren.push({
            ...post,
            id: `${threadId}-child-${child}`,
            parentId: threadId,
            order: child,
            description: `Segment ${child} (${tier.name}) for ${topic}: ${child === 1 ? 'Show a small concrete example.' : 'Invite a simple next step.'}`,
            reviewDecision: null,
          });
        const articleId = `synthetic-article-${suffix}`;
        snapshot.linkedArticles.push({
          ...scoped,
          id: articleId,
          brandId: brand.id,
          content: article(brand, topic, tier),
          summary: null,
        });
        snapshot.evaluations.push({
          ...scoped,
          id: `synthetic-evaluation-article-${suffix}`,
          contentType: 'article',
          contentId: articleId,
          data: {
            brandId: brand.id,
            review: {
              reviewerId: 'synthetic-reviewer',
              decision: tier.decision,
              reviewerScore: tier.score,
              reviewedAt: createdAt.toISOString(),
            },
          },
        });
        snapshot.batchItems.push({
          ...scoped,
          id: `synthetic-script-${suffix}`,
          brandId: brand.id,
          reviewDecision: tier.decision,
          data: {
            format: ContentFormat.VIDEO,
            caption: script(brand, topic, tier),
            platform: 'instagram',
          },
        });
        snapshot.batchItems.push({
          ...scoped,
          id: `synthetic-image-caption-${suffix}`,
          brandId: brand.id,
          reviewDecision: tier.decision,
          data: {
            format: ContentFormat.IMAGE,
            caption: imageCaption(brand, topic, tier),
            platform: 'instagram',
          },
        });
        const newsletterRecord = {
          ...scoped,
          id: `synthetic-newsletter-${suffix}`,
          brandId: brand.id,
          content: newsletter(brand, topic, tier),
          summary: null,
          generationPrompt: `Write an invented newsletter about ${topic} for ${brand.label}.`,
          approvedAt: tier.name === 'weak' ? null : createdAt,
          approvedByUserId: tier.name === 'weak' ? null : 'synthetic-reviewer',
        };
        if (tier.name === 'weak') {
          snapshot.linkedNewsletters.push(newsletterRecord);
          avoidFeedback.push({
            source: `newsletter:${newsletterRecord.id}`,
            content: newsletterRecord.content,
            addedAt: createdAt.toISOString(),
          });
        } else snapshot.newsletters.push(newsletterRecord);
      }
    }
    snapshot.profiles.push({
      ...scoped,
      id: `synthetic-profile-${brand.slug}`,
      data: {
        profileType: 'harness',
        brandId: brand.id,
        handles: [`@${brand.slug}_studio`],
        avoidFeedback,
        examples: {
          good: [
            `An invented seed about a calm morning ritual from ${brand.label}. Begin with one observable detail. ${identifiers(brand)}`,
            `An invented seed about a small weekend project from ${brand.label}. Show a thoughtful first step. ${identifiers(brand)}`,
          ],
          avoid: [
            `An invented weak seed from ${brand.label}: greatness is great, buy it all without thinking. ${identifiers(brand)}`,
          ],
        },
      },
    });
  }
  return snapshot;
}
