import type { WorkflowJson } from '@api/services/telegram-bot/telegram-bot.types';
import { TelegramConversationService } from '@api/services/telegram-bot/telegram-conversation.service';
import type { TelegramWorkflowRunnerService } from '@api/services/telegram-bot/telegram-workflow-runner.service';
import type { LoggerService } from '@libs/logger/logger.service';
import type { Context } from 'grammy';
import { beforeEach, describe, expect, it, vi } from 'vitest';

function buildService() {
  const logger = {
    error: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
  } as unknown as LoggerService;
  const runner = {
    execute: vi.fn(),
  } as unknown as TelegramWorkflowRunnerService;
  return new TelegramConversationService(logger, runner);
}

describe('TelegramConversationService', () => {
  let service: TelegramConversationService;

  beforeEach(() => {
    service = buildService();
  });

  describe('pending images', () => {
    it('takes (reads + clears) a pending image once', () => {
      service.setPendingImage(1, 'url');
      expect(service.peekPendingImage(1)).toBe('url');
      expect(service.takePendingImage(1)).toBe('url');
      expect(service.peekPendingImage(1)).toBeUndefined();
      expect(service.takePendingImage(1)).toBeUndefined();
    });
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
        hasPendingImage: false,
        statusLine: '💤 Idle',
      });
    });

    it('reflects a pending image for a known chat', () => {
      service.setPendingImage(7, 'url');
      expect(service.describeStatus(7)).toEqual({
        hasPendingImage: true,
        statusLine: '💤 Idle',
      });
    });
  });

  describe('accessors', () => {
    it('starts with no active conversations, engine, or workflows', () => {
      expect(service.getActiveCount()).toBe(0);
      expect(service.hasEngine()).toBe(false);
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
      service.setPendingImage(9, 'url');

      await service.handleCancelCommand(ctx);

      expect(reply).toHaveBeenCalledWith(
        '❌ Cancelled. Send /workflows to start again.',
      );
      expect(service.peekPendingImage(9)).toBeUndefined();
    });
  });
});
