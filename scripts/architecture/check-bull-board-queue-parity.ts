import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ALL_QUEUE_NAMES } from '../../packages/contracts/src/queue/queue-names.constant';

const DEFAULT_CONFIG_PATH =
  'apps/server/api/src/config/bull-board-queue-names.ts';
const DEFAULT_MAIN_PATH = 'apps/server/api/src/main.ts';

const AUXILIARY_ARRAY_PATTERN =
  /BULL_BOARD_AUXILIARY_QUEUE_NAMES\s*=\s*\[([\s\S]*?)\]\s*as const/;
const CANONICAL_COMPOSITION_PATTERN =
  /BULL_BOARD_QUEUE_NAMES\s*=\s*\[\s*\.\.\.ALL_QUEUE_NAMES\s*,\s*\.\.\.BULL_BOARD_AUXILIARY_QUEUE_NAMES\s*,?\s*\]\s*as const/;
const MAIN_USAGE_PATTERN = /BULL_BOARD_QUEUE_NAMES\s*\.\s*map\s*\(/;
const STRING_LITERAL_PATTERN = /^(['"])([^'"]+)\1$/;

export interface BullBoardQueueParityOptions {
  configSource?: string;
  contractQueueNames?: readonly string[];
  mainSource?: string;
  rootDir?: string;
}

export interface BullBoardQueueParityResult {
  auxiliaryQueueNames: string[];
  violations: string[];
}

export function runCheckBullBoardQueueParity(
  options: BullBoardQueueParityOptions = {},
): BullBoardQueueParityResult {
  const rootDir = options.rootDir ?? process.cwd();
  const configSource =
    options.configSource ??
    readFileSync(path.join(rootDir, DEFAULT_CONFIG_PATH), 'utf8');
  const mainSource =
    options.mainSource ??
    readFileSync(path.join(rootDir, DEFAULT_MAIN_PATH), 'utf8');
  const contractQueueNames = options.contractQueueNames ?? ALL_QUEUE_NAMES;
  const violations: string[] = [];
  const auxiliaryQueueNames: string[] = [];
  const auxiliaryArray = configSource.match(AUXILIARY_ARRAY_PATTERN);

  if (!auxiliaryArray) {
    violations.push(
      'BULL_BOARD_AUXILIARY_QUEUE_NAMES must be an array literal.',
    );
  } else {
    const entries = auxiliaryArray[1]
      ?.split(',')
      .map((entry) => entry.trim())
      .filter(Boolean);

    for (const entry of entries ?? []) {
      const literal = entry.match(STRING_LITERAL_PATTERN);
      if (!literal?.[2]) {
        violations.push(
          'BULL_BOARD_AUXILIARY_QUEUE_NAMES may contain only string literals.',
        );
        continue;
      }
      auxiliaryQueueNames.push(literal[2]);
    }
  }

  if (!CANONICAL_COMPOSITION_PATTERN.test(configSource)) {
    violations.push(
      'BULL_BOARD_QUEUE_NAMES must be composed exactly as [...ALL_QUEUE_NAMES, ...BULL_BOARD_AUXILIARY_QUEUE_NAMES].',
    );
  }

  if (!MAIN_USAGE_PATTERN.test(mainSource)) {
    violations.push(
      'apps/server/api/src/main.ts must build Bull Board adapters from BULL_BOARD_QUEUE_NAMES.map(...).',
    );
  }

  const expectedNames = [...contractQueueNames, ...auxiliaryQueueNames];
  const duplicateNames = expectedNames.filter(
    (name, index) => expectedNames.indexOf(name) !== index,
  );
  if (duplicateNames.length > 0) {
    violations.push(
      `Bull Board queue names contain duplicates: ${[...new Set(duplicateNames)].join(', ')}.`,
    );
  }

  return { auxiliaryQueueNames, violations };
}

function isMainModule(): boolean {
  const entryPoint = process.argv[1];
  return (
    Boolean(entryPoint) &&
    path.resolve(entryPoint) === fileURLToPath(import.meta.url)
  );
}

if (isMainModule()) {
  const result = runCheckBullBoardQueueParity();
  if (result.violations.length > 0) {
    console.error('Bull Board queue parity violations found.');
    for (const violation of result.violations) {
      console.error(`- ${violation}`);
    }
    process.exit(1);
  }

  console.log(
    `Bull Board queue parity passed for ${ALL_QUEUE_NAMES.length} canonical queues and ${result.auxiliaryQueueNames.length} auxiliary queues.`,
  );
}
