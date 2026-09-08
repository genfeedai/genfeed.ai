import { execFileSync } from 'node:child_process';
import { evaluateTask } from './evaluate';
import { FIXTURE_METADATA, TASK_FIXTURES } from './fixtures';

const results = TASK_FIXTURES.map(evaluateTask);
const report = {
  schemaVersion: 1,
  evidenceKind: 'deterministic-contract-evaluation',
  sourceRevision: execFileSync('git', ['rev-parse', 'HEAD'], {
    encoding: 'utf8',
  }).trim(),
  workingTreeDirty:
    execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).trim()
      .length > 0,
  generatedAt: new Date().toISOString(),
  metadata: FIXTURE_METADATA,
  rubric: {
    requiredPassRate: 1,
    comparison: 'exact',
    modelQualityAssessed: false,
    liveSmokeAssessed: false,
  },
  summary: {
    passed: results.filter((result) => result.passed).length,
    total: results.length,
  },
  results,
};
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
if (results.some((result) => !result.passed)) process.exitCode = 1;
