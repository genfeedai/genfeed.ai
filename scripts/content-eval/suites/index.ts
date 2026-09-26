/**
 * `--suite` registry. A suite that lives in its own directory (the media
 * ladder, #4926) registers here with one line; the runner never switches on
 * suite names.
 */

import type { SuiteName, SuiteRunner } from '../contracts';
import { mediaLadderSuite } from '../media/suite';
import { harnessAbSuite, ladderSuite } from './compare';
import { judgeSuite } from './judge';

export const SUITE_RUNNERS: Partial<Record<SuiteName, SuiteRunner>> = {
  'harness-ab': harnessAbSuite,
  judge: judgeSuite,
  ladder: ladderSuite,
  'media-ladder': mediaLadderSuite,
};

export function resolveSuiteRunner(suite: SuiteName): SuiteRunner {
  const runner = SUITE_RUNNERS[suite];
  if (!runner) {
    throw new Error(`Suite "${suite}" is reserved but not implemented yet`);
  }

  return runner;
}
