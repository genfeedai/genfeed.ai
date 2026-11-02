import { describe, expect, it } from 'vitest';
import { isProjectChangeRequest } from './project-change-request';

describe('isProjectChangeRequest', () => {
  it.each([
    ['revise the intro', true],
    ['Edit the second clip', true],
    ['  continue where we left off', true],
    ['please fix the captions', true],
    ['Can you update the hook?', true],
    ['could you tweak the colors', true],
    ['a week of posts about spring', false],
    ['how to fix a bike in five minutes', false],
    ['launch video for the new bag', false],
    ['editorial photos of the lookbook', false],
    ['', false],
  ])('classifies %j as %s', (prompt, expected) => {
    expect(isProjectChangeRequest(prompt)).toBe(expected);
  });
});
