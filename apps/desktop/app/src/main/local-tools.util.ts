import { spawnSync } from 'node:child_process';

export interface DesktopLocalToolReadiness {
  anyDetected: boolean;
  claude: boolean;
  codex: boolean;
  detected: string[];
  grok: boolean;
}

const DESKTOP_LOCAL_TOOL_COMMANDS = [
  { command: 'claude', key: 'claude' },
  { command: 'codex', key: 'codex' },
  { command: 'grok', key: 'grok' },
] as const;

const COMMAND_PATH_PREFIXES = [
  '/opt/homebrew/bin',
  '/usr/local/bin',
  '/usr/bin',
  '/bin',
];

export function isDesktopLocalToolCommandAvailable(
  command: string,
  spawnCommand: typeof spawnSync = spawnSync,
): boolean {
  const pathParts = [
    ...COMMAND_PATH_PREFIXES,
    ...(process.env.PATH ?? '').split(':').filter(Boolean),
  ];
  const result = spawnCommand(command, ['--version'], {
    encoding: 'utf8',
    env: {
      ...process.env,
      PATH: pathParts.join(':'),
    },
    shell: false,
    stdio: 'ignore',
  });

  if (result.error) {
    return false;
  }

  return result.status === 0;
}

export function detectDesktopLocalTools(
  isCommandAvailable: (
    command: string,
  ) => boolean = isDesktopLocalToolCommandAvailable,
): DesktopLocalToolReadiness {
  const claude = isCommandAvailable('claude');
  const codex = isCommandAvailable('codex');
  const grok = isCommandAvailable('grok');
  const detected = DESKTOP_LOCAL_TOOL_COMMANDS.flatMap(({ key }) => {
    if (key === 'claude' && claude) return [key];
    if (key === 'codex' && codex) return [key];
    if (key === 'grok' && grok) return [key];
    return [];
  });

  return {
    anyDetected: detected.length > 0,
    claude,
    codex,
    detected,
    grok,
  };
}
