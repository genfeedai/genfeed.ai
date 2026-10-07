import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { validateRuntimeConfig } from './config.mjs';
import { createWorkspaceImporter } from './imports.mjs';

const MIGRATED_USER = {
  id: 'genfeed-public-tools',
  handle: 'genfeed-public-tools',
  name: 'Genfeed Public Tools',
  email: null,
  emailVerified: true,
  platformRole: 'USER',
  isDeleted: false,
  isDefault: false,
  isInvited: false,
  banned: false,
  lastUsedOrganizationId: null,
  stripeCustomerId: null,
};
const MIGRATED_ORGANIZATION = {
  id: 'genfeed-public-tools',
  userId: 'genfeed-public-tools',
  label: 'Genfeed Public Tools',
  slug: 'genfeed-public-tools',
  isDeleted: false,
  isDefault: false,
  isSelected: false,
  billingAccountId: null,
};
const FORBIDDEN_AUTH_DELEGATES = [
  'account',
  'session',
  'member',
  'apiKey',
  'credential',
  'verification',
];
async function requireRead(label, read) {
  try {
    return await read();
  } catch {
    throw new Error(label);
  }
}
function requireExact(actual, expected, label) {
  if (
    !actual ||
    Object.keys(actual).sort().join(',') !==
      Object.keys(expected).sort().join(',') ||
    Object.entries(expected).some(([key, value]) => actual[key] !== value)
  )
    throw new Error(label);
}
export async function prepareFixture(prisma) {
  try {
    if (
      (await requireRead('Fixture user count unavailable', () =>
        prisma.user.count(),
      )) !== 1
    )
      throw new Error('Fixture migrated user count mismatch');
    const user = await requireRead('Fixture migrated user unavailable', () =>
      prisma.user.findUnique({
        where: { id: MIGRATED_USER.id },
        select: Object.fromEntries(
          Object.keys(MIGRATED_USER).map((key) => [key, true]),
        ),
      }),
    );
    requireExact(user, MIGRATED_USER, 'Fixture migrated user mismatch');
    if (
      (await requireRead('Fixture organization count unavailable', () =>
        prisma.organization.count(),
      )) !== 1
    )
      throw new Error('Fixture migrated organization count mismatch');
    const organization = await requireRead(
      'Fixture migrated organization unavailable',
      () =>
        prisma.organization.findUnique({
          where: { id: MIGRATED_ORGANIZATION.id },
          select: Object.fromEntries(
            Object.keys(MIGRATED_ORGANIZATION).map((key) => [key, true]),
          ),
        }),
    );
    requireExact(
      organization,
      MIGRATED_ORGANIZATION,
      'Fixture migrated organization mismatch',
    );
    for (const delegate of FORBIDDEN_AUTH_DELEGATES) {
      if (
        (await requireRead('Fixture authentication count unavailable', () =>
          prisma[delegate].count(),
        )) !== 0
      )
        throw new Error('Fixture authentication material present');
    }
    if (
      await requireRead('Fixture platform policy unavailable', () =>
        prisma.platformSetting.findUnique({ where: { key: 'platform' } }),
      )
    )
      throw new Error('Fixture platform policy already exists');
    await requireRead('Fixture platform policy create failed', () =>
      prisma.platformSetting.create({
        data: { key: 'platform', isEmailVerificationRequired: true },
      }),
    );
    const policy = await requireRead(
      'Fixture policy readback unavailable',
      () => prisma.platformSetting.findUnique({ where: { key: 'platform' } }),
    );
    if (policy?.isEmailVerificationRequired !== true)
      throw new Error('Fixture policy readback failed');
    return { verificationRequired: true };
  } finally {
    await requireRead('Fixture disconnect failed', () => prisma.$disconnect());
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
