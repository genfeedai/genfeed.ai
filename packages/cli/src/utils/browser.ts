import { execFile } from 'node:child_process';

interface BrowserCommand {
  args: string[];
  command: string;
}

export function resolveBrowserCommand(
  url: string,
  platform: NodeJS.Platform = process.platform
): BrowserCommand | null {
  if (platform === 'darwin') {
    return { args: [url], command: 'open' };
  }

  if (platform === 'linux') {
    return { args: [url], command: 'xdg-open' };
  }

  if (platform === 'win32') {
    return { args: ['/c', 'start', '', url], command: 'cmd' };
  }

  return null;
}

export async function openExternalUrl(url: string): Promise<boolean> {
  const browserCommand = resolveBrowserCommand(url);
  if (!browserCommand) {
    return false;
  }

  return await new Promise((resolve) => {
    execFile(browserCommand.command, browserCommand.args, (error) => {
      resolve(error === null);
    });
  });
}
