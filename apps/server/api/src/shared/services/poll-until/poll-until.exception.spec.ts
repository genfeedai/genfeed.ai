import { describe, expect, it } from 'vitest';
import {
  PollAbortException,
  PollTimeoutException,
} from './poll-until.exception';

describe('PollTimeoutException', () => {
  it('preserves the timeout and prototype chain', () => {
    const error = new PollTimeoutException('timed out waiting for fal', 12_000);

    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(PollTimeoutException);
    expect(error.name).toBe('PollTimeoutException');
    expect(error.message).toBe('timed out waiting for fal');
    expect(error.timeoutMs).toBe(12_000);
  });
});

describe('PollAbortException', () => {
  it('defaults the abort message and keeps instanceof working', () => {
    const error = new PollAbortException();

    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(PollAbortException);
    expect(error.name).toBe('PollAbortException');
    expect(error.message).toBe('Poll aborted');
  });

  it('accepts a custom abort message', () => {
    const error = new PollAbortException('caller cancelled the poll');

    expect(error.message).toBe('caller cancelled the poll');
  });
});
