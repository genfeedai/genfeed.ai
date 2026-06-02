import { beforeEach, describe, expect, it, vi } from 'vitest';
import { workflowCommand } from '../../src/commands/workflow';
import { GenfeedError } from '../../src/utils/errors';

const { mockHandleError, mockPost, mockPrintJson, mockRequireAuth } = vi.hoisted(() => ({
  mockHandleError: vi.fn((error: unknown) => {
    throw error;
  }),
  mockPost: vi.fn(),
  mockPrintJson: vi.fn(),
  mockRequireAuth: vi.fn(),
}));

vi.mock('../../src/api/client', () => ({
  get: vi.fn(),
  post: (...args: unknown[]) => mockPost(...args),
  requireAuth: () => mockRequireAuth(),
}));

vi.mock('../../src/ui/theme', () => ({
  formatHeader: (value: string) => value,
  formatLabel: (label: string, value: string) => `${label}: ${value}`,
  print: vi.fn(),
  printJson: (value: unknown) => mockPrintJson(value),
}));

vi.mock('../../src/utils/errors', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/utils/errors')>();
  return {
    ...actual,
    handleError: (error: unknown) => mockHandleError(error),
  };
});

describe('workflow command', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAuth.mockResolvedValue('api-key');
    mockPost.mockResolvedValue({
      data: {
        attributes: {},
        id: 'exec-1',
        type: 'workflow-execution',
      },
    });
  });

  it.each([
    '[]',
    'null',
    '"text"',
    '42',
  ])('rejects non-object --inputs value %s', async (inputs) => {
    await expect(
      workflowCommand.parseAsync(['run', 'workflow-1', '--inputs', inputs], { from: 'user' })
    ).rejects.toThrow(GenfeedError);

    expect(mockHandleError).toHaveBeenCalledWith(
      expect.objectContaining({
        message: '--inputs must be a JSON object',
      })
    );
    expect(mockPost).not.toHaveBeenCalled();
  });

  it('rejects malformed --inputs JSON with a stable CLI error', async () => {
    await expect(
      workflowCommand.parseAsync(['run', 'workflow-1', '--inputs', '{bad'], { from: 'user' })
    ).rejects.toThrow(GenfeedError);

    expect(mockHandleError).toHaveBeenCalledWith(
      expect.objectContaining({
        message: '--inputs must be a JSON object',
      })
    );
    expect(mockPost).not.toHaveBeenCalled();
  });

  it('posts object inputs for workflow execution', async () => {
    await workflowCommand.parseAsync(
      ['run', 'workflow-1', '--inputs', '{"topic":"launch"}', '--json'],
      { from: 'user' }
    );

    expect(mockPost).toHaveBeenCalledWith('/workflow-executions', {
      inputs: { topic: 'launch' },
      trigger: 'manual',
      workflow: 'workflow-1',
    });
    expect(mockPrintJson).toHaveBeenCalledWith({
      executionId: 'exec-1',
      workflowId: 'workflow-1',
    });
  });
});
