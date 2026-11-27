import { describe, expect, it } from 'bun:test';
import {
  detectDesktopEditingTools,
  type EditingToolProbe,
  isVersionOlderThan,
} from './editing-tools.util';

function createProbe(
  installed: Record<string, string | null>,
): EditingToolProbe {
  return {
    findExecutable: (candidate) =>
      candidate in installed ? `/opt/homebrew/bin/${candidate}` : null,
    readVersion: async (executable) =>
      installed[executable.split('/').pop() ?? ''] ?? null,
  };
}

async function detect(installed: Record<string, string | null>) {
  const { tools } = await detectDesktopEditingTools(createProbe(installed));
  return Object.fromEntries(tools.map((tool) => [tool.key, tool]));
}

describe('detectDesktopEditingTools', () => {
  it('reports a tool at or above its minimum as found, with its version and path', async () => {
    const tools = await detect({ bun: '1.1.0', ffmpeg: '6.1.1' });

    expect(tools.ffmpeg).toMatchObject({
      minimumVersion: '5.0',
      path: '/opt/homebrew/bin/ffmpeg',
      status: 'found',
      version: '6.1.1',
    });
    expect(tools.bun).toMatchObject({ status: 'found', version: '1.1.0' });
  });

  it('reports a tool below its minimum as too old and keeps the install command', async () => {
    const tools = await detect({ bun: '1.0.36', ffmpeg: '4.4.2' });

    expect(tools.ffmpeg).toMatchObject({
      installCommand: 'brew install ffmpeg',
      status: 'too-old',
      version: '4.4.2',
    });
    expect(tools.bun).toMatchObject({
      installCommand: 'brew install bun',
      status: 'too-old',
    });
  });

  it('reports a tool that is not installed as missing, with the command that installs it', async () => {
    const tools = await detect({});

    expect(tools.ffmpeg).toEqual({
      installCommand: 'brew install ffmpeg',
      key: 'ffmpeg',
      label: 'ffmpeg',
      minimumVersion: '5.0',
      path: null,
      status: 'missing',
      version: null,
    });
    expect(tools['genfeed-cli']).toMatchObject({
      installCommand: 'npm install -g @genfeedai/cli',
      status: 'missing',
    });
    expect(Object.values(tools).map((tool) => tool.status)).toEqual(
      Array(8).fill('missing'),
    );
  });

  it('counts a build that prints no version number as found, not too old', async () => {
    const tools = await detect({ ffmpeg: null });

    expect(tools.ffmpeg).toMatchObject({ status: 'found', version: null });
  });

  it('accepts either speech to text tool and sets no minimum for it', async () => {
    expect((await detect({ whisper: null }))['speech-to-text']).toMatchObject({
      minimumVersion: null,
      path: '/opt/homebrew/bin/whisper',
      status: 'found',
    });
    expect(
      (await detect({ 'whisper-cli': null }))['speech-to-text'],
    ).toMatchObject({ path: '/opt/homebrew/bin/whisper-cli', status: 'found' });
  });

  it('finds a browser installed as a macOS app, not only on PATH', async () => {
    const tools = await detect({
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome': null,
    });

    expect(tools.browser.status).toBe('found');
  });
});

describe('isVersionOlderThan', () => {
  it.each([
    ['4.4.2', '5.0', true],
    ['5.0', '5.0', false],
    ['5', '5.0', false],
    ['5.0.1', '5.0', false],
    ['1.0.36', '1.1', true],
    ['1.10', '1.9', false],
    ['10.0', '9.9', false],
  ])('%s against minimum %s is older: %s', (version, minimum, expected) => {
    expect(isVersionOlderThan(version, minimum)).toBe(expected);
  });
});
