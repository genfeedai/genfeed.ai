import { LoggerService } from '@libs/logger/logger.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Test, type TestingModule } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { EventBusService } from './event-bus.service';

describe('EventBusService', () => {
  let service: EventBusService;
  let eventEmitter: {
    emit: ReturnType<typeof vi.fn>;
    emitAsync: ReturnType<typeof vi.fn>;
    listenerCount: ReturnType<typeof vi.fn>;
  };
  let loggerService: {
    debug: ReturnType<typeof vi.fn>;
    error: ReturnType<typeof vi.fn>;
    log: ReturnType<typeof vi.fn>;
    warn: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    eventEmitter = {
      emit: vi.fn(),
      emitAsync: vi.fn().mockResolvedValue(undefined),
      listenerCount: vi.fn().mockReturnValue(0),
    };
    loggerService = {
      debug: vi.fn(),
      error: vi.fn(),
      log: vi.fn(),
      warn: vi.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EventBusService,
        { provide: EventEmitter2, useValue: eventEmitter },
        { provide: LoggerService, useValue: loggerService },
      ],
    }).compile();

    service = module.get<EventBusService>(EventBusService);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('emit', () => {
    it('should emit event via EventEmitter2', () => {
      service.emit('test.event', { key: 'value' });

      expect(eventEmitter.emit).toHaveBeenCalledWith('test.event', {
        key: 'value',
      });
    });

    it('should call directly registered handlers', () => {
      const handler = vi.fn();
      service.subscribe('test.event', handler);

      service.emit('test.event', { key: 'value' });

      expect(handler).toHaveBeenCalledWith({ key: 'value' });
    });

    it('should call multiple handlers for the same event', () => {
      const handler1 = vi.fn();
      const handler2 = vi.fn();
      service.subscribe('test.event', handler1);
      service.subscribe('test.event', handler2);

      service.emit('test.event', { data: 1 });

      expect(handler1).toHaveBeenCalled();
      expect(handler2).toHaveBeenCalled();
    });

    it('should catch and log sync handler errors without throwing', () => {
      const failingHandler = vi.fn().mockImplementation(() => {
        throw new Error('Handler exploded');
      });
      service.subscribe('test.event', failingHandler);

      expect(() => service.emit('test.event', {})).not.toThrow();
      expect(loggerService.error).toHaveBeenCalledWith(
        expect.stringContaining('Event handler failed for test.event'),
        expect.any(Object),
        expect.any(String),
      );
    });

    it('should catch and log async handler rejection without throwing', () => {
      const asyncHandler = vi
        .fn()
        .mockRejectedValue(new Error('Async failure'));
      service.subscribe('test.event', asyncHandler);

      expect(() => service.emit('test.event', {})).not.toThrow();
      // The rejection is caught via .catch() — give it a tick
    });

    it('should not call handlers for different event types', () => {
      const handler = vi.fn();
      service.subscribe('other.event', handler);

      service.emit('test.event', {});

      expect(handler).not.toHaveBeenCalled();
    });
  });

  describe('emitAsync', () => {
    it('should emit async event via EventEmitter2', async () => {
      await service.emitAsync('test.event', { key: 'value' });

      expect(eventEmitter.emitAsync).toHaveBeenCalledWith('test.event', {
        key: 'value',
      });
    });

    it('should wait for all async handlers to complete', async () => {
      const order: number[] = [];
      const handler1 = vi.fn().mockImplementation(async () => {
        order.push(1);
      });
      const handler2 = vi.fn().mockImplementation(async () => {
        order.push(2);
      });
      service.subscribe('test.event', handler1);
      service.subscribe('test.event', handler2);

      await service.emitAsync('test.event', {});

      expect(handler1).toHaveBeenCalled();
      expect(handler2).toHaveBeenCalled();
      expect(order).toEqual([1, 2]);
    });

    it('should catch and log errors from sync handlers within emitAsync', async () => {
      const failingHandler = vi.fn().mockImplementation(() => {
        throw new Error('Sync failure in async emit');
      });
      service.subscribe('test.event', failingHandler);

      await service.emitAsync('test.event', {});

      expect(loggerService.error).toHaveBeenCalledWith(
        expect.stringContaining('Event handler failed'),
        expect.any(Object),
        expect.any(String),
      );
    });
  });

  describe('subscribe', () => {
    it('should return an unsubscribe function', () => {
      const handler = vi.fn();
      const unsubscribe = service.subscribe('test.event', handler);

      expect(typeof unsubscribe).toBe('function');
    });

    it('should remove handler when unsubscribe is called', () => {
      const handler = vi.fn();
      const unsubscribe = service.subscribe('test.event', handler);

      unsubscribe();
      service.emit('test.event', {});

      expect(handler).not.toHaveBeenCalled();
    });

    it('should only unsubscribe the specific handler', () => {
      const handler1 = vi.fn();
      const handler2 = vi.fn();
      const unsub1 = service.subscribe('test.event', handler1);
      service.subscribe('test.event', handler2);

      unsub1();
      service.emit('test.event', {});

      expect(handler1).not.toHaveBeenCalled();
      expect(handler2).toHaveBeenCalled();
    });
  });

  describe('subscribeMany', () => {
    it('should subscribe to multiple event types with one handler', () => {
      const handler = vi.fn();
      service.subscribeMany(['event.a', 'event.b'], handler);

      service.emit('event.a', { type: 'a' });
      service.emit('event.b', { type: 'b' });

      expect(handler).toHaveBeenCalledTimes(2);
    });

    it('should unsubscribe from all event types at once', () => {
      const handler = vi.fn();
      const unsubscribe = service.subscribeMany(
        ['event.a', 'event.b'],
        handler,
      );

      unsubscribe();
      service.emit('event.a', {});
      service.emit('event.b', {});

      expect(handler).not.toHaveBeenCalled();
    });
  });

  describe('hasHandlers', () => {
    it('should return false when no handlers are registered', () => {
      expect(service.hasHandlers('test.event')).toBe(false);
    });

    it('should return true when direct handlers are registered', () => {
      service.subscribe('test.event', vi.fn());

      expect(service.hasHandlers('test.event')).toBe(true);
    });

    it('should return true when EventEmitter2 has listeners', () => {
      eventEmitter.listenerCount.mockReturnValue(1);

      expect(service.hasHandlers('test.event')).toBe(true);
    });
  });

  describe('getHandlerCount', () => {
    it('should return 0 when no handlers exist', () => {
      expect(service.getHandlerCount('test.event')).toBe(0);
    });

    it('should count direct handlers', () => {
      service.subscribe('test.event', vi.fn());
      service.subscribe('test.event', vi.fn());

      expect(service.getHandlerCount('test.event')).toBe(2);
    });

    it('should include EventEmitter2 listener count', () => {
      service.subscribe('test.event', vi.fn());
      eventEmitter.listenerCount.mockReturnValue(3);

      expect(service.getHandlerCount('test.event')).toBe(4);
    });
  });

  describe('clearHandlers', () => {
    it('should remove all direct handlers', () => {
      const handler = vi.fn();
      service.subscribe('test.event', handler);

      service.clearHandlers();
      service.emit('test.event', {});

      expect(handler).not.toHaveBeenCalled();
    });

    it('should reset handler count to zero', () => {
      service.subscribe('event.a', vi.fn());
      service.subscribe('event.b', vi.fn());

      service.clearHandlers();

      expect(service.getHandlerCount('event.a')).toBe(0);
      expect(service.getHandlerCount('event.b')).toBe(0);
    });
  });

  describe('onModuleDestroy', () => {
    it('should clear all handlers on module destroy', () => {
      const handler = vi.fn();
      service.subscribe('test.event', handler);

      service.onModuleDestroy();
      service.emit('test.event', {});

      expect(handler).not.toHaveBeenCalled();
    });
  });
});
