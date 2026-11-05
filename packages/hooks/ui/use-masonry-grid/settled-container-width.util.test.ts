import { resolveSettledContainerWidth } from '@hooks/ui/use-masonry-grid/settled-container-width.util';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

class FakeKeyframeEffect {
  constructor(
    readonly target: HTMLElement,
    private readonly settledValue: string,
  ) {}

  getKeyframes() {
    return [{ width: '0px' }, { width: this.settledValue }];
  }
}

describe('resolveSettledContainerWidth', () => {
  const getAnimations = vi.fn<() => Animation[]>();

  beforeEach(() => {
    vi.stubGlobal('KeyframeEffect', FakeKeyframeEffect);
    Object.defineProperty(document, 'getAnimations', {
      configurable: true,
      value: getAnimations,
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    Reflect.deleteProperty(document, 'getAnimations');
    document.body.innerHTML = '';
  });

  // A nav column and a page column share a row; the grid sits in the page.
  function mountRow(pageStyle: string, extraSibling = '') {
    document.body.innerHTML = `
      <div id="row" style="display: flex; flex-direction: row">
        <aside id="nav" style="width: 100px; flex-grow: 0"></aside>
        ${extraSibling}
        <main id="page" style="${pageStyle}"><div id="grid"></div></main>
      </div>`;
    const grid = document.getElementById('grid') as HTMLElement;
    Object.defineProperty(grid, 'clientWidth', {
      configurable: true,
      value: 900,
    });
    const nav = document.getElementById('nav') as HTMLElement;
    getAnimations.mockReturnValue([
      {
        effect: new FakeKeyframeEffect(nav, '300px'),
        transitionProperty: 'width',
      } as unknown as Animation,
    ]);
    return grid;
  }

  it('takes the width a growing nav column leaves the page', () => {
    expect(resolveSettledContainerWidth(mountRow('flex-grow: 1'))).toBe(700);
  });

  it('ignores a nav width change when another flexible column shares the row', () => {
    const grid = mountRow(
      'flex-grow: 1',
      '<section style="flex-grow: 1"></section>',
    );

    expect(resolveSettledContainerWidth(grid)).toBeNull();
  });

  it('reports nothing when no transition is running', () => {
    const grid = mountRow('flex-grow: 1');
    getAnimations.mockReturnValue([]);

    expect(resolveSettledContainerWidth(grid)).toBeNull();
  });
});
