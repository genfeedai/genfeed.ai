import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('~utils/logger.util', () => ({
  logger: { error: vi.fn(), log: vi.fn(), warn: vi.fn() },
}));

import { platforms } from '~platforms/config';
import {
  findComposerScope,
  findRowAnchor,
  findSubmitButtons,
  mayContainSubmit,
  measureSkin,
  mountGenfeedGroup,
} from '~platforms/ui/mount';

const COLUMN = 'display:flex;flex-direction:column';
const ROW = 'display:flex;flex-direction:row';

function renderXToolbar(): HTMLElement {
  document.body.innerHTML = `
    <div id="row" style="${ROW}">
      <div id="icons"></div>
      <div id="wrapper" style="${COLUMN}">
        <div id="inner" style="${COLUMN}">
          <button id="submit" data-testid="tweetButtonInline">Reply</button>
        </div>
      </div>
    </div>`;
  return document.getElementById('submit') as HTMLElement;
}

describe('findRowAnchor', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('climbs out of stacked wrappers to the child of the row', () => {
    const submit = renderXToolbar();

    expect(findRowAnchor(submit).id).toBe('wrapper');
  });

  it('uses the button itself when it is already a child of a row', () => {
    document.body.innerHTML = `<div style="${ROW}"><button id="submit"></button></div>`;

    expect(findRowAnchor(document.getElementById('submit') as Element).id).toBe(
      'submit',
    );
  });

  it('falls back to the button when no ancestor is a row', () => {
    document.body.innerHTML = '<div><button id="submit"></button></div>';

    expect(findRowAnchor(document.getElementById('submit') as Element).id).toBe(
      'submit',
    );
  });
});

describe('findRowAnchor with a composer boundary', () => {
  it('does not climb past the composer into the page layout', () => {
    document.body.innerHTML = `
      <div id="page" style="${ROW}">
        <div id="composer" style="${COLUMN}">
          <div id="wrapper" style="${COLUMN}">
            <button id="submit" data-testid="tweetButtonInline">Reply</button>
          </div>
        </div>
        <aside></aside>
      </div>`;
    const submit = document.getElementById('submit') as Element;
    const composer = document.getElementById('composer') as Element;

    expect(findRowAnchor(submit).id).toBe('composer');
    expect(findRowAnchor(submit, composer).id).toBe('submit');
  });
});

describe('measureSkin', () => {
  it('copies the height of the host button', () => {
    document.body.innerHTML =
      '<button id="b" style="border-top-left-radius: 8px">Post</button>';
    const button = document.getElementById('b') as HTMLElement;
    vi.spyOn(button, 'getBoundingClientRect').mockReturnValue({
      height: 32,
    } as DOMRect);

    expect(measureSkin(button)).toEqual({ height: 32, radius: 8 });
  });

  it('caps a pill-shaped radius at half the height, and uses 36px when unmeasured', () => {
    document.body.innerHTML =
      '<button id="b" style="border-top-left-radius: 9999px">Post</button>';

    const skin = measureSkin(document.getElementById('b') as Element);

    expect(skin.height).toBe(36);
    expect(skin.radius).toBe(18);
  });
});

describe('measureSkin colours', () => {
  const skinOf = (background: string) => {
    document.body.innerHTML = `<button id="b" style="background-color: ${background}">Post</button>`;
    return measureSkin(document.getElementById('b') as Element);
  };

  it("uses a dark mark on X's white Post button", () => {
    expect(skinOf('rgb(239, 243, 244)')).toMatchObject({
      background: 'rgb(239, 243, 244)',
      color: '#0f1419',
    });
  });

  it('uses a white mark on a dark or blue Post button', () => {
    expect(skinOf('rgb(15, 20, 25)').color).toBe('#ffffff');
    expect(skinOf('rgb(10, 102, 194)').color).toBe('#ffffff');
  });

  it('copies no colours from a transparent button', () => {
    const skin = skinOf('transparent');
    expect(skin.background).toBeUndefined();
    expect(skin.color).toBeUndefined();
  });
});

describe('mountGenfeedGroup', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('puts the group on the same row, just before Reply, without moving X nodes', () => {
    const submit = renderXToolbar();
    const wrapper = document.getElementById('wrapper') as HTMLElement;

    const group = mountGenfeedGroup(submit, []);

    expect(group?.parentElement?.id).toBe('row');
    expect(group?.nextElementSibling).toBe(wrapper);
    expect(submit.parentElement?.id).toBe('inner');
  });

  it('mounts once per row', () => {
    const submit = renderXToolbar();

    expect(mountGenfeedGroup(submit, [])).not.toBeNull();
    expect(mountGenfeedGroup(submit, [])).toBeNull();
    expect(document.querySelectorAll('[data-genfeed-group]')).toHaveLength(1);
  });
});

describe('X compose modal', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  const modal = `
    <div id="modal">
      <div id="composer" style="${COLUMN}">
        <div data-testid="tweetTextarea_0" contenteditable="true"></div>
        <div id="row" style="${ROW}">
          <div id="icons"></div>
          <div id="wrapper" style="${COLUMN}">
            <button id="post" data-testid="tweetButton">Post</button>
          </div>
        </div>
      </div>
    </div>`;

  it('finds the modal Post button and the inline Reply button', () => {
    document.body.innerHTML = `${modal}<button id="reply" data-testid="tweetButtonInline">Reply</button>`;

    expect(findSubmitButtons(platforms.twitter).map((b) => b.id)).toEqual([
      'post',
      'reply',
    ]);
  });

  it('mounts beside the modal Post button', () => {
    document.body.innerHTML = modal;
    const submit = document.getElementById('post') as Element;

    const group = mountGenfeedGroup(submit, []);

    expect(group?.parentElement?.id).toBe('row');
    expect(group?.nextElementSibling?.id).toBe('wrapper');
  });

  it('finds the composer of a button, and none for a stray button', () => {
    document.body.innerHTML = `${modal}<button id="stray" data-testid="tweetButtonInline">Reply</button>`;

    expect(
      findComposerScope(
        document.getElementById('post') as Element,
        platforms.twitter,
      )?.id,
    ).toBe('composer');
    expect(
      findComposerScope(
        document.getElementById('stray') as Element,
        platforms.twitter,
      ),
    ).toBeNull();
  });

  it('moves its group, rather than adding a second, when X re-renders the row', () => {
    document.body.innerHTML = modal;
    const submit = document.getElementById('post') as Element;
    mountGenfeedGroup(submit, []);
    const wrapper = document.getElementById('wrapper') as HTMLElement;
    const rerendered = document.createElement('div');
    rerendered.id = 'row2';
    rerendered.setAttribute('style', ROW);
    document.getElementById('composer')?.appendChild(rerendered);
    rerendered.appendChild(wrapper);

    mountGenfeedGroup(submit, []);

    const groups = document.querySelectorAll('[data-genfeed-group]');
    expect(groups).toHaveLength(1);
    expect(groups[0]?.parentElement?.id).toBe('row2');
  });
});

describe('findSubmitButtons', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('uses the platform selector when there is one', () => {
    renderXToolbar();

    expect(findSubmitButtons(platforms.twitter).map((b) => b.id)).toEqual([
      'submit',
    ]);
  });

  it('finds Threads Post by its label inside the reply box form', () => {
    document.body.innerHTML = `
      <section>
        <div>
          <div contenteditable="true" role="textbox"></div>
          <div role="button" id="cancel">Cancel</div>
          <div role="button" id="post">Post</div>
        </div>
      </section>`;

    expect(findSubmitButtons(platforms.threads).map((b) => b.id)).toEqual([
      'post',
    ]);
  });

  it('finds nothing without a reply box', () => {
    document.body.innerHTML = '<div role="button">Post</div>';

    expect(findSubmitButtons(platforms.threads)).toEqual([]);
  });
});

describe('mayContainSubmit', () => {
  it('recognises a node that holds, or is, what the group attaches to', () => {
    document.body.innerHTML =
      '<div id="holder"><button data-testid="tweetButtonInline"></button></div><p id="other"></p>';

    expect(
      mayContainSubmit(
        platforms.twitter,
        document.getElementById('holder') as Element,
      ),
    ).toBe(true);
    expect(
      mayContainSubmit(
        platforms.twitter,
        document.getElementById('other') as Element,
      ),
    ).toBe(false);
  });

  it('watches for the reply box on platforms found by label', () => {
    document.body.innerHTML =
      '<div id="holder"><div contenteditable="true" role="textbox"></div></div>';

    expect(
      mayContainSubmit(
        platforms.threads,
        document.getElementById('holder') as Element,
      ),
    ).toBe(true);
  });
});
