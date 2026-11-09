import { describe, expect, it } from 'vitest';
import {
  isTerminalVisualCodeStatus,
  VisualCodeStatus,
} from './visual-code.enum';

describe('isTerminalVisualCodeStatus', () => {
  it.each([
    [VisualCodeStatus.QUEUED, false],
    [VisualCodeStatus.AUTHORING, false],
    [VisualCodeStatus.CHECKING, false],
    [VisualCodeStatus.RENDERING, false],
    [VisualCodeStatus.COMPLETED, true],
    [VisualCodeStatus.FAILED, true],
    [VisualCodeStatus.CANCELLED, true],
  ])('%s is terminal: %s', (status, expected) => {
    expect(isTerminalVisualCodeStatus(status)).toBe(expected);
  });
});
