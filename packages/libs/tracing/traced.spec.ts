import 'reflect-metadata';
import { isTraced, Traced, traced } from '@libs/tracing/traced';
import { SetMetadata } from '@nestjs/common';
import { flush, init, startSpan } from '@sentry/nestjs';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';

/** The span shape `beforeSendSpan` receives in streaming mode. */
type StreamedSpanJSON = Parameters<
  NonNullable<NonNullable<Parameters<typeof init>[0]>['beforeSendSpan']>
>[0];

const sentSpans: StreamedSpanJSON[] = [];

function childSpans(): StreamedSpanJSON[] {
  return sentSpans.filter((span) => !span.is_segment);
}

async function inRootSpan(run: () => Promise<unknown>): Promise<void> {
  await startSpan({ name: 'root', op: 'test' }, run).catch(() => undefined);
  await flush(1000);
}

@Traced()
class OrdersService {
  private readonly prefix = 'order';

  async findOne(id: string): Promise<string> {
    return `${this.prefix}-${id}`;
  }

  async fail(): Promise<never> {
    throw new Error('boom');
  }

  @SetMetadata('genfeed:test', 'kept')
  async withMetadata(): Promise<string> {
    return 'ok';
  }

  format(id: string): string {
    return `${this.prefix}:${id}`;
  }

  async onModuleInit(): Promise<void> {}

  get label(): string {
    return this.prefix;
  }
}

class ReportsService {
  @Traced()
  build(): string {
    return 'built';
  }
}

const loadReport = traced('loadReport', async (id: string) => `report-${id}`);

describe('Traced', () => {
  beforeAll(() => {
    init({
      beforeSendSpan(span) {
        sentSpans.push(span);
        return span;
      },
      dsn: 'https://public@o0.ingest.sentry.io/0',
      integrations: [],
      tracesSampleRate: 1,
      transport: () => ({
        flush: async () => true,
        send: async () => ({}),
      }),
    });
  });

  beforeEach(() => {
    sentSpans.length = 0;
  });

  it('spans an async class method under the active span and keeps `this`', async () => {
    const service = new OrdersService();
    let result = '';

    await inRootSpan(async () => {
      result = await service.findOne('42');
    });

    expect(result).toBe('order-42');
    expect(childSpans()).toEqual([
      expect.objectContaining({
        attributes: expect.objectContaining({
          'code.function.name': 'findOne',
          'code.namespace': 'OrdersService',
          'sentry.op': 'function',
          'sentry.origin': 'manual.genfeed.traced',
        }),
        name: 'OrdersService.findOne',
        status: 'ok',
      }),
    ]);
  });

  it('marks the span as failed and rethrows when the method rejects', async () => {
    const service = new OrdersService();

    await expect(
      startSpan({ name: 'root', op: 'test' }, () => service.fail()),
    ).rejects.toThrow('boom');
    await flush(1000);

    expect(childSpans()).toEqual([
      expect.objectContaining({
        name: 'OrdersService.fail',
        status: 'error',
      }),
    ]);
  });

  it('leaves sync methods, accessors and lifecycle hooks unwrapped', () => {
    const prototype = OrdersService.prototype;

    expect(isTraced(prototype.findOne)).toBe(true);
    expect(isTraced(prototype.format)).toBe(false);
    expect(isTraced(prototype.onModuleInit)).toBe(false);
    expect(new OrdersService().label).toBe('order');
  });

  it('keeps Nest metadata set on the original method', () => {
    expect(
      Reflect.getMetadata('genfeed:test', OrdersService.prototype.withMetadata),
    ).toBe('kept');
  });

  it('spans a single decorated method even when it is sync', async () => {
    let result = '';

    await inRootSpan(async () => {
      result = new ReportsService().build();
    });

    expect(result).toBe('built');
    expect(childSpans()).toEqual([
      expect.objectContaining({ name: 'ReportsService.build' }),
    ]);
  });

  it('spans an exported function defined through traced()', async () => {
    let result = '';

    await inRootSpan(async () => {
      result = await loadReport('7');
    });

    expect(result).toBe('report-7');
    expect(childSpans()).toEqual([
      expect.objectContaining({
        attributes: expect.objectContaining({
          'code.function.name': 'loadReport',
          'sentry.op': 'function',
        }),
        name: 'loadReport',
      }),
    ]);
  });
});
