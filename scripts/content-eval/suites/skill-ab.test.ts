import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { UsageError } from '../cli';
import type { ContentEvalRunOptions, FixtureRow } from '../contracts';
import { contentEvalReportSchema } from '../contracts';
import { createStubDispatcher } from '../dispatchers/stub';
import { loadFixture } from '../fixtures';
import { runContentEval } from '../runner';
import { buildGenerationMessages, generationMaxTokens } from './compare';

const FIXTURE = fileURLToPath(
  new URL(
    '../../../apps/server/api/test/fixtures/content-evals/skill-ab/video-composition.synthetic.jsonl',
    import.meta.url,
  ),
);
const MODEL = 'deepseek/deepseek-v4-flash-0731';
const JUDGE = 'openai/gpt-5.6-luna';

function skillDirectory(name: string, body: string): string {
  const directory = join(mkdtempSync(join(tmpdir(), 'skill-ab-')), name);
  mkdirSync(directory);
  writeFileSync(
    join(directory, 'SKILL.md'),
    `---\nname: ${name}\ndescription: test skill\n---\n\n${body}\n`,
  );
  return directory;
}

function options(
  arms: string,
  overrides: Partial<ContentEvalRunOptions> = {},
): ContentEvalRunOptions {
  return {
    argv: [`--skill-arms=${arms}`],
    createDispatcher: async () => createStubDispatcher(),
    dispatcherKind: 'stub',
    fixturePath: FIXTURE,
    judgeRegistryKeys: [JUDGE],
    maxCredits: 200,
    models: [MODEL],
    now: new Date('2026-11-13T12:00:00.000Z'),
    runId: 'skill-ab-test',
    seed: 1,
    suite: 'skill-ab',
    tieBand: 0.05,
    ...overrides,
  };
}

describe('skill-ab fixture', () => {
  const { rows } = loadFixture(FIXTURE);

  it('holds only synthetic rows with unique ids', () => {
    expect(rows).toHaveLength(6);
    expect(new Set(rows.map((row) => row.id)).size).toBe(rows.length);
    expect(rows.every((row) => row.source.visibility === 'synthetic')).toBe(
      true,
    );
  });
});

describe('skill-ab messages', () => {
  const row = loadFixture(FIXTURE).rows[0] as FixtureRow;
  const contestant = (skillPrompt?: string) => ({
    guidanceArm: 'skill' as const,
    id: 'c',
    isCompiled: false,
    registryKey: MODEL,
    ...(skillPrompt ? { skillPrompt } : {}),
  });

  it('puts the skill ahead of the brand rules, and the control gets the rules alone', () => {
    const [withSkill] = buildGenerationMessages(row, contestant('SKILL-TEXT'));
    const [control] = buildGenerationMessages(row, contestant());

    expect(String(withSkill?.content).startsWith('SKILL-TEXT\n\n')).toBe(true);
    expect(String(withSkill?.content)).toContain('Organization: Kelder Group');
    expect(String(control?.content)).not.toContain('SKILL-TEXT');
    expect(String(control?.content)).toContain('Organization: Kelder Group');
  });

  it('gives every skill arm the same larger output limit', () => {
    expect(generationMaxTokens(contestant('s'))).toBe(
      generationMaxTokens(contestant()),
    );
    expect(generationMaxTokens(contestant())).toBeGreaterThan(1024);
  });
});

describe('skill-ab suite (stub dispatcher)', () => {
  it('judges every challenger skill against the baseline skill on every row', async () => {
    const ours = skillDirectory('ours', 'Write calm, precise compositions.');
    const other = skillDirectory('other', 'Build every scene as HTML.');
    const { report } = await runContentEval(
      options(`ours=${ours},other=${other},none`),
    );

    expect(contentEvalReportSchema.safeParse(report).success).toBe(true);
    expect(report).toMatchObject({
      aborted: null,
      evidenceKind: 'stub-dispatcher',
      modelQualityAssessed: false,
      suite: 'skill-ab',
    });
    expect(report.config.contestants.map((arm) => arm.id)).toEqual([
      `${MODEL}#skill:ours`,
      `${MODEL}#skill:other`,
      `${MODEL}#skill:none`,
    ]);
    expect(report.outcome.pairs).toHaveLength(12);
    expect(
      new Set(report.outcome.pairs.map((pair) => pair.challengerId)),
    ).toEqual(new Set([`${MODEL}#skill:other`, `${MODEL}#skill:none`]));
  });

  it('accepts --repeats for the noise section like the other text A/Bs', async () => {
    const ours = skillDirectory('ours', 'One.');
    const { report } = await runContentEval(
      options(`ours=${ours},none`, { repeats: 2 }),
    );

    expect(report.config.repeats).toBe(2);
    expect(report.noise).toBeDefined();
  });

  it('refuses a single arm, several models and a missing skill file before any call', async () => {
    await expect(runContentEval(options('none'))).rejects.toThrow(UsageError);
    await expect(
      runContentEval(options('a=/nonexistent,none')),
    ).rejects.toThrow('cannot read');
    await expect(
      runContentEval(options('a=/x,none', { models: [MODEL, JUDGE] })),
    ).rejects.toThrow('exactly one --models key');
  });
});
