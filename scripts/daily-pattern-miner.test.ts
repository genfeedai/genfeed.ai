import { describe, expect, it } from 'vitest';
import { buildPatternReport, scoreCandidates } from './daily-pattern-miner';

describe('daily-pattern-miner', () => {
  it('scores candidates from the current nested analysis JSON shape', () => {
    const candidates = scoreCandidates({
      counts: {
        categories: {
          agent_skilling: 4,
          coding_backend: 6,
          coding_frontend: 2,
          debugging_testing: 9,
          docs_content: 3,
        },
        projects: {
          genfeed: 12,
          shipshit: 2,
        },
        tools: {
          Bash: 300,
          Task: 20,
          TaskUpdate: 30,
        },
      },
    });

    expect(candidates[0]?.name).toBe('CI triage-and-fix loop');
    expect(candidates[0]?.score).toBeGreaterThan(
      candidates[candidates.length - 1]?.score ?? 0,
    );
  });

  it('still supports the previous flat analysis JSON shape', () => {
    const candidates = scoreCandidates({
      categoryCounts: {
        agent_skilling: 8,
        debugging_testing: 1,
      },
      toolCounts: {
        Bash: 20,
      },
    });

    expect(candidates[0]?.name).toBe('Plan-to-execution runbook');
  });

  it('renders a report with ranked candidates and weekly promotion queue', () => {
    const report = buildPatternReport(
      {
        counts: {
          categories: {
            agent_skilling: 5,
            debugging_testing: 7,
          },
          projects: {
            genfeed: 3,
          },
          tools: {
            Bash: 200,
            Task: 4,
          },
        },
        events: {
          userMessages: 20,
        },
        generatedAt: '2026-06-01T00:00:00.000Z',
        options: {
          since: '2026-05-31T00:00:00.000Z',
          until: '2026-06-01T00:00:00.000Z',
        },
        scope: {
          uniqueSessions: 4,
        },
      },
      { now: new Date('2026-06-01T09:00:00.000Z') },
    );

    expect(report).toContain('# Claude Pattern Miner Report');
    expect(report).toContain(
      'Window: 2026-05-31T00:00:00.000Z -> 2026-06-01T00:00:00.000Z',
    );
    expect(report).toContain('## Ranked Candidates');
    expect(report).toContain('## Weekly Promotion Queue');
    expect(report).toContain('CI triage-and-fix loop');
  });
});
