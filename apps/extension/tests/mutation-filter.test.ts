import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  meaningfulMutations,
  observeAddedElements,
} from '~platforms/mutation-filter';

function record(overrides: Partial<MutationRecord>): MutationRecord {
  return {
    addedNodes: [] as unknown as NodeList,
    attributeName: null,
    attributeNamespace: null,
    nextSibling: null,
    oldValue: null,
    previousSibling: null,
    removedNodes: [] as unknown as NodeList,
    target: document.body,
    type: 'childList',
    ...overrides,
  };
}

beforeEach(() => {
  document.body.innerHTML = `
    <main id="timeline"></main>
    <div id="editor" data-testid="tweetTextarea_0" role="textbox" contenteditable="true">
      <div id="editor-line"><span id="typed">hello</span></div>
    </div>
    <div data-genfeed-group id="genfeed-group"></div>
  `;
});

const byId = (id: string): Node => document.getElementById(id) as Node;

describe('meaningfulMutations', () => {
  it.each([
    ['the timeline', () => byId('timeline'), 1],
    ['the editor', () => byId('editor'), 0],
    ['a line inside the editor', () => byId('editor-line'), 0],
    ['the text node being typed', () => byId('typed').firstChild as Node, 0],
    ['a Genfeed group', () => byId('genfeed-group'), 0],
  ])('treats a change in %s', (_name, target, expected) => {
    const mutations = [record({ target: target(), type: 'characterData' })];

    expect(meaningfulMutations(mutations)).toHaveLength(expected);
  });
});

describe('observeAddedElements', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('scans once for a burst of timeline additions', async () => {
    let scans = 0;
    const onChange = () => {
      scans += 1;
    };
    const stop = observeAddedElements(document.body, onChange, 250);

    const timeline = byId('timeline') as Element;
    timeline.append(document.createElement('p'));
    timeline.append(document.createElement('p'));
    timeline.append(document.createElement('p'));
    await Promise.resolve();
    expect(scans).toBe(0);
    vi.advanceTimersByTime(250);

    expect(scans).toBe(1);
    stop();
  });

  it('does not scan while the person types in the editor', async () => {
    let scans = 0;
    const onChange = () => {
      scans += 1;
    };
    const stop = observeAddedElements(document.body, onChange, 250);

    document.querySelector('#editor-line')?.append(document.createElement('b'));
    document
      .querySelector('#genfeed-group')
      ?.append(document.createElement('i'));
    await Promise.resolve();
    vi.advanceTimersByTime(1000);

    expect(scans).toBe(0);
    stop();
  });

  it('does not scan after it is stopped', async () => {
    let scans = 0;
    const onChange = () => {
      scans += 1;
    };
    const stop = observeAddedElements(document.body, onChange, 250);
    document.querySelector('#timeline')?.append(document.createElement('p'));
    await Promise.resolve();
    stop();
    vi.advanceTimersByTime(1000);

    expect(scans).toBe(0);
  });
});
