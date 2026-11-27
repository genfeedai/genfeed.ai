import { execFile } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import type {
  DesktopEditingToolKey,
  IDesktopEditingTool,
  IDesktopEditingToolsReadiness,
} from '@genfeedai/contracts/desktop';
import { GENFEED_CLI_INSTALL_COMMAND } from './genfeed-cli-launch.util';
import { buildDesktopToolPath } from './local-tools.util';

const VERSION_TIMEOUT_MS = 5_000;
const VERSION_PATTERN = /\d+(?:\.\d+)+/;

interface EditingToolSpec {
  /** Executable names looked up on PATH, then absolute paths, first match wins. */
  candidates: string[];
  installCommand: string;
  key: DesktopEditingToolKey;
  label: string;
  /** Oldest version the Genfeed skills need. Null: any version, or none is read. */
  minimumVersion: string | null;
  /** Arguments that print the version; null for a tool whose version is not read. */
  versionArguments: string[] | null;
}

const MAC_BROWSER_PATHS = [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser',
  '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
];

/**
 * Minimums come from the skills that ship in `genfeedai/skills`: Bun 1.1+ in
 * clip-cutter, motion-video, reverse-video, threejs-previs and ad-pack-assembly,
 * and ffmpeg 5.0+ in ad-pack-assembly. A skill that names no version sets none.
 * The speech-to-text, Python and yt-dlp entries come from the edit reviewed in
 * #11250; no skill in that repository requires them yet.
 */
const EDITING_TOOLS: readonly EditingToolSpec[] = [
  {
    candidates: ['ffmpeg'],
    installCommand: 'brew install ffmpeg',
    key: 'ffmpeg',
    label: 'ffmpeg',
    minimumVersion: '5.0',
    versionArguments: ['-version'],
  },
  {
    candidates: ['ffprobe'],
    installCommand: 'brew install ffmpeg',
    key: 'ffprobe',
    label: 'ffprobe',
    minimumVersion: '5.0',
    versionArguments: ['-version'],
  },
  {
    candidates: [
      'google-chrome',
      'chromium',
      'chrome-headless-shell',
      ...MAC_BROWSER_PATHS,
    ],
    installCommand: 'brew install --cask google-chrome',
    key: 'browser',
    label: 'Chrome or Chromium',
    minimumVersion: null,
    versionArguments: ['--version'],
  },
  {
    candidates: ['bun'],
    installCommand: 'brew install bun',
    key: 'bun',
    label: 'Bun',
    minimumVersion: '1.1',
    versionArguments: ['--version'],
  },
  {
    candidates: ['python3'],
    installCommand: 'brew install python',
    key: 'python',
    label: 'Python 3',
    minimumVersion: null,
    versionArguments: ['--version'],
  },
  {
    candidates: ['whisper-cli', 'whisper'],
    installCommand: 'brew install whisper.cpp',
    key: 'speech-to-text',
    label: 'Speech to text (whisper.cpp or Whisper)',
    minimumVersion: null,
    versionArguments: null,
  },
  {
    candidates: ['yt-dlp'],
    installCommand: 'brew install yt-dlp',
    key: 'yt-dlp',
    label: 'yt-dlp',
    minimumVersion: null,
    versionArguments: ['--version'],
  },
  {
    candidates: ['gf'],
    installCommand: GENFEED_CLI_INSTALL_COMMAND,
    key: 'genfeed-cli',
    label: 'Genfeed CLI',
    minimumVersion: null,
    versionArguments: ['--version'],
  },
];

export interface EditingToolProbe {
  /** Absolute path of the executable, or null when it is not installed. */
  findExecutable(candidate: string): string | null;
  /** The version number the executable prints, or null when it prints none. */
  readVersion(
    executable: string,
    versionArguments: string[],
  ): Promise<string | null>;
}

function isExecutableFile(filePath: string): boolean {
  try {
    fs.accessSync(filePath, fs.constants.X_OK);
    return fs.statSync(filePath).isFile();
  } catch {
    return false;
  }
}

function findExecutableOnPath(candidate: string): string | null {
  if (path.isAbsolute(candidate)) {
    return isExecutableFile(candidate) ? candidate : null;
  }

  for (const directory of buildDesktopToolPath().split(':')) {
    const filePath = path.join(directory, candidate);
    if (isExecutableFile(filePath)) {
      return filePath;
    }
  }

  return null;
}

function readVersionFromExecutable(
  executable: string,
  versionArguments: string[],
): Promise<string | null> {
  return new Promise((resolve) => {
    execFile(
      executable,
      versionArguments,
      {
        env: { ...process.env, PATH: buildDesktopToolPath() },
        timeout: VERSION_TIMEOUT_MS,
      },
      (error, stdout) => {
        if (error) {
          resolve(null);
          return;
        }
        resolve(VERSION_PATTERN.exec(stdout.split('\n')[0] ?? '')?.[0] ?? null);
      },
    );
  });
}

const defaultProbe: EditingToolProbe = {
  findExecutable: findExecutableOnPath,
  readVersion: readVersionFromExecutable,
};

/** True when `version` is older than `minimum`, comparing numeric parts left to right. */
export function isVersionOlderThan(version: string, minimum: string): boolean {
  const found = version.split('.').map(Number);
  const needed = minimum.split('.').map(Number);

  for (
    let index = 0;
    index < Math.max(found.length, needed.length);
    index += 1
  ) {
    const difference = (found[index] ?? 0) - (needed[index] ?? 0);
    if (difference !== 0) {
      return difference < 0;
    }
  }

  return false;
}

async function detectEditingTool(
  spec: EditingToolSpec,
  probe: EditingToolProbe,
): Promise<IDesktopEditingTool> {
  const base = {
    installCommand: spec.installCommand,
    key: spec.key,
    label: spec.label,
    minimumVersion: spec.minimumVersion,
  };

  for (const candidate of spec.candidates) {
    const executable = probe.findExecutable(candidate);
    if (!executable) {
      continue;
    }

    const version = spec.versionArguments
      ? await probe.readVersion(executable, spec.versionArguments)
      : null;
    // A build that prints no number (a git build of ffmpeg) cannot be called
    // too old, so it counts as found.
    const isTooOld =
      version !== null &&
      spec.minimumVersion !== null &&
      isVersionOlderThan(version, spec.minimumVersion);

    return {
      ...base,
      path: executable,
      status: isTooOld ? 'too-old' : 'found',
      version,
    };
  }

  return { ...base, path: null, status: 'missing', version: null };
}

/** Looks for each tool a local edit calls. Nothing is installed or changed. */
export async function detectDesktopEditingTools(
  probe: EditingToolProbe = defaultProbe,
): Promise<IDesktopEditingToolsReadiness> {
  return {
    tools: await Promise.all(
      EDITING_TOOLS.map((spec) => detectEditingTool(spec, probe)),
    ),
  };
}
