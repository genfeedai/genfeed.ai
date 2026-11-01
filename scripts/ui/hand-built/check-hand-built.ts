import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  baselinePathFor,
  buildBaseline,
  diffBaseline,
  type HandBuiltArea,
  type HandBuiltFinding,
  listScannedFiles,
  readBaseline,
  readSource,
  totalFindings,
  writeBaseline,
} from './core';

const rootDir = path.resolve(import.meta.dirname, '../../..');
const areasDir = path.join(import.meta.dirname, 'areas');

async function loadAreas(): Promise<HandBuiltArea[]> {
  const files = readdirSync(areasDir)
    .filter((file) => file.endsWith('.ts') && !file.endsWith('.test.ts'))
    .sort();
  const areas: HandBuiltArea[] = [];
  for (const file of files) {
    const module = (await import(
      pathToFileURL(path.join(areasDir, file)).href
    )) as { default: HandBuiltArea };
    areas.push(module.default);
  }
  return areas;
}

function format(findings: HandBuiltFinding[]): string {
  return findings
    .map(
      (finding) =>
        `  ${finding.file}:${finding.line} [${finding.rule}] ${finding.detail}`,
    )
    .join('\n');
}

export async function main(argv: string[]): Promise<number> {
  const areas = await loadAreas();
  const updateIndex = argv.indexOf('--update-baseline');
  const updateTarget = updateIndex >= 0 ? argv[updateIndex + 1] : undefined;
  if (updateIndex >= 0 && !areas.some((area) => area.id === updateTarget)) {
    console.error(
      `Pass the area to ratchet: --update-baseline <${areas.map((area) => area.id).join('|')}>`,
    );
    return 1;
  }

  const files = listScannedFiles(rootDir);
  const findingsByArea = new Map<string, HandBuiltFinding[]>(
    areas.map((area) => [area.id, []]),
  );
  for (const file of files) {
    const source = readSource(rootDir, file);
    for (const area of areas) {
      findingsByArea.get(area.id)?.push(...area.scan(source));
    }
  }

  const failures: string[] = [];
  for (const area of areas) {
    const findings = findingsByArea.get(area.id) ?? [];
    const actual = buildBaseline(findings);
    const baseline = readBaseline(areasDir, area.id);

    if (updateTarget === area.id) {
      const isNewBaseline = !existsSync(baselinePathFor(areasDir, area.id));
      const { regressions } = diffBaseline(baseline, actual);
      if (!isNewBaseline && regressions.length > 0) {
        failures.push(
          `Refusing to update the ${area.id} baseline: a count grew.\n${format(findings)}`,
        );
        continue;
      }
      writeBaseline(areasDir, area.id, actual);
      console.log(
        `Updated ${area.id} baseline: ${totalFindings(baseline)} -> ${totalFindings(actual)}.`,
      );
      continue;
    }

    const { regressions, stale } = diffBaseline(baseline, actual);
    if (regressions.length > 0) {
      const regressed = new Set(
        regressions.map((entry) => `${entry.file}:${entry.rule}`),
      );
      failures.push(
        `Hand-built UI grew above the ${area.id} baseline. Use the shared component and its variants (or extend it); do not restyle it:\n${format(
          findings.filter((finding) =>
            regressed.has(`${finding.file}:${finding.rule}`),
          ),
        )}`,
      );
    }
    if (stale.length > 0) {
      failures.push(
        `The ${area.id} baseline is stale. Keep the cleanup with \`bun run check:ui-hand-built -- --update-baseline ${area.id}\` in this PR:\n${stale
          .map(
            (entry) =>
              `  ${entry.file} ${entry.rule}: baseline ${entry.baseline}, actual ${entry.actual}`,
          )
          .join('\n')}`,
      );
    }
  }

  if (failures.length > 0) {
    console.error(failures.join('\n\n'));
    return 1;
  }
  console.log(
    `Hand-built UI check passed (${areas.map((area) => area.id).join(', ')}).`,
  );
  return 0;
}

if (import.meta.main) {
  process.exit(await main(process.argv.slice(2)));
}
