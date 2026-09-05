import { execFileSync } from 'node:child_process';
import { appendFileSync, readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';

export const SERVER_IMAGE_INPUTS = JSON.parse(
  readFileSync(new URL('./server-image-inputs.json', import.meta.url), 'utf8'),
);

export function serverImageChanged({ base, head, cwd, git = execFileSync }) {
  if (!/^[0-9a-f]{40}$/.test(head ?? '')) {
    throw new Error('Image head must be an exact commit SHA');
  }
  if (!base || /^0{40}$/.test(base)) return true;
  if (!/^[0-9a-f]{40}$/.test(base)) {
    throw new Error('Image base must be an exact commit SHA');
  }
  return (
    git(
      'git',
      ['diff', '--name-only', '-z', base, head, '--', ...SERVER_IMAGE_INPUTS],
      { cwd, encoding: 'utf8' },
    ).length > 0
  );
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { values } = parseArgs({
    options: {
      base: { type: 'string' },
      head: { type: 'string' },
      cwd: { type: 'string' },
      'github-output': { type: 'string' },
    },
  });
  const changed = serverImageChanged(values);
  if (values['github-output']) {
    appendFileSync(values['github-output'], `changed=${changed}\n`);
  }
  console.log(changed);
}
