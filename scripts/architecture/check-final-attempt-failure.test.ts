import { describe, expect, it } from 'vitest';
import { findFinalAttemptViolations } from './check-final-attempt-failure';

function lines(source: string): number[] {
  return findFinalAttemptViolations([
    { file: 'apps/server/files/src/processors/a.processor.ts', source },
  ]).map((violation) => violation.line);
}

describe('failure published on every attempt', () => {
  it('flags the video processor as it shipped before #10803', () => {
    const source = `
class VideoProcessor {
  async extractFrames(job) {
    try {
      await work();
    } catch (error: unknown) {
      this.logger.error('Extract frames failed', error);
      const message = getErrorMessage(error);
      await this.publishVideoCompletion(
        ingredientId,
        job.data.userId,
        job.data.organizationId,
        'failed',
        null,
        message,
      );
      throw error;
    }
  }
}`;

    expect(lines(source)).toEqual([9]);
  });

  it('flags the YouTube processor as it shipped before #10803', () => {
    const source = `
class YoutubeProcessor {
  async process(job) {
    try {
      await upload();
    } catch (error) {
      await this.publishYoutubeCompletion(postId, userId, organizationId, 'failed', null, message);
      throw error;
    }
  }
}`;

    expect(lines(source)).toEqual([7]);
  });

  it('names the fix in the message', () => {
    const [violation] = findFinalAttemptViolations([
      {
        file: 'a.processor.ts',
        source: "try { x(); } catch (e) { publish('failed'); }",
      },
    ]);

    expect(violation?.message).toContain('isFinalAttempt(job)');
  });

  it('accepts a call behind isFinalAttempt', () => {
    expect(
      lines(`
async function f(job) {
  try { await work(); } catch (error) {
    if (isFinalAttempt(job)) {
      await publish('failed');
    }
    throw error;
  }
}`),
    ).toEqual([]);
  });

  it('accepts a guard combined with another condition', () => {
    expect(
      lines(`
async function f(job) {
  try { await work(); } catch (error) {
    if (isRawCutJob(job) && isFinalAttempt(job)) {
      await publish('failed');
    }
    throw error;
  }
}`),
    ).toEqual([]);
  });

  it('accepts a call after an early exit on the last attempt', () => {
    expect(
      lines(`
async function f(job) {
  try { await work(); } catch (error) {
    if (!isFinalAttempt(job)) {
      throw error;
    }
    await publish('failed');
  }
}`),
    ).toEqual([]);
  });

  it('flags a call in the else branch of the guard', () => {
    expect(
      lines(`
async function f(job) {
  try { await work(); } catch (error) {
    if (isFinalAttempt(job)) {
      log();
    } else {
      await publish('failed');
    }
  }
}`),
    ).toEqual([7]);
  });

  it('accepts a helper that owns the guard', () => {
    expect(
      lines(`
class P {
  async publishFinalFailure(job, message) {
    if (!isFinalAttempt(job)) return;
    await this.publish('failed', message);
  }
  async run(job) {
    try { await work(); } catch (error) {
      await this.publishFinalFailure(job, 'x');
      throw error;
    }
  }
}`),
    ).toEqual([]);
  });

  it('ignores a failed status recorded per attempt as an object field', () => {
    expect(
      lines(`
async function f() {
  try { await send(); } catch (error) {
    await record({ attempt, status: 'failed' });
  }
}`),
    ).toEqual([]);
  });

  it('ignores a failed literal outside a catch', () => {
    expect(
      lines(`
async function f(result) {
  if (result.state === 'failed') {
    await handle('failed');
  }
}`),
    ).toEqual([]);
  });

  it('does not take a guard in a nested function for the catch', () => {
    expect(
      lines(`
async function f(job) {
  try { await work(); } catch (error) {
    const later = () => { if (isFinalAttempt(job)) { x(); } };
    await publish('failed');
  }
}`),
    ).toEqual([5]);
  });
});
