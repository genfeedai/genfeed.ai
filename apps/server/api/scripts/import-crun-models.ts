import { readFileSync } from 'node:fs';
import { CrunContractImportService } from '@api/services/integrations/crun/contracts/crun-contract-import.service';
import { CRUN_IMAGE_MANIFEST } from '@api/services/integrations/crun/contracts/crun-manifest';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { ConfigService } from '@libs/config/config.service';

/** Bounded, dry-run by default. --fixture <JSON endpoint map> avoids network I/O. */
async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const isApply = args.includes('--apply');
  const fixtureIndex = args.indexOf('--fixture');
  const fixture: Record<string, unknown> | null =
    fixtureIndex === -1
      ? null
      : JSON.parse(readFileSync(args[fixtureIndex + 1], 'utf8'));
  const prisma = new PrismaService(new ConfigService());
  const importer = new CrunContractImportService(prisma);
  try {
    for (const entry of CRUN_IMAGE_MANIFEST) {
      const raw = fixture ? fixture[entry.endpoint] : entry.openapi;
      if (!raw) throw new Error('CRUN_IMPORT_FIXTURE_ENDPOINT_MISSING');
      const result = await importer.importModel(entry, raw, isApply);
      process.stdout.write(
        `${JSON.stringify({ endpoint: entry.endpoint, isApply, mappingStatus: result.mappingStatus, unsupportedReason: result.unsupportedReason, version: result.version })}\n`,
      );
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch(() => {
  process.stderr.write(
    'Crun import failed; no credentials or provider payloads are logged.\n',
  );
  process.exitCode = 1;
});
