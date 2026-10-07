import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { validateRuntimeConfig } from './config.mjs';
import { createWorkspaceImporter } from './imports.mjs';

export async function prepareFixture(prisma) {
  try {
    if ((await prisma.user.count()) !== 0)
      throw new Error('Fixture database is not empty');
    if (await prisma.platformSetting.findUnique({ where: { key: 'platform' } }))
      throw new Error('Fixture platform policy already exists');
    await prisma.platformSetting.create({
      data: { key: 'platform', isEmailVerificationRequired: true },
    });
    const policy = await prisma.platformSetting.findUnique({
      where: { key: 'platform' },
    });
    if (policy?.isEmailVerificationRequired !== true)
      throw new Error('Fixture policy readback failed');
    return { verificationRequired: true };
  } finally {
    await prisma.$disconnect();
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const runtime = validateRuntimeConfig(process.env);
  const requireFromApi = createRequire(
    new URL('../../../apps/server/api/package.json', import.meta.url),
  );
  const importer = createWorkspaceImporter({
    mode: runtime.mode,
    resolveSpecifier: (specifier) => requireFromApi.resolve(specifier),
    parentURL: import.meta.url,
  });
  const { prisma } = await importer('@genfeedai/prisma/client');
  await prepareFixture(prisma);
  process.stdout.write('Fixture verification policy prepared\n');
}
