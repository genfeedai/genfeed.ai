import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { chmod, lstat, mkdir, readFile } from 'node:fs/promises';
import { isAbsolute, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';

const exec = promisify(execFile);
export async function createFixtureMedia(directory) {
  assert.ok(isAbsolute(directory), 'Fixture directory must be absolute.');
  await mkdir(directory, { recursive: true, mode: 0o700 });
  assert.ok(!(await lstat(directory)).isSymbolicLink());
  await chmod(directory, 0o700);
  const media = [
    [
      'image.png',
      ['-f', 'lavfi', '-i', 'color=c=blue:s=64x64', '-frames:v', '1'],
    ],
    [
      'clip.mp4',
      [
        '-f',
        'lavfi',
        '-i',
        'color=c=green:s=160x90:r=30',
        '-t',
        '1',
        '-c:v',
        'libx264',
        '-pix_fmt',
        'yuv420p',
      ],
    ],
    ['audio.wav', ['-f', 'lavfi', '-i', 'sine=frequency=440', '-t', '1']],
  ];
  for (const [name] of media) {
    const present = await lstat(resolve(directory, name)).catch((error) => {
      if (error.code === 'ENOENT') return null;
      throw error;
    });
    assert.equal(present, null, `Refusing to overwrite ${name}`);
  }
  const result = [];
  for (const [name, args] of media) {
    const path = resolve(directory, name);
    await exec('ffmpeg', ['-n', '-loglevel', 'error', ...args, path]);
    result.push({
      path,
      sha256: createHash('sha256')
        .update(await readFile(path))
        .digest('hex'),
    });
  }
  return result;
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  process.stdout.write(
    `${JSON.stringify(await createFixtureMedia(process.argv[2]), null, 2)}\n`,
  );
}
