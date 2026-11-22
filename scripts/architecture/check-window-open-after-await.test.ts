import { describe, expect, it } from 'vitest';
import {
  applyAllowances,
  findWindowOpenAfterAwaitViolations,
  WINDOW_OPEN_ALLOWANCES,
} from './check-window-open-after-await';

function lines(source: string, file = 'apps/web/src/hook.ts'): number[] {
  return findWindowOpenAfterAwaitViolations([{ file, source }]).map(
    (violation) => violation.line,
  );
}

describe('window.open after an await', () => {
  it('flags the billing portal as it shipped before #10823', () => {
    const source = `
const openBillingPortal = async () => {
  try {
    const service = await getStripeService();
    const response = await service.getPortalUrl(returnPath);

    window.open(response.url, '_blank');
  } catch (error) {
    notify(error);
  }
};`;

    expect(lines(source)).toEqual([7]);
  });

  it('names the fix in the message', () => {
    const [violation] = findWindowOpenAfterAwaitViolations([
      {
        file: 'a.ts',
        source: 'async function f() { await g(); window.open(u, "_blank"); }',
      },
    ]);

    expect(violation?.message).toContain('openInNewTab');
    expect(violation?.message).toContain("'_self'");
  });

  it('flags an await inside the arguments', () => {
    expect(
      lines('async function f() { window.open(await resolve(), "_blank"); }'),
    ).toEqual([1]);
  });

  it('flags a promise callback', () => {
    expect(
      lines(
        `function f() {
  api.get().then((r) => {
    window.open(r.url, '_blank');
  });
}`,
      ),
    ).toEqual([3]);
  });

  it('flags a catch fallback', () => {
    expect(
      lines(
        'const f = () => chrome.tabs.create({ url }).catch(() => window.open(url, "_blank"));',
      ),
    ).toEqual([1]);
  });

  it('flags globalThis.open', () => {
    expect(
      lines('async function f() { await g(); globalThis.open(u, "_blank"); }'),
    ).toEqual([1]);
  });

  it('flags a call inside a for await loop', () => {
    expect(
      lines(
        'async function f(xs) { for await (const u of xs) { window.open(u, "_blank"); } }',
      ),
    ).toEqual([1]);
  });

  it('flags a call written with whitespace around the dot', () => {
    expect(
      lines('async function f() { await g(); window .open(u, "_blank"); }'),
    ).toEqual([1]);
  });

  it('counts an expression-bodied callback once', () => {
    expect(lines('p.then(() => (window.open(u, "_blank")));')).toEqual([1]);
  });

  it('does not treat a function returned from a callback as the callback', () => {
    expect(lines('p.then(() => () => window.open(u, "_blank"));')).toEqual([]);
  });

  it('accepts the tab opened before the request', () => {
    const source = `
async function openInNewTab(resolveUrl) {
  const tab = window.open('', '_blank');
  const url = await resolveUrl();
  tab.location.href = url;
}`;

    expect(lines(source)).toEqual([]);
  });

  it('accepts navigating the current tab after an await', () => {
    expect(
      lines('async function f() { await g(); window.open(u, "_self"); }'),
    ).toEqual([]);
  });

  it('accepts an open that runs before the first await', () => {
    expect(
      lines('async function f() { window.open(u, "_blank"); await g(); }'),
    ).toEqual([]);
  });

  it('does not count the await of a nested function', () => {
    const source = `
function f() {
  const load = async () => { await g(); };
  window.open(u, '_blank');
}`;

    expect(lines(source)).toEqual([]);
  });

  it('honors the audit marker with a reason', () => {
    const source = `
async function f() {
  await g();
  // window-open-audit: ignore opens a same-origin blob after a user-visible confirm
  window.open(u, '_blank');
}`;

    expect(lines(source)).toEqual([]);
  });
});

describe('allowances', () => {
  const found = (file: string, count: number) =>
    Array.from({ length: count }, (_, index) => ({
      file,
      line: index + 1,
      message: 'm',
    }));

  it('accepts exactly the listed number of calls', () => {
    expect(
      applyAllowances(found('a.ts', 2), [
        { count: 2, file: 'a.ts', reason: 'r' },
      ]),
    ).toEqual([]);
  });

  it('reports every call once a file passes its allowance', () => {
    expect(
      applyAllowances(found('a.ts', 3), [
        { count: 2, file: 'a.ts', reason: 'r' },
      ]),
    ).toHaveLength(3);
  });

  it('reports a file that is not listed', () => {
    expect(applyAllowances(found('b.ts', 1), [])).toHaveLength(1);
  });

  it('reports an allowance that is higher than the calls left', () => {
    const [stale] = applyAllowances(found('a.ts', 1), [
      { count: 2, file: 'a.ts', reason: 'r' },
    ]);

    expect(stale?.message).toContain('Lower the count');
  });

  it('keeps a reason on every listed site', () => {
    for (const allowance of WINDOW_OPEN_ALLOWANCES) {
      expect(allowance.reason.length).toBeGreaterThan(20);
    }
  });
});
