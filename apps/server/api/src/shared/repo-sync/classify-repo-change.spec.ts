import { classifyRepoChange } from './classify-repo-change';

describe('classifyRepoChange', () => {
  it.each([
    ['nothing stored', { repo: 'r' }, 'new'],
    ['stored equals repo', { base: 'b', local: 'r', repo: 'r' }, 'unchanged'],
    ['untouched, repo moved', { base: 'b', local: 'b', repo: 'r' }, 'updated'],
    ['edited, repo unchanged', { base: 'b', local: 'l', repo: 'b' }, 'edited'],
    ['edited, repo moved', { base: 'b', local: 'l', repo: 'r' }, 'conflict'],
    ['same name added by hand', { local: 'l', repo: 'r' }, 'conflict'],
    [
      'edited to match the repo',
      { base: 'b', local: 'r', repo: 'r' },
      'unchanged',
    ],
  ] as const)('%s', (_name, fingerprints, expected) => {
    expect(classifyRepoChange(fingerprints)).toBe(expected);
  });
});
