import { readFileSync } from 'node:fs';
import { validateLiveEvidence } from './live-evidence';

const filename = process.argv[2];
if (!filename) {
  process.stderr.write(
    'BLOCKED: provide the private captured smoke evidence JSON path. Contract fixtures are not live evidence.\n',
  );
  process.exitCode = 1;
} else {
  try {
    const result = validateLiveEvidence(
      JSON.parse(readFileSync(filename, 'utf8')),
    );
    process.stdout.write(
      `${JSON.stringify(
        {
          status: result.complete ? 'evidence-complete' : 'blocked',
          ...result,
          limitation:
            'Validates evidence completeness and correlation only; a reviewer must inspect the referenced live traces. No live requests were made.',
        },
        null,
        2,
      )}\n`,
    );
    if (!result.complete) process.exitCode = 1;
  } catch {
    process.stderr.write('BLOCKED: unable to read valid evidence JSON.\n');
    process.exitCode = 1;
  }
}
