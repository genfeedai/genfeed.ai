import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import {
  findRecordingViolations,
  formatViolations,
  parseRecording,
  type RecordingViolation,
} from '../../playwright/e2e/utils/recorded-api/recording';

/**
 * Recorded E2E API responses are committed to a public repository (#6231,
 * #7426), so they must hold seeded fixture data only: no tokens or keys, no
 * real emails, no production hostnames. Runs in CI and, through lint-staged,
 * before a recording is committed.
 */

export const RECORDINGS_RELATIVE_DIRECTORY = 'playwright/e2e/recordings';
export const RECORDING_SUFFIX = '.recording.json';

export interface RecordingCheckResult {
  fileCount: number;
  violations: Array<RecordingViolation & { file: string }>;
}

export function checkRecordings(
  options: { files?: string[]; rootDir?: string } = {},
): RecordingCheckResult {
  const rootDir = options.rootDir ?? process.cwd();
  const directory = path.join(rootDir, RECORDINGS_RELATIVE_DIRECTORY);
  const files =
    options.files ??
    readdirSync(directory)
      .filter((name) => name.endsWith(RECORDING_SUFFIX))
      .map((name) => path.join(directory, name));

  const violations: RecordingCheckResult['violations'] = [];
  for (const file of files) {
    const relative = path.relative(rootDir, file).replaceAll('\\', '/');
    try {
      const recording = parseRecording(readFileSync(file, 'utf8'), relative);
      for (const violation of findRecordingViolations(recording)) {
        violations.push({ ...violation, file: relative });
      }
    } catch (error) {
      violations.push({
        file: relative,
        location: relative,
        reason: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return { fileCount: files.length, violations };
}

function isMainModule(): boolean {
  const entryPoint = process.argv[1];
  return Boolean(entryPoint) && path.resolve(entryPoint) === __filename;
}

if (isMainModule()) {
  const stagedFiles = process.argv
    .slice(2)
    .filter((file) => file.endsWith(RECORDING_SUFFIX))
    .map((file) => path.resolve(file));
  const result = checkRecordings(
    stagedFiles.length > 0 ? { files: stagedFiles } : {},
  );

  if (result.violations.length > 0) {
    console.error('E2E recordings must hold seeded fixture data only (#7426):');
    console.error(formatViolations(result.violations));
    process.exit(1);
  }
  console.log(
    `E2E recording guard passed: ${result.fileCount} recording(s) hold fixture data only.`,
  );
}
