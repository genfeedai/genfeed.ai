import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('~utils/logger.util', () => ({
  logger: { error: vi.fn(), log: vi.fn(), warn: vi.fn() },
}));

import { platforms } from '~platforms/config';
import {
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
