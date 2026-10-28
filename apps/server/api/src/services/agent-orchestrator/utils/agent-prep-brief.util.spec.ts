import { AGENT_NEXT_STEP_DESTINATION_KEYS } from '@api/services/agent-orchestrator/constants/agent-next-step-destinations.constant';
import {
  assemblePrepBrief,
  type PrepBriefInputs,
  type PrepBriefMemory,
  type PrepBriefPassage,
  type PrepBriefPost,
} from '@api/services/agent-orchestrator/utils/agent-prep-brief.util';
import { AGENT_PREP_BRIEF_SECTIONS } from '@genfeedai/contracts/interfaces';
import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';

const NOW = new Date('2026-10-27T12:00:00.000Z');

function inputs(overrides: Partial<PrepBriefInputs> = {}): PrepBriefInputs {
  return {
    brandId: 'brand-1',
    isScanLimited: false,
    memories: [],
    now: NOW,
    passages: [],
    performance: null,
    posts: [],
    subject: {},
    windowDays: 30,
    ...overrides,
  };
}

const passage: PrepBriefPassage = {
  citation: {
    sourceId: 'src-1',
    title: 'Launch plan',
    version: 2,
    versionId: 'ver-2',
  },
  content: 'The launch moves to   Thursday\nafter the review.',
  occurredAt: '2026-10-20T10:00:00.000Z',
};

const memory: PrepBriefMemory = {
  content: 'Never use exclamation marks.',
  createdAt: new Date('2026-10-01T00:00:00.000Z'),
  currentRevisionId: 'rev-3',
  id: 'mem-1',
  kind: 'instruction',
  summary: null,
};

const post: PrepBriefPost = {
  description: 'We shipped the new pricing page today.',
  id: 'post-1',
  platform: 'twitter',
  publishedAt: new Date('2026-10-25T09:00:00.000Z'),
};

describe('assemblePrepBrief', () => {
  it('cites every kind of fact with the record it came from', () => {
    const brief = assemblePrepBrief(
      inputs({
        memories: [memory],
        passages: [passage],
        performance: {
          comments: 4,
          likes: 30,
          postCount: 2,
          shares: 5,
          topPostIds: ['post-1', 'post-2'],
          views: 1200,
        },
        posts: [post],
      }),
    );

    expect(brief.facts).toEqual([
      {
        citation: {
          kind: 'knowledge',
          sourceId: 'src-1',
          title: 'Launch plan',
          version: 2,
          versionId: 'ver-2',
        },
        occurredAt: '2026-10-20T10:00:00.000Z',
        section: 'knowledge',
        text: 'The launch moves to Thursday after the review.',
      },
      {
        citation: { kind: 'memory', memoryId: 'mem-1', revisionId: 'rev-3' },
        occurredAt: '2026-10-01T00:00:00.000Z',
        section: 'memory',
        text: 'instruction: Never use exclamation marks.',
      },
      {
        citation: { kind: 'post', platform: 'twitter', postId: 'post-1' },
        occurredAt: '2026-10-25T09:00:00.000Z',
        section: 'recent_posts',
        text: 'Published on twitter on 2026-10-25: "We shipped the new pricing page today."',
      },
      {
        citation: {
          endsAt: '2026-10-27',
          kind: 'analytics',
          postIds: ['post-1', 'post-2'],
          startsAt: '2026-09-27',
        },
        section: 'performance',
        text: 'From 2026-09-27 to 2026-10-27, 2 posts drew 1200 views, 30 likes, 4 comments and 5 shares.',
      },
    ]);
    expect(brief.missingEvidence).toEqual([]);
    expect(brief.suggestions).toEqual([]);
  });

  it('lists every missing kind of evidence instead of filling it in', () => {
    const brief = assemblePrepBrief(inputs());

    expect(brief.facts).toEqual([]);
    expect(brief.missingEvidence.map((entry) => entry.section)).toEqual([
      'knowledge',
      'memory',
      'recent_posts',
      'performance',
    ]);
    expect(brief.missingEvidence[0].reason).toContain('does not prove');
  });

  it('reports the failure when Knowledge could not be searched', () => {
    const brief = assemblePrepBrief(
      inputs({ knowledgeError: 'Select a brand first.' }),
    );
    expect(brief.missingEvidence[0]).toEqual({
      reason: 'Select a brand first.',
      section: 'knowledge',
    });
  });

  it('turns an incomplete coverage into missing evidence for its section', () => {
    const brief = assemblePrepBrief(
      inputs({
        knowledgeCoverage: [
          { family: 'knowledge', purpose: 'BRAND_TRUTH', state: 'stale' },
          { family: 'knowledge', purpose: 'RESEARCH', state: 'available' },
          { family: 'social_connections', state: 'disconnected' },
        ],
        passages: [passage],
        posts: [post],
      }),
    );

    expect(brief.missingEvidence).toContainEqual({
      reason: 'BRAND_TRUTH Knowledge is stale.',
      section: 'knowledge',
    });
    expect(brief.missingEvidence).toContainEqual({
      reason: 'Connected social accounts is disconnected.',
      section: 'performance',
    });
    expect(
      brief.missingEvidence.filter((entry) =>
        entry.reason.includes('RESEARCH'),
      ),
    ).toEqual([]);
  });

  it('suggests one existing destination per gap and never a mutation', () => {
    const brief = assemblePrepBrief(inputs());
    expect(brief.suggestions.map((entry) => entry.destination)).toEqual([
      'knowledge',
      'agent',
      'calendar',
      'connect_accounts',
    ]);
  });

  it('skips a record with nothing to say rather than citing an empty line', () => {
    const brief = assemblePrepBrief(
      inputs({
        memories: [{ ...memory, content: '  ', summary: null }],
        passages: [{ ...passage, content: '   ' }],
        posts: [{ ...post, publishedAt: null }],
        performance: {
          comments: 0,
          likes: 0,
          postCount: 0,
          shares: 0,
          topPostIds: [],
          views: 0,
        },
      }),
    );
    expect(brief.facts).toEqual([]);
  });

  it('cites a memory with no revision yet by its id alone', () => {
    const brief = assemblePrepBrief(
      inputs({
        memories: [{ ...memory, currentRevisionId: null, kind: null }],
      }),
    );
    expect(brief.facts[0]).toMatchObject({
      citation: { kind: 'memory', memoryId: 'mem-1' },
      text: 'Never use exclamation marks.',
    });
    expect(brief.facts[0].citation).not.toHaveProperty('revisionId');
  });

  it('trims a long passage and carries the scan flag and subject through', () => {
    const brief = assemblePrepBrief(
      inputs({
        isScanLimited: true,
        passages: [{ ...passage, content: 'x'.repeat(500) }],
        subject: {
          campaignId: 'camp-1',
          campaignName: 'Fall',
          topic: 'launch',
        },
      }),
    );
    expect(brief.facts[0].text).toHaveLength(240);
    expect(brief).toMatchObject({
      isScanLimited: true,
      subject: { campaignId: 'camp-1', campaignName: 'Fall', topic: 'launch' },
      windowDays: 30,
    });
  });

  it('never states a fact without a citation, whatever the records are', () => {
    const text = fc.string({ maxLength: 400 });
    const date = fc.date({
      max: new Date('2026-12-31T00:00:00.000Z'),
      min: new Date('2026-01-01T00:00:00.000Z'),
      noInvalidDate: true,
    });
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            citation: fc.record({
              sourceId: fc.string({ minLength: 1 }),
              title: text,
              version: fc.nat(),
              versionId: fc.string({ minLength: 1 }),
            }),
            content: text,
          }),
          { maxLength: 6 },
        ),
        fc.array(
          fc.record({
            content: fc.option(text, { nil: null }),
            createdAt: fc.option(date, { nil: null }),
            currentRevisionId: fc.option(fc.string({ minLength: 1 }), {
              nil: null,
            }),
            id: fc.string({ minLength: 1 }),
            kind: fc.option(fc.string(), { nil: null }),
            summary: fc.option(text, { nil: null }),
          }),
          { maxLength: 6 },
        ),
        fc.array(
          fc.record({
            description: text,
            id: fc.string({ minLength: 1 }),
            platform: fc.option(fc.string(), { nil: null }),
            publishedAt: fc.option(date, { nil: null }),
          }),
          { maxLength: 6 },
        ),
        (passages, memories, posts) => {
          const brief = assemblePrepBrief(
            inputs({ memories, passages, posts }),
          );
          for (const fact of brief.facts) {
            expect(fact.text.trim()).not.toBe('');
            expect(fact.citation.kind).toBeTruthy();
            expect(AGENT_PREP_BRIEF_SECTIONS).toContain(fact.section);
          }
          // A section with no fact is always reported as missing evidence.
          for (const section of AGENT_PREP_BRIEF_SECTIONS) {
            const hasFact = brief.facts.some(
              (fact) => fact.section === section,
            );
            const isMissing = brief.missingEvidence.some(
              (entry) => entry.section === section,
            );
            expect(hasFact || isMissing).toBe(true);
          }
          for (const suggestion of brief.suggestions) {
            expect(AGENT_NEXT_STEP_DESTINATION_KEYS).toContain(
              suggestion.destination,
            );
          }
        },
      ),
    );
  });
});
