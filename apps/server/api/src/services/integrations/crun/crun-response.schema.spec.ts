import {
  parseCrunCreateTask,
  parseCrunEstimate,
  parseCrunTaskInfo,
} from '@api/services/integrations/crun/crun-response.schema';

function info(overrides: Record<string, unknown> = {}) {
  return {
    code: 200,
    message: 'untrusted provider text',
    data: {
      task_id: 'task_1234567',
      provider: 'bytedance',
      model_version: 'seedream-4.5',
      status: 'success',
      param: {
        input: {
          prompt: 'private',
          img_urls: ['https://private.test/signed?token=private'],
        },
      },
      create_at: 1715750400,
      source: 'api',
      credits: 6,
      result: {
        code: 200,
        message: 'private',
        media_urls: ['https://fixture.test/image.png'],
        usage: { private: 'private' },
      },
      ...overrides,
    },
  };
}

describe('documented Crun response contract', () => {
  it.each(['task_1234567', 'ABC-id:one/+?=case', 'x'.repeat(256)])(
    'preserves opaque accepted ID %s',
    (taskId) => {
      expect(
        parseCrunCreateTask(200, {
          code: 200,
          message: 'success',
          data: { task_id: taskId },
        }),
      ).toEqual({ isValid: true, data: { taskId } });
    },
  );
  it.each(['', ' x', 'x y', 'x\n', 'x'.repeat(257), 'é'])(
    'rejects invalid opaque ID %s',
    (taskId) => {
      expect(
        parseCrunCreateTask(200, {
          code: 200,
          message: 'success',
          data: { task_id: taskId },
        }).isValid,
      ).toBe(false);
    },
  );
  it.each([
    {},
    { code: 200, data: { task_id: 'accepted' } },
    { code: 200, message: 'success', data: {} },
  ])('does not invent acceptance from malformed success', (value) => {
    expect(parseCrunCreateTask(200, value).isValid).toBe(false);
  });
  it('requires both HTTP and application success', () => {
    expect(
      parseCrunEstimate(500, {
        code: 200,
        message: 'success',
        data: { credits: 6, estimated: false },
      }).isValid,
    ).toBe(false);
    expect(
      parseCrunEstimate(200, {
        code: 402,
        message: 'private',
        data: { credits: 6, estimated: false },
      }).isValid,
    ).toBe(false);
  });
  it('accepts fractional numeric credits and preserves estimated eligibility for the quote gate', () => {
    expect(
      parseCrunEstimate(200, {
        code: 200,
        message: 'success',
        data: { credits: 1.5, estimated: false },
      }),
    ).toEqual({ isValid: true, data: { credits: '1.5', estimated: false } });
    expect(
      parseCrunEstimate(200, {
        code: 200,
        message: 'success',
        data: { credits: 1e-7, estimated: true },
      }),
    ).toEqual({
      isValid: true,
      data: { credits: '0.0000001', estimated: true },
    });
  });
  it.each(['6', null, -1, NaN, Infinity])(
    'rejects invalid provider credit value %s',
    (credits) => {
      expect(
        parseCrunEstimate(200, {
          code: 200,
          message: 'success',
          data: { credits, estimated: false },
        }).isValid,
      ).toBe(false);
    },
  );
  it('binds status to the exact durable ID without deriving model identity from descriptive metadata', () => {
    expect(parseCrunTaskInfo(200, info(), 'task_1234567').isValid).toBe(true);
    expect(parseCrunTaskInfo(200, info(), 'TASK_1234567')).toEqual({
      isValid: false,
      reasonCode: 'CRUN_TASK_ID_MISMATCH',
    });
  });
  it.each([
    { source: 'playground' },
    { status: 'completed' },
    { param: null },
    { provider: '' },
    { model_version: '' },
    { create_at: -1 },
  ])('rejects an unbound or malformed task envelope', (override) => {
    expect(parseCrunTaskInfo(200, info(override), 'task_1234567').isValid).toBe(
      false,
    );
  });
  it('uses status authority even when result.code looks like success/failure', () => {
    const response = parseCrunTaskInfo(
      200,
      info({
        status: 'failed',
        credits: 1.5,
        result: { code: 200, message: 'success' },
      }),
      'task_1234567',
    );
    expect(response).toMatchObject({
      isValid: true,
      data: { status: 'failed', credits: '1.5', recoveryCode: null },
    });
    const pending = parseCrunTaskInfo(
      200,
      info({
        status: 'pending',
        credits: 6,
        result: { code: 501, message: 'failed' },
      }),
      'task_1234567',
    );
    expect(pending).toMatchObject({
      isValid: true,
      data: { status: 'pending', credits: null },
    });
  });
  it('projects no original parameters, messages, usage or unknown keys', () => {
    const response = parseCrunTaskInfo(
      200,
      info({ unknown: 'private' }),
      'task_1234567',
    );
    expect(JSON.stringify(response)).not.toContain('private');
    expect(response).toMatchObject({
      isValid: true,
      data: { credits: '6', mediaCount: 1 },
    });
  });
  it('retains actual credits even when successful media is invalid', () => {
    const response = parseCrunTaskInfo(
      200,
      info({
        result: {
          media_urls: ['https://fixture.test/a', 'https://fixture.test/b'],
        },
      }),
      'task_1234567',
    );
    expect(response).toMatchObject({
      isValid: true,
      data: {
        credits: '6',
        mediaCount: 2,
        mediaUrls: [],
        recoveryCode: 'CRUN_OUTPUT_INVALID',
      },
    });
  });
  it.each([
    'http://fixture.test/x',
    'https://user:password@fixture.test/x',
    `https://fixture.test/${'x'.repeat(4096)}`,
  ])('rejects unsafe output URL', (url) => {
    expect(
      parseCrunTaskInfo(
        200,
        info({ result: { media_urls: [url] } }),
        'task_1234567',
      ),
    ).toMatchObject({
      isValid: true,
      data: {
        credits: '6',
        mediaUrls: [],
        recoveryCode: 'CRUN_OUTPUT_INVALID',
      },
    });
  });
  it.each([undefined, null, '6', -1])(
    'keeps terminal funding unresolved for absent/invalid credits',
    (credits) => {
      expect(
        parseCrunTaskInfo(200, info({ credits }), 'task_1234567'),
      ).toMatchObject({
        isValid: true,
        data: { credits: null, recoveryCode: 'CRUN_TERMINAL_CREDITS_MISSING' },
      });
    },
  );
});
