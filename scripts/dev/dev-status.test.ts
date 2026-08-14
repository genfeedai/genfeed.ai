import { describe, expect, it } from 'vitest';
import {
  formatDevStatus,
  parseNextServerProcessLine,
  parsePortlessList,
} from './dev-status';

describe('dev status', () => {
  it('parses Portless list output into live routes', () => {
    const routes = parsePortlessList(`
Active routes:

  https://app.genfeed.localhost  ->  localhost:4944  (pid 5645)
  https://api.genfeed.localhost  ->  localhost:4729  (pid 5775)
`);

    expect(routes).toEqual([
      {
        pid: 5645,
        target: 'localhost:4944',
        url: 'https://app.genfeed.localhost',
      },
      {
        pid: 5775,
        target: 'localhost:4729',
        url: 'https://api.genfeed.localhost',
      },
    ]);
  });

  it('parses next-server process lines and flags foreign checkouts', () => {
    expect(
      parseNextServerProcessLine(' 5757  3.1 next-server (v16.3.1)'),
    ).toEqual({
      cpuPercent: 3.1,
      pid: 5757,
      version: '16.3.1',
    });

    const report = formatDevStatus({
      nextServers: [
        {
          cpuPercent: 3.1,
          cwd: '/repo/genfeed.ai/apps/app',
          pid: 5757,
          version: '16.3.1',
        },
        {
          cpuPercent: 92.8,
          cwd: '/repo/customers/vitaeai/apps/app',
          pid: 74229,
          version: '16.3.0',
        },
      ],
      repoRoot: '/repo/genfeed.ai',
      routes: [
        {
          pid: 5645,
          target: 'localhost:4944',
          url: 'https://app.genfeed.localhost',
        },
      ],
    });

    expect(report).toContain('https://app.genfeed.localhost');
    expect(report).toContain('v16.3.1');
    expect(report).toContain('FOREIGN');
    expect(report).toContain('vitaeai');
  });
});
