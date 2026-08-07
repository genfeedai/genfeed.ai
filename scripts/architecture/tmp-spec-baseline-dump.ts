// Temporary (PR #2482): dump one workspace's spec-typecheck findings as JSON
// so the baseline can be regenerated with one TypeScript program per process,
// matching the CI ratchet job's memory constraint. Removed before merge.
import { runSpecTypecheck } from './check-spec-typecheck';

const workspace = process.argv[2];
if (!workspace) {
  throw new Error('usage: tmp-spec-baseline-dump.ts <workspace>');
}

const result = runSpecTypecheck({ workspaces: [workspace] });
console.log(JSON.stringify(result.findings));
