import type { WorkflowJson } from '@api/services/telegram-bot/telegram-bot.types';
import { TelegramConversationService } from '@api/services/telegram-bot/telegram-conversation.service';
import type { TelegramWorkflowRunnerService } from '@api/services/telegram-bot/telegram-workflow-runner.service';
import type { Context } from 'grammy';
import { beforeEach, describe, expect, it, vi } from 'vitest';

function buildService() {
  const runner = {
    execute: vi.fn(),
  } as unknown as TelegramWorkflowRunnerService;
  return new TelegramConversationService(runner);
}

describe('TelegramConversationService', () => {
  let service: TelegramConversationService;

  beforeEach(() => {
    service = buildService();
  });

  describe('shouldThrottlePhoto', () => {
    it('allows the first photo and throttles an immediate second', () => {
      expect(service.shouldThrottlePhoto(1)).toBe(false);
      expect(service.shouldThrottlePhoto(1)).toBe(true);
    });
  });

  describe('describeStatus', () => {
    it('reports idle when there is no conversation', () => {
      expect(service.describeStatus(undefined)).toEqual({
        statusLine: '💤 Idle',
      });
    });
  });

  describe('accessors', () => {
    it('starts with no active conversations or workflows', () => {
      expect(service.getActiveCount()).toBe(0);
      expect(service.workflowsLoaded()).toBe(0);
      expect(service.isExecuting(1)).toBe(false);
    });

    it('exposes the workflow map after it is set', () => {
      const workflows = new Map<string, WorkflowJson>([
        [
          'single-image',
          {
            description: 'd',
            edges: [],
            name: 'Single Image',
            nodes: [],
            version: 1,
          },
        ],
      ]);
      service.setWorkflows(workflows);
      expect(service.workflowsLoaded()).toBe(1);
      expect(service.getWorkflows()).toBe(workflows);
    });
  });

  describe('handleCancelCommand', () => {
    it('clears state and confirms cancellation', async () => {
      const reply = vi.fn();
      const ctx = { chat: { id: 9 }, reply } as unknown as Context;
      await service.handleCancelCommand(ctx);

      expect(reply).toHaveBeenCalledWith(
        '❌ Cancelled. Send /workflows to start again.',
      );
    });
  });
});
