vi.mock('@genfeedai/config', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@genfeedai/config')>()),
  isSelfHostedDeployment: () => false,
}));

import { StripeWebhookBillingError } from '@api/endpoints/webhooks/stripe/stripe-webhook-billing.error';
import { StripeWebhookController } from '@api/endpoints/webhooks/stripe/webhooks.stripe.controller';
import type { StripeWebhookService } from '@api/endpoints/webhooks/stripe/webhooks.stripe.service';
import {
  RELEASE_OWNED_CLAIM_SCRIPT,
  SET_OWNED_CLAIM_VALUE_SCRIPT,
} from '@api/services/cache/cache-claim-scripts';
import type { StripeService } from '@api/services/integrations/stripe/services/stripe.service';
import type { SystemEventsService } from '@api/services/system-events/system-events.service';
import {
  explore,
  type Scenario,
  type Simulation,
} from '@api-test/model-checking/interleaving-explorer';
import type { LoggerService } from '@libs/logger/logger.service';
import type { RedisService } from '@libs/redis/redis.service';
import type { Request } from 'express';
import { describe, expect, it, vi } from 'vitest';

/**
 * Stripe redelivers an event until one delivery answers 2xx, and two deliveries
 * of one event can run at once. The controller claims the event in Redis before
 * it runs the billing handler. This model replays every interleaving of two
 * concurrent deliveries and a later redelivery, with a process crash before any
 * Redis command and a claim expiring at any moment, against the real
 * controller and a Redis double whose commands are atomic steps.
 *
 * Harms it rules out:
 * - a delivery answers 2xx for an event whose handler never completed;
 * - an event that was never fulfilled stays suppressed for a day.
 *
 * The second is #10800: the claim was written for 24 hours before the handler
 * ran and survived a crash, so Stripe's retry was acknowledged as a duplicate
 * and the checkout never granted its credits.
 */

const EVENT = {
  data: { object: { id: 'in_1' } },
  id: 'evt_1',
  type: 'invoice.paid',
};

/** A claim that outlives any handler budget; only the done marker may. */
const IN_PROGRESS_CEILING_SECONDS = 600;

type Entry = { ttl: number; value: string };

type World = {
  answered: Array<{ delivery: string; status: number }>;
  fulfilled: boolean;
  store: Map<string, Entry>;
};

function redisDouble(sim: Simulation, world: World) {
  /** Each command is one atomic step; its reply is what the caller learns. */
  const reply = <T>(value: T): T => {
    sim.observed(value);
    return value;
  };
  return {
    del: async (key: string) => {
      await sim.step(`redis DEL ${key}`);
      return reply(world.store.delete(key) ? 1 : 0);
    },
    eval: async (script: string, _keyCount: number, ...args: unknown[]) => {
      if (script === SET_OWNED_CLAIM_VALUE_SCRIPT) {
        await sim.step('redis EVAL promote claim');
        const [key, , token, value, ttl] = args as [
          string,
          string,
          string,
          string,
          number,
        ];
        if (world.store.get(key)?.value !== token) return reply(0);
        world.store.set(key, { ttl, value });
        return reply(1);
      }
      if (script === RELEASE_OWNED_CLAIM_SCRIPT) {
        await sim.step('redis EVAL release claim');
        const [key, token] = args as [string, string];
        if (world.store.get(key)?.value !== token) return reply(0);
        world.store.delete(key);
        return reply(1);
      }
      throw new Error('The controller ran a script this model does not know.');
    },
    get: async (key: string) => {
      await sim.step(`redis GET ${key}`);
      return reply(world.store.get(key)?.value ?? null);
    },
    set: async (
      key: string,
      value: string,
      _ex: 'EX',
      ttl: number,
      _nx: 'NX',
    ) => {
      await sim.step(`redis SET NX ${key}`);
      if (world.store.has(key)) return reply(null);
      world.store.set(key, { ttl, value });
      return reply('OK');
    },
  };
}

function handlerDouble(sim: Simulation, world: World) {
  return async () => {
    const outcome = await sim.choose('billing handler', ['succeeds', 'fails']);
    if (outcome === 'fails') {
      throw new StripeWebhookBillingError('identity_missing');
    }
    await sim.step('billing handler grants credits');
    world.fulfilled = true;
  };
}

type Delivery = (request: Request) => Promise<{ success: boolean }>;

/** Two concurrent crashable deliveries, then one redelivery once they ended. */
function stripeScenario(
  makeDelivery: (
    sim: Simulation,
    world: World,
    handler: () => Promise<void>,
  ) => Delivery,
): () => Scenario {
  return () => {
    const world: World = { answered: [], fulfilled: false, store: new Map() };
    return {
      final: () => {
        if (world.fulfilled) return null;
        const permanent = [...world.store.entries()].find(
          ([, entry]) => entry.ttl > IN_PROGRESS_CEILING_SECONDS,
        );
        return permanent
          ? `${permanent[0]} is held for ${permanent[1].ttl}s although the event was never fulfilled`
          : null;
      },
      invariant: () => {
        const wrong = world.answered.find(
          (answer) => answer.status === 200 && !world.fulfilled,
        );
        return wrong
          ? `${wrong.delivery} answered 200 for an event the handler never completed`
          : null;
      },
      snapshot: () =>
        JSON.stringify([
          [...world.store.entries()],
          world.fulfilled,
          world.answered,
        ]),
      start: (sim) => {
        sim.environment(
          'an in-progress claim expires',
          () =>
            [...world.store.values()].some(
              (entry) => entry.ttl <= IN_PROGRESS_CEILING_SECONDS,
            ),
          () => {
            for (const [key, entry] of world.store) {
              if (entry.ttl <= IN_PROGRESS_CEILING_SECONDS) {
                world.store.delete(key);
              }
            }
          },
        );
        const handler = handlerDouble(sim, world);
        const deliver = makeDelivery(sim, world, handler);
        const run = (name: string, crashable: boolean) =>
          sim.spawn(
            name,
            async () => {
              const result = await deliver({
                body: Buffer.from('{}'),
                headers: { 'stripe-signature': 'signed' },
              } as unknown as Request).catch(() => ({ success: false }));
              world.answered.push({
                delivery: name,
                status: result.success ? 200 : 503,
              });
            },
            { crashable },
          );
        run('delivery 1', true);
        run('delivery 2', true);
        sim.onQuiescence(() => run('redelivery', false));
      },
    };
  };
}

function realController(
  sim: Simulation,
  world: World,
  handler: () => Promise<void>,
) {
  const publisher = redisDouble(sim, world);
  const quiet = { error: vi.fn(), log: vi.fn(), warn: vi.fn() };
  const controller = new StripeWebhookController(
    quiet as unknown as LoggerService,
    { getPublisher: () => publisher } as unknown as RedisService,
    {
      constructWebhookEvent: async () => EVENT,
    } as unknown as StripeService,
    { handleWebhookEvent: handler } as unknown as StripeWebhookService,
    {
      recordStripeEvent: async () => undefined,
    } as unknown as SystemEventsService,
  );
  return (request: Request) => controller.handleStripe(request);
}

/**
 * The controller before #10800 (b0645e6ab^): the claim is a plain 24 hour key
 * written before the handler, a second delivery that finds it answers 2xx, and
 * only a handled failure deletes it.
 */
function controllerBefore10800(
  sim: Simulation,
  world: World,
  handler: () => Promise<void>,
) {
  const publisher = redisDouble(sim, world);
  return async (_request: Request) => {
    const key = `stripe:webhook:${EVENT.id}`;
    const acquired = await publisher.set(key, 'claimed', 'EX', 86_400, 'NX');
    if (!acquired) return { success: true };
    try {
      await handler();
    } catch (error) {
      await publisher.del(key);
      throw error;
    }
    return { success: true };
  };
}

describe('Stripe webhook claim, every interleaving', () => {
  it('never acknowledges or suppresses an event whose handler did not complete', async () => {
    const result = await explore(stripeScenario(realController));

    expect(result.violation).toBeNull();
    expect(result.schedules).toBeGreaterThan(1000);
  });

  it('fails on the claim the controller wrote before #10800', async () => {
    const result = await explore(stripeScenario(controllerBefore10800));

    expect(result.violation).toEqual({
      message:
        'delivery 2 answered 200 for an event the handler never completed',
      trace: [
        'delivery 1: redis SET NX stripe:webhook:evt_1',
        'delivery 2: redis SET NX stripe:webhook:evt_1',
      ],
    });
  });
});
