import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { ModelProvider } from '@genfeedai/contracts';
import type { IFalModel } from '@workers/interfaces/model-discovery.interface';
import {
  collectFalImportMetadata,
  collectProviderModel,
  type ProviderModelImportObservation,
  providerModelImportTargets,
} from '@workers/maintenance/provider-model-import';
import { parseProviderModelImportArgs } from '@workers/maintenance/provider-model-import.args';
import {
  assertImportDatabaseTarget,
  persistProviderModel,
} from '@workers/maintenance/provider-model-import.persistence';

async function main(): Promise<void> {
  const args = parseProviderModelImportArgs(process.argv.slice(2));
  const targets = providerModelImportTargets().filter(
    (target) =>
      (!args.provider || target.provider === args.provider) &&
      (!args.endpoints.length || args.endpoints.includes(target.endpoint)),
  );
  if (
    !targets.length ||
    args.endpoints.some(
      (endpoint) => !targets.some((target) => target.endpoint === endpoint),
    )
  )
    throw new Error('unknown_import_target');
  const connectionString = args.live
    ? assertImportDatabaseTarget(process.env.DATABASE_URL, args.databaseTarget)
    : undefined;
  const credentials = {
    fal: process.env.FAL_API_KEY ?? process.env.FAL_KEY,
    replicate: process.env.REPLICATE_KEY,
  };
  const observations: ProviderModelImportObservation[] = [];
  const failures: { endpoint: string; provider: string; reason: string }[] = [];
  let falMetadata = new Map<string, IFalModel>();
  let falFailure: string | undefined;
  try {
    falMetadata = await collectFalImportMetadata(targets, credentials.fal);
  } catch {
    falFailure = 'fal_metadata_collection_failed';
  }
  for (const target of targets) {
    try {
      if (
        target.provider === ModelProvider.FAL &&
        !falMetadata.has(target.endpoint)
      )
        throw new Error(falFailure ?? 'missing_fal_endpoint');
      const observation = await collectProviderModel(
        target,
        credentials,
        fetch,
        new Date(),
        falMetadata.get(target.endpoint),
      );
      observations.push(observation);
      console.log(
        `${target.provider} ${target.endpoint}: ${observation.contract.mappingStatus} (${observation.contract.unsupportedReason ?? 'ready_for_review'})`,
      );
    } catch (error: unknown) {
      // Never serialize arbitrary exceptions, fetch URLs, provider responses or environment values.
      const reason =
        error instanceof Error && /^[a-z0-9_]+$/.test(error.message)
          ? error.message
          : 'provider_collection_failed';
      failures.push({ ...target, reason });
      console.log(`${target.provider} ${target.endpoint}: ${reason}`);
    }
  }
  const imported: { created: boolean; modelId: string; version: string }[] = [];
  // Save the source evidence before any database write, including failures and unmapped prices.
  const report = {
    collectedAt: new Date().toISOString(),
    databaseTarget: args.databaseTarget ?? null,
    failures,
    imported,
    live: args.live,
    observations,
    requested: targets.length,
  };
  const output = resolve(args.output);
  await mkdir(dirname(output), { recursive: true });
  const save = () =>
    writeFile(
      output,
      `${JSON.stringify(report, (_key, value: unknown) => (typeof value === 'bigint' ? value.toString() : value), 2)}\n`,
      { mode: 0o600 },
    );
  await save();
  if (connectionString) {
    const { PrismaClient } = await import('@genfeedai/prisma');
    const { PrismaPg } = await import('@prisma/adapter-pg');
    const prisma = new PrismaClient({
      adapter: new PrismaPg({ connectionString }),
    });
    try {
      for (const observation of observations) {
        try {
          imported.push(await persistProviderModel(prisma, observation));
        } catch {
          failures.push({
            endpoint: observation.endpoint,
            provider: observation.provider,
            reason: 'registry_import_failed',
          });
        }
        await save();
      }
    } finally {
      await prisma.$disconnect();
    }
  }
  console.log(
    `Requested ${targets.length}; collected ${observations.length}; quarantined ${observations.filter((item) => item.contract.mappingStatus === 'quarantined').length}; failed ${failures.length}; imported ${imported.length}. Report: ${output}`,
  );
  if (failures.length) process.exitCode = 1;
}

void main().catch(() => {
  console.error(
    'Provider model import failed; inspect the saved report and configuration. Credentials and provider exception payloads were not logged.',
  );
  process.exitCode = 1;
});
