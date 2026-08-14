import { spawnSync } from 'node:child_process';
import path from 'node:path';

export type PortlessRouteStatus = {
  pid: number;
  target: string;
  url: string;
};

export type NextServerStatus = {
  cpuPercent: number;
  cwd: string;
  pid: number;
  version: string;
};

type DevStatusInput = {
  nextServers: NextServerStatus[];
  repoRoot: string;
  routes: PortlessRouteStatus[];
};

const PORTLESS_ROUTE_PATTERN =
  /^\s+(https:\/\/\S+)\s+->\s+(\S+)\s+\(pid (\d+)\)\s*$/gmu;
const NEXT_SERVER_PATTERN =
  /^\s*(\d+)\s+([\d.]+)\s+next-server \(v([^)]+)\)\s*$/u;

export function parsePortlessList(output: string): PortlessRouteStatus[] {
  return [...output.matchAll(PORTLESS_ROUTE_PATTERN)].flatMap((match) => {
    const [, url, target, pid] = match;
    if (!url || !target || !pid) {
      return [];
    }
    return [{ pid: Number(pid), target, url }];
  });
}

export function parseNextServerProcessLine(
  line: string,
): Omit<NextServerStatus, 'cwd'> | null {
  const match = NEXT_SERVER_PATTERN.exec(line);
  if (!match) {
    return null;
  }
  const [, pid, cpuPercent, version] = match;
  if (!pid || !cpuPercent || !version) {
    return null;
  }
  return {
    cpuPercent: Number(cpuPercent),
    pid: Number(pid),
    version,
  };
}

export function formatDevStatus({
  nextServers,
  repoRoot,
  routes,
}: DevStatusInput): string {
  const normalizedRoot = path.resolve(repoRoot);
  const routeLines =
    routes.length === 0
      ? ['  (none)']
      : routes.map(
          (route) => `  ${route.url}  ->  ${route.target}  (pid ${route.pid})`,
        );
  const serverLines =
    nextServers.length === 0
      ? ['  (none)']
      : nextServers.map((server) => {
          const isForeign = !path
            .resolve(server.cwd)
            .startsWith(`${normalizedRoot}${path.sep}`);
          const flag = isForeign ? '  FOREIGN' : '';
          return `  pid ${server.pid}  v${server.version}  ${server.cpuPercent}%  ${server.cwd}${flag}`;
        });

  return [
    'Portless routes:',
    ...routeLines,
    '',
    'next-server processes:',
    ...serverLines,
  ].join('\n');
}

function readPortlessList(): string {
  const result = spawnSync('portless', ['list'], {
    encoding: 'utf8',
    env: process.env,
  });
  return result.stdout ?? '';
}

function readNextServers(): NextServerStatus[] {
  const listing = spawnSync('ps', ['-axo', 'pid,pcpu,command'], {
    encoding: 'utf8',
  });
  const lines = (listing.stdout ?? '').split('\n');
  return lines.flatMap((line) => {
    const parsed = parseNextServerProcessLine(line);
    if (!parsed) {
      return [];
    }
    const cwdResult = spawnSync(
      'lsof',
      ['-a', '-p', String(parsed.pid), '-d', 'cwd'],
      {
        encoding: 'utf8',
      },
    );
    const cwdLine = (cwdResult.stdout ?? '')
      .split('\n')
      .find((entry) => /\scwd\s/u.test(entry));
    const cwd = cwdLine?.trim().split(/\s+/u).at(-1) ?? '(unknown)';
    return [{ ...parsed, cwd }];
  });
}

function main(): void {
  const repoRoot = process.cwd();
  console.log(
    formatDevStatus({
      nextServers: readNextServers(),
      repoRoot,
      routes: parsePortlessList(readPortlessList()),
    }),
  );
}

const isMain =
  typeof import.meta.main === 'boolean'
    ? import.meta.main
    : process.argv[1]?.includes('dev-status');

if (isMain) {
  main();
}
