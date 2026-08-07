// Temporary (PR #2482): merge per-workspace finding dumps into the canonical
// baseline file using the checker's own serializer. Removed before merge.
import { readFileSync, writeFileSync } from 'node:fs';
import { serializeSpecTypecheckBaseline } from './check-spec-typecheck';

const shardPaths = process.argv.slice(2);
if (shardPaths.length === 0) {
  throw new Error('usage: tmp-spec-baseline-merge.ts <shard.json>...');
}

const findings = shardPaths.flatMap(
  (shardPath) => JSON.parse(readFileSync(shardPath, 'utf8')) as unknown[],
);

writeFileSync(
  'scripts/architecture/spec-typecheck-baseline.json',
  serializeSpecTypecheckBaseline(
    findings as Parameters<typeof serializeSpecTypecheckBaseline>[0],
  ),
);
console.log(`baseline rewritten with ${findings.length} findings`);
