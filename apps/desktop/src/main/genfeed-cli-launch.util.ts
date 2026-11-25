const GENFEED_CLI_COMMAND = 'gf';
export const GENFEED_CLI_INSTALL_COMMAND = 'npm install -g @genfeedai/cli';

export interface IGenfeedCliLaunch {
  args: string[];
  command: string;
}

// Runs inside the PTY, before the CLI starts. `sh` is the one interpreter every
// macOS and Linux machine has; the shell the user picked is only used to hand
// back a prompt, because it already carries their PATH.
const POSIX_SCRIPT = [
  `if ! command -v ${GENFEED_CLI_COMMAND} >/dev/null 2>&1; then`,
  `  printf '%s\\n' 'The Genfeed CLI (${GENFEED_CLI_COMMAND}) is not installed on this computer.' '' 'Install it with:' '' '  ${GENFEED_CLI_INSTALL_COMMAND}' '' 'Then open a new Genfeed CLI session.' ''`,
  '  exec "${SHELL:-/bin/sh}" -l',
  'fi',
  `if ${GENFEED_CLI_COMMAND} auth status 2>/dev/null | grep -q '^Logged in: yes'; then`,
  "  printf '%s\\n' 'Genfeed CLI: signed in.'",
  'else',
  `  printf '%s\\n' 'Genfeed CLI: not signed in. Run: ${GENFEED_CLI_COMMAND} auth login'`,
  'fi',
  `exec ${GENFEED_CLI_COMMAND}`,
].join('\n');

const POWERSHELL_SCRIPT = [
  `if (-not (Get-Command ${GENFEED_CLI_COMMAND} -ErrorAction SilentlyContinue)) {`,
  `  Write-Host 'The Genfeed CLI (${GENFEED_CLI_COMMAND}) is not installed on this computer.'`,
  "  Write-Host ''",
  "  Write-Host 'Install it with:'",
  `  Write-Host '  ${GENFEED_CLI_INSTALL_COMMAND}'`,
  "  Write-Host ''",
  "  Write-Host 'Then open a new Genfeed CLI session.'",
  '} else {',
  `  if ((& ${GENFEED_CLI_COMMAND} auth status 2>$null) -match '^Logged in: yes') {`,
  "    Write-Host 'Genfeed CLI: signed in.'",
  '  } else {',
  `    Write-Host 'Genfeed CLI: not signed in. Run: ${GENFEED_CLI_COMMAND} auth login'`,
  '  }',
  `  ${GENFEED_CLI_COMMAND}`,
  '}',
].join('\n');

/**
 * The Genfeed CLI session does not spawn `gf` directly. A missing binary would
 * end the PTY at once with a bare "command not found" error, so a wrapper
 * checks for it first: it prints the install command and leaves a shell open
 * when `gf` is missing, and otherwise reports the sign-in state before it
 * starts the CLI.
 */
export function resolveGenfeedCliLaunch(
  platform: NodeJS.Platform,
): IGenfeedCliLaunch {
  if (platform === 'win32') {
    return {
      args: ['-NoLogo', '-NoExit', '-Command', POWERSHELL_SCRIPT],
      command: 'powershell.exe',
    };
  }

  return { args: ['-c', POSIX_SCRIPT], command: '/bin/sh' };
}
