import { describe, expect, it } from 'vitest';
import {
  applyAllowances,
  findHttpTimeoutViolations,
  type HttpTimeoutAllowance,
} from './check-http-timeout';

function lines(source: string): number[] {
  return findHttpTimeoutViolations([
    { file: 'apps/server/api/src/a.module.ts', source },
  ]).map((violation) => violation.line);
}

describe('outbound HTTP timeout', () => {
  it('flags a module that imports HttpModule bare, as the API modules did before #10820', () => {
    const source = `
import { HttpModule } from '@nestjs/axios';
@Module({
  imports: [
    CreditsModule,
    HttpModule,
    TransactionModule,
  ],
})
export class CreditsModule {}`;

    expect(lines(source)).toEqual([6]);
  });

  it('accepts HttpModule registered with a timeout', () => {
    const source = `
@Module({
  imports: [HttpModule.register({ timeout: DEFAULT_HTTP_TIMEOUT_MS })],
})
export class A {}`;

    expect(lines(source)).toEqual([]);
  });

  it('flags HttpModule.register that sets no timeout', () => {
    const source = `
@Module({
  imports: [
    HttpModule.register({ maxRedirects: 2 }),
  ],
})
export class A {}`;

    expect(lines(source)).toEqual([4]);
  });

  it('flags HttpModule.register with no options', () => {
    expect(lines('const m = HttpModule.register();')).toEqual([1]);
  });

  it('does not follow options held in a variable or spread into the literal', () => {
    const source = `
const a = HttpModule.register(options);
const b = HttpModule.register({ ...shared });`;

    expect(lines(source)).toEqual([]);
  });

  it('does not flag HttpModule re-exported from a module', () => {
    const source = `
@Module({
  exports: [HttpModule],
  imports: [HttpModule.register({ timeout: 1000 })],
})
export class A {}`;

    expect(lines(source)).toEqual([]);
  });

  it('flags a fetch with no options, as the three API calls had before #10820', () => {
    const source = `
async function download(downloadUrl: string) {
  const response = await fetch(downloadUrl);
  return response;
}`;

    expect(lines(source)).toEqual([3]);
  });

  it('flags a fetch whose options carry no signal', () => {
    const source = `
const response = await fetch(registryUrl, {
  headers: { Accept: 'application/json' },
});`;

    expect(lines(source)).toEqual([2]);
  });

  it('accepts a fetch with a signal', () => {
    const source = `
const a = await fetch(url, { signal: AbortSignal.timeout(30_000) });
const b = await fetch(url, { signal: controller.signal });
const c = await fetch(url, { signal });`;

    expect(lines(source)).toEqual([]);
  });

  it('finds a fetch call with a comment between the name and its arguments', () => {
    expect(lines('await fetch /* download */ (url);')).toEqual([1]);
  });

  it('does not follow fetch options held in a variable', () => {
    expect(lines('await fetch(url, init);')).toEqual([]);
  });

  it('does not flag a method called fetch on another object', () => {
    expect(lines('await this.client.fetch(url);')).toEqual([]);
  });

  it('honors an ignore marker on the line above', () => {
    const source = `
// http-timeout-audit: ignore the caller aborts through its own controller
const response = await fetch(url);`;

    expect(lines(source)).toEqual([]);
  });

  it('names the fix for each shape', () => {
    const [module, call] = findHttpTimeoutViolations([
      {
        file: 'apps/server/api/src/a.ts',
        source: '@Module({ imports: [HttpModule] }) class A {}',
      },
      { file: 'apps/server/api/src/b.ts', source: 'await fetch(url);' },
    ]);

    expect(module?.message).toContain('HttpModule.register({ timeout');
    expect(call?.message).toContain('AbortSignal.timeout');
  });
});

describe('HTTP timeout allowances', () => {
  const allowances: HttpTimeoutAllowance[] = [
    { count: 1, file: 'apps/server/files/src/a.module.ts', reason: 'kept' },
  ];
  const violation = (file: string, line: number) => ({
    file,
    line,
    message: 'x',
  });

  it('accepts exactly the counted sites', () => {
    expect(
      applyAllowances(
        [violation('apps/server/files/src/a.module.ts', 3)],
        allowances,
      ),
    ).toEqual([]);
  });

  it('fails a file that grows past its count', () => {
    const remaining = applyAllowances(
      [
        violation('apps/server/files/src/a.module.ts', 3),
        violation('apps/server/files/src/a.module.ts', 9),
      ],
      allowances,
    );

    expect(remaining.map((entry) => entry.line)).toEqual([3, 9]);
  });

  it('fails a file with no allowance', () => {
    expect(
      applyAllowances([violation('apps/server/api/src/b.module.ts', 2)], []),
    ).toHaveLength(1);
  });

  it('fails an allowance whose site was fixed, so the list only shrinks', () => {
    const [stale] = applyAllowances([], allowances);

    expect(stale?.message).toContain('Lower the count or delete the entry');
  });
});
