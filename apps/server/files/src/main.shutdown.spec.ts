import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const mainSource = readFileSync(
  path.resolve(path.dirname(fileURLToPath(import.meta.url)), 'main.ts'),
  'utf8',
);

describe('files service shutdown', () => {
  it('does not register the immediate-exit SIGTERM helper', () => {
    expect(mainSource).not.toContain('setupGracefulShutdown');
  });

  it('drains HTTP and Nest/BullMQ before exit', () => {
    expect(mainSource).toContain('registerGracefulDrain');
    expect(mainSource).toContain("serviceName: 'files'");
  });
});
