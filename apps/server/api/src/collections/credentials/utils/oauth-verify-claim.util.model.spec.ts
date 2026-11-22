vi.mock('@genfeedai/prisma', async () => {
  const { canonicalPrismaMock } = await import(
    '@api/shared/testing/prisma-mock'
  );
  return canonicalPrismaMock();
});

import { CredentialCryptoService } from '@api/collections/credentials/services/credential-crypto.service';
import { CredentialsService } from '@api/collections/credentials/services/credentials.service';
import { ProviderAccountPurgeService } from '@api/collections/credentials/services/provider-account-purge.service';
import {
  claimOAuthVerifyCredential,
  OAUTH_VERIFY_CLAIM_WAIT_MS,
} from '@api/collections/credentials/utils/oauth-verify-claim.util';
import {
  explore,
  type Scenario,
  type Simulation,
} from '@api-test/model-checking/interleaving-explorer';
import { CredentialPlatform } from '@genfeedai/contracts';
import type { ConfigService } from '@libs/config/config.service';
import type { EventEmitter2 } from '@nestjs/event-emitter';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * An OAuth callback page can send its verify request twice (a double render, a
 * retry, two tabs), and the provider's authorization code works once. This
 * model runs the real claim and the real wait of #10824 over a credential table
 * whose every statement is an atomic step, with time passing at any moment and
 * the request that holds the claim crashing before any step.
 *
 * Harms it states:
 * - the code is exchanged twice (ruled out);
 * - a verify that lost the claim to a request that then connected the account
 *   answers "invalid state", which the user sees as a failed connection (a gap
 *   in #10824, tracked in #10863).
 */

const STATE = 'oauth-state-1';
const ORG = 'org-1';
const USER = 'user-1';
const CREDENTIAL_ID = 'credential-1';
const START = new Date('2026-11-22T12:00:00.000Z');
const TIME_STEP_MS = 250;

type Row = {
  brandId: string | null;
  id: string;
  isConnected: boolean;
  isDeleted: boolean;
  oauthState: string | null;
  organizationId: string | null;
  platform: string;
  updatedAt: Date;
  userId: string | null;
};

type Outcome = { elapsedMs: number; kind: 'connected' | 'invalid' };

type World = {
  exchanges: number;
  /** Verifies whose claim matched nothing while another request held it. */
  lostWhileHeld: Set<string>;
  outcomes: Map<string, Outcome>;
  row: Row;
};

type Where = Record<string, unknown>;

function pendingRow(): Row {
  return {
    brandId: 'brand-1',
    id: CREDENTIAL_ID,
    isConnected: false,
    isDeleted: false,
    oauthState: STATE,
    organizationId: ORG,
    platform: 'TWITTER',
    updatedAt: new Date(START),
    userId: USER,
  };
}

/** The part of a Prisma `where` the claim uses; any other filter throws. */
function matches(row: Row, where: Where): boolean {
  return Object.entries(where).every(([key, wanted]) => {
    const actual = (row as unknown as Where)[key];
    if (wanted !== null && typeof wanted === 'object') {
      const condition = wanted as Where;
      return Object.entries(condition).every(([operator, operand]) => {
        if (operator === 'not') return actual !== operand;
        if (operator === 'gte') return (actual as Date) >= (operand as Date);
        throw new Error(
          `The model does not know the filter ${key}.${operator}.`,
        );
      });
    }
    return actual === wanted;
  });
}

/** The table an actor talks to; its name tells a lost claim whose it was. */
function credentialTable(sim: Simulation, world: World, actor: string) {
  return {
    credential: {
      findFirst: async ({ where }: { where: Where }) => {
        await sim.step('postgres SELECT credential');
        const found = matches(world.row, where) ? { ...world.row } : null;
        sim.observed(found ? { ...found, updatedAt: null } : null);
        return found;
      },
      updateMany: async ({
        data,
        where,
      }: {
        data: Partial<Row>;
        where: Where;
      }) => {
        await sim.step('postgres UPDATE credential');
        const hit = matches(world.row, where);
        if (hit) {
          Object.assign(world.row, data, { updatedAt: new Date() });
        } else if (world.row.oauthState?.startsWith('claimed:')) {
          world.lostWhileHeld.add(actor);
        }
        sim.observed(hit ? 1 : 0);
        return { count: hit ? 1 : 0 };
      },
    },
  };
}

function serviceFor(
  sim: Simulation,
  world: World,
  actor: string,
): CredentialsService {
  const prisma = credentialTable(sim, world, actor);
  const accessBootstrapCache = {
    invalidateForOrganization: vi.fn().mockResolvedValue(undefined),
  };
  return new CredentialsService(
    prisma as never,
    { debug: vi.fn(), error: vi.fn(), log: vi.fn(), warn: vi.fn() } as never,
    new CredentialCryptoService({
      tokenEncryptionKey: 'test-encryption-key-for-testing-only',
    } as unknown as ConfigService),
    { uploadToS3: vi.fn() } as never,
    new ProviderAccountPurgeService(
      prisma as never,
      accessBootstrapCache as never,
    ),
    { emit: vi.fn() } as unknown as EventEmitter2,
    accessBootstrapCache as never,
  );
}

/** What a verify endpoint does after it owns the pending connection. */
async function exchangeAndConnect(
  sim: Simulation,
  world: World,
): Promise<void> {
  await sim.step('provider exchanges the code');
  world.exchanges += 1;
  await sim.step('postgres UPDATE connect the credential');
  Object.assign(world.row, {
    isConnected: true,
    oauthState: null,
    updatedAt: new Date(),
  });
}

function settled(_world: World, kind: Outcome['kind']): Outcome {
  return { elapsedMs: Date.now() - START.getTime(), kind };
}

type Verify = (actor: string) => Promise<void>;

function oauthScenario(
  makeVerify: (sim: Simulation, world: World) => Verify,
  options: { rulesOutLostAnswers: boolean } = { rulesOutLostAnswers: false },
): () => Scenario {
  return () => {
    vi.clearAllTimers();
    vi.setSystemTime(START);
    const world: World = {
      exchanges: 0,
      lostWhileHeld: new Set(),
      outcomes: new Map(),
      row: pendingRow(),
    };
    return {
      final: () => {
        if (!options.rulesOutLostAnswers) return null;
        for (const [actor, outcome] of world.outcomes) {
          // A request that waited out its whole budget gave up on a provider
          // slower than the wait; that limit is stated, not a race.
          if (
            outcome.kind === 'invalid' &&
            outcome.elapsedMs < OAUTH_VERIFY_CLAIM_WAIT_MS &&
            world.lostWhileHeld.has(actor) &&
            world.row.isConnected
          ) {
            return `${actor} answered invalid state before its wait ended, although the request holding the claim connected the account`;
          }
        }
        return null;
      },
      invariant: () =>
        world.exchanges > 1 ? 'the code was exchanged twice' : null,
      // Timestamps differ in every run for no reason the claim can see.
      snapshot: () =>
        JSON.stringify([
          world.row.isConnected,
          world.row.oauthState === null
            ? null
            : world.row.oauthState.startsWith('claimed:'),
          world.exchanges,
          [...world.lostWhileHeld].sort(),
          [...world.outcomes.entries()]
            .map(([actor, o]) => [
              actor,
              o.kind,
              o.elapsedMs >= OAUTH_VERIFY_CLAIM_WAIT_MS,
            ])
            .sort(),
          Date.now() - START.getTime(),
        ]),
      start: (sim) => {
        sim.environment(
          'time passes',
          () => vi.getTimerCount() > 0,
          () => {
            vi.advanceTimersByTime(TIME_STEP_MS);
          },
        );
        const verify = makeVerify(sim, world);
        sim.spawn('verify 1', () => verify('verify 1'), { crashable: true });
        sim.spawn('verify 2', () => verify('verify 2'), { crashable: true });
      },
    };
  };
}

function realVerify(sim: Simulation, world: World): Verify {
  return async (actor) => {
    const service = serviceFor(sim, world, actor);
    const claim = await claimOAuthVerifyCredential(
      service,
      STATE,
      CredentialPlatform.TWITTER,
      { organizationId: ORG, userId: USER },
    );
    if (!claim) {
      world.outcomes.set(actor, settled(world, 'invalid'));
      return;
    }
    if (!claim.alreadyConnected) {
      await exchangeAndConnect(sim, world);
    }
    world.outcomes.set(actor, settled(world, 'connected'));
  };
}

/**
 * The verify endpoint before #10824 (8d0154947^): a plain lookup of the pending
 * row by its state, then the exchange, with the state cleared only when the
 * account connects.
 */
function verifyBefore10824(sim: Simulation, world: World): Verify {
  return async (actor) => {
    const prisma = credentialTable(sim, world, actor);
    const pending = await prisma.credential.findFirst({
      where: {
        isConnected: false,
        oauthState: STATE,
        organizationId: ORG,
        platform: 'TWITTER',
        updatedAt: { gte: new Date(START.getTime() - 600_000) },
        userId: USER,
      },
    });
    if (!pending) {
      world.outcomes.set(actor, settled(world, 'invalid'));
      return;
    }
    await exchangeAndConnect(sim, world);
    world.outcomes.set(actor, settled(world, 'connected'));
  };
}

describe('OAuth verify claim, every interleaving', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'] });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('exchanges the code at most once', async () => {
    const result = await explore(oauthScenario(realVerify));

    expect(result.violation).toBeNull();
    expect(result.schedules).toBeGreaterThan(100);
  });

  it('fails on the verify the endpoints ran before #10824', async () => {
    const result = await explore(oauthScenario(verifyBefore10824));

    expect(result.violation).toEqual({
      message: 'the code was exchanged twice',
      trace: [
        'verify 1: postgres SELECT credential',
        'verify 2: postgres SELECT credential',
        'verify 1: provider exchanges the code',
        'verify 2: provider exchanges the code',
      ],
    });
  });

  // Tracked in #10863: the winner clears the state when it connects, so a
  // loser whose marker lookup comes after that finds nothing. When the issue is
  // fixed this test fails; delete it and pass `rulesOutLostAnswers: true` in
  // the first test.
  it('still answers a lost claim with invalid state when the winner connected in between (#10863)', async () => {
    const result = await explore(
      oauthScenario(realVerify, { rulesOutLostAnswers: true }),
    );

    expect(result.violation).toEqual({
      message:
        'verify 2 answered invalid state before its wait ended, although the request holding the claim connected the account',
      trace: [
        'verify 1: postgres UPDATE credential',
        'verify 2: postgres UPDATE credential',
        'verify 1: postgres SELECT credential',
        'verify 1: provider exchanges the code',
        'verify 1: postgres UPDATE connect the credential',
        'verify 2: postgres SELECT credential',
      ],
    });
  });
});
