/**
 * Directories prepended to the inherited PATH so the CLIs the terminal offers
 * (`claude`, `codex`, `gf`, the login shell) resolve on common installs.
 */
const TERMINAL_PATHS = [
  '/opt/homebrew/bin',
  '/usr/local/bin',
  '/usr/bin',
  '/bin',
  '/usr/sbin',
  '/sbin',
];

/**
 * The only variables a terminal inherits from the notifications process. The
 * process environment carries the database URL, the Better Auth secret and
 * provider keys; none of it may reach a shell. The shell and the CLIs need
 * identity, locale and home/config directories — they read their own logins
 * from `HOME` / `XDG_*` — plus the variables Windows needs to start a shell.
 */
const INHERITED_ENV_KEYS = [
  'HOME',
  'LANG',
  'LANGUAGE',
  'LC_ALL',
  'LC_CTYPE',
  'LC_MESSAGES',
  'LOGNAME',
  'SHELL',
  'TMPDIR',
  'TZ',
  'USER',
  'XDG_CACHE_HOME',
  'XDG_CONFIG_HOME',
  'XDG_DATA_HOME',
  'XDG_RUNTIME_DIR',
  'XDG_STATE_HOME',
  // Windows (powershell.exe)
  'APPDATA',
  'COMSPEC',
  'HOMEDRIVE',
  'HOMEPATH',
  'LOCALAPPDATA',
  'PATHEXT',
  'SystemDrive',
  'SystemRoot',
  'TEMP',
  'TMP',
  'USERNAME',
  'USERPROFILE',
  'WINDIR',
] as const;

/** Builds the environment for a terminal pty from an allowlist of `source`. */
export function buildTerminalEnvironment(
  source: Readonly<Record<string, string | undefined>>,
): Record<string, string> {
  const environment: Record<string, string> = {};

  for (const key of INHERITED_ENV_KEYS) {
    const value = source[key];
    if (typeof value === 'string') {
      environment[key] = value;
    }
  }

  const inheritedPath = (source.PATH ?? '').split(':').filter(Boolean);

  return {
    ...environment,
    COLORTERM: source.COLORTERM ?? 'truecolor',
    PATH: [...TERMINAL_PATHS, ...inheritedPath].join(':'),
    TERM: 'xterm-256color',
  };
}
