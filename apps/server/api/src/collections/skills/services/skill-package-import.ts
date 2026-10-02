import { isReservedBuiltInSkillSlug } from '@api/collections/skills/constants/skill-validation.constant';
import type { SkillLibraryActor } from '@api/collections/skills/services/skill-library.types';
import { withSkillWriteSession } from '@api/collections/skills/services/skill-write-session';
import { parseSkillPackageManifest } from '@api/collections/skills/utils/skill-package-manifest.util';
import { ValidationException } from '@api/exceptions/validation.exception';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import type { Prisma } from '@genfeedai/prisma';
import { ConflictException, ForbiddenException } from '@nestjs/common';

export async function importValidatedSkillPackage(
  prisma: PrismaService,
  actor: SkillLibraryActor,
  input: unknown,
) {
  const parsed = parseSkillPackageManifest(input);
  if (isReservedBuiltInSkillSlug(parsed.slug)) {
    throw new ValidationException(
      'This slug is reserved for the built-in skill catalog',
      'slug',
      parsed.slug,
    );
  }
  const created = await withSkillWriteSession(
    prisma,
    { actorUserId: actor.userId, origin: 'authoring' },
    async (tx) => {
      const users = await tx.$queryRaw<{ id: string; isolation: string }[]>`
        SELECT "id", current_setting('transaction_isolation') AS isolation
        FROM "users" WHERE "id"=${actor.userId} AND "isDeleted"=false FOR UPDATE
      `;
      if (
        users.length !== 1 ||
        users[0]?.id !== actor.userId ||
        users[0].isolation !== 'read committed'
      ) {
        throw new ForbiddenException(
          'A live user and read committed transaction are required',
        );
      }
      const organization = await tx.organization.findFirst({
        where: { id: actor.organizationId, isDeleted: false },
        select: { id: true },
      });
      const member = await tx.member.findFirst({
        where: {
          userId: actor.userId,
          organizationId: actor.organizationId,
          isActive: true,
          isDeleted: false,
        },
        select: { id: true },
      });
      if (!organization || !member)
        throw new ForbiddenException(
          'Active organization membership is required',
        );
      // tenant-scope-ignore: personal import duplicates are scoped to canonical ownerUserId with null organization and brand, including across organizations
      const duplicates = await tx.$queryRaw<{ id: string }[]>`
        SELECT "id" FROM "skills" WHERE "ownerKind"='user'
        AND "ownerUserId"=${actor.userId} AND "organizationId" IS NULL
        AND "brandId" IS NULL AND "isDeleted"=false
        AND lower(config->>'slug')=${parsed.slug}
      `;
      if (duplicates.length)
        throw new ConflictException(
          'A personal skill with this slug already exists',
        );
      return tx.skill.create({
        data: {
          audience: 'private',
          brandId: null,
          organizationId: null,
          ownerKind: 'user',
          ownerUserId: actor.userId,
          isDeleted: false,
          isQuarantined: false,
          label: parsed.metadata.name,
          config: {
            slug: parsed.slug,
            name: parsed.metadata.name,
            description: parsed.metadata.description,
            category: 'content',
            channels: ['general'],
            modalities: ['text'],
            workflowStage: 'creation',
            source: 'imported',
            status: 'draft',
            isBuiltIn: false,
            isEnabled: true,
            requiredProviders: [],
            toolOverrides: [],
            defaultInstructions: parsed.instructions,
            systemPromptTemplate: parsed.instructions,
            files: parsed.files.map(({ content, path }) => ({
              content,
              path,
            })),
            checksum: parsed.packageChecksum,
            ...(parsed.metadata.version !== undefined
              ? { version: parsed.metadata.version }
              : {}),
            importProvenance: {
              format: 'genfeed.skill.ordinary-upload.v1',
              importedByUserId: actor.userId,
              packageChecksum: parsed.packageChecksum,
              ...(parsed.archiveSha256 !== undefined
                ? { archiveSha256: parsed.archiveSha256 }
                : {}),
              ...(parsed.sourceUrl !== undefined
                ? { sourceUrl: parsed.sourceUrl }
                : {}),
            },
          } satisfies Prisma.InputJsonObject,
        },
      });
    },
  );
  return created;
}
