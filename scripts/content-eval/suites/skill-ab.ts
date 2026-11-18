/**
 * `--suite=skill-ab`: the same brief and brand rules, one model, and arms that
 * differ only by the skill in the system prompt. It answers "which skill makes
 * the model write the better artifact", not "which model is better".
 *
 * The first arm is the baseline and every other arm is judged against it,
 * pairwise (both orderings) and pointwise, with the cross-family judge and the
 * deterministic brief checks the other text suites use. Arms come from local
 * skill directories, so a skill pack that is not ours is read from a checkout
 * and never copied into this repository.
 *
 * Flags (the common ones are `bun run eval:content`'s):
 *   --skill-arms=<label>=<skill dir>,...,none   two or more arms, baseline first;
 *                                               `none` is the no-skill control
 *   --models=<key>                              the one model every arm uses
 *
 * What it measures is the written artifact: a composition, a storyboard or a
 * script as text. It does not render it. A render-and-judge lane would need
 * the frame judge of the media suites and is a separate suite.
 */

import { readFlag, UsageError } from '../cli';
import type { SuitePreparation, SuiteRunner } from '../contracts';
import { buildSkillContestants, parseSkillArms } from '../text/skill-pack';
import { createComparisonSuite } from './compare';
import { loadTextFixture } from './text-fixture';

export function createSkillAbSuite(): SuiteRunner {
  const comparison = createComparisonSuite('skill-ab');

  return {
    async prepare(options): Promise<SuitePreparation> {
      const [model, ...extra] = options.models;
      if (!model || extra.length > 0) {
        throw new UsageError(
          'skill-ab holds the model fixed: pass exactly one --models key',
        );
      }

      let contestants: SuitePreparation['contestants'];
      try {
        contestants = buildSkillContestants(
          model,
          parseSkillArms(readFlag(options.argv ?? [], 'skill-arms')),
        );
      } catch (error: unknown) {
        throw new UsageError(
          error instanceof Error ? error.message : String(error),
        );
      }

      return {
        contestants,
        crossFamily: 'run',
        fixture: loadTextFixture(options.fixturePath, 'skill-ab'),
      };
    },
    run: comparison.run,
    suite: 'skill-ab',
  };
}

export const skillAbSuite = createSkillAbSuite();
