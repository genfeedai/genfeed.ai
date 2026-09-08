import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { CoverageReport } from 'monocart-coverage-reports';
import { mergeCoverage } from './playwright-coverage.mjs';

test('four real Monocart raw shards merge complementary hits before computing metrics', async () => {
  const directory = mkdtempSync(
    path.join(tmpdir(), 'playwright-merge-integration-'),
  );
  const inputRoot = path.join(directory, 'shards');
  const source =
    'function first() { return 1; }\nfunction second() { return 2; }\nfirst();\nsecond();\n';
  try {
    for (let shard = 1; shard <= 4; shard++) {
      const reporter = new CoverageReport({
        outputDir: path.join(inputRoot, `e2e-coverage-shard-${shard}`),
        reports: ['raw'],
        logging: 'off',
      });
      await reporter.add([
        {
          url: 'http://localhost:3000/apps/app/coverage-example.js',
          source,
          functions: [
            {
              functionName: '',
              isBlockCoverage: true,
              ranges: [{ startOffset: 0, endOffset: source.length, count: 1 }],
            },
            {
              functionName: 'first',
              isBlockCoverage: true,
              ranges: [
                {
                  startOffset: 0,
                  endOffset: source.indexOf('\n'),
                  count: shard === 1 ? 1 : 0,
                },
              ],
            },
            {
              functionName: 'second',
              isBlockCoverage: true,
              ranges: [
                {
                  startOffset: source.indexOf('function second'),
                  endOffset: source.indexOf('\nfirst();'),
                  count: shard === 2 ? 1 : 0,
                },
              ],
            },
          ],
        },
      ]);
      await reporter.generate();
    }
    const outputDir = path.join(directory, 'merged');
    const report = await mergeCoverage(inputRoot, outputDir);
    assert.equal(report.metrics.functions.total, 2);
    assert.equal(report.metrics.functions.covered, 2);
    assert.equal(report.metrics.lines.pct, 100);
    assert.equal(report.metrics.statements.pct, 100);
    assert.equal(report.lcovValid, true);
    assert.match(
      readFileSync(path.join(outputDir, 'lcov.info'), 'utf8'),
      /FNDA:1,first/,
    );
    assert.equal(
      JSON.parse(
        readFileSync(
          path.join(outputDir, 'playwright-coverage-report.json'),
          'utf8',
        ),
      ).shards.length,
      4,
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
