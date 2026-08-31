import { createHash, timingSafeEqual } from 'node:crypto';
import { SkillRegistryService } from '@api/skills-pro/services/skill-registry.service';
import { parseSkillsProPack } from '@api/skills-pro/utils/skill-pack-archive.util';
import { ConfigService } from '@libs/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
import { ForbiddenException, Injectable } from '@nestjs/common';
import { inferFirstPartySkillTaxonomy } from '@server/collections/skills/catalog/first-party-skill-taxonomy';
import { SkillsService } from '@server/collections/skills/services/skills.service';
import { NotFoundException } from '@server/exceptions/not-found.exception';
import { HandleErrors } from '@server/helpers/decorators/error-handler.decorator';
import { FilesClientService } from '@server/services/files-microservice/client/files-client.service';
import { PrismaService } from '@server/shared/modules/prisma/prisma.service';

const DOWNLOAD_URL_TTL_SECONDS = 900;
const MAX_PACK_DOWNLOAD_BYTES = 1_000_000;

type SkillReceiptData = {
  email?: string;
  receiptId?: string;
};

interface EntitlementReceipt {
  data: unknown;
  expiresAt: Date | null;
  id: string;
  productType: string;
  skillSlugs: string[];
}

export interface SkillsProInstallationResult {
  id: string;
  name: string;
  slug: string;
  status: 'installed';
  version: string;
}

@Injectable()
export class SkillDownloadService {
  private readonly constructorName: string = String(this.constructor.name);

  constructor(
    readonly _configService: ConfigService,
    private readonly loggerService: LoggerService,
    private readonly skillRegistryService: SkillRegistryService,
    private readonly filesClientService: FilesClientService,
    private readonly prisma: PrismaService,
    private readonly skillsService: SkillsService,
  ) {}

  @HandleErrors('verify receipt', 'skills-pro')
  async verifyReceipt(
    organizationId: string,
    receiptId: string,
  ): Promise<{
    valid: boolean;
    productType: string;
    skills: string[];
    email: string;
  }> {
    this.loggerService.log(`${this.constructorName} verifyReceipt`, {
      organizationId,
    });

    const receipt = await this.findOrClaimCompletedReceipt(
      organizationId,
      receiptId,
    );

    if (!receipt) {
      return { email: '', productType: '', skills: [], valid: false };
    }

    const skills = await this.resolveEntitledSkillSlugs(receipt);
    const data = this.readReceiptData(receipt.data);

    return {
      email: data.email ?? '',
      productType: receipt.productType,
      skills,
      valid: true,
    };
  }

  @HandleErrors('get download url', 'skills-pro')
  async getDownloadUrl(
    organizationId: string,
    receiptId: string,
    skillSlug: string,
  ): Promise<{
    checksum: string;
    downloadUrl: string;
    expiresIn: number;
    skill: { slug: string; name: string; version: string };
  }> {
    const { receipt, skill } = await this.authorizeSkill(
      organizationId,
      receiptId,
      skillSlug,
    );
    const downloadUrl = await this.filesClientService.getPresignedDownloadUrl(
      skill.s3Key,
      'skills',
      DOWNLOAD_URL_TTL_SECONDS,
    );

    await this.recordDownload(organizationId, receipt.id);

    this.loggerService.log(`${this.constructorName} download URL generated`, {
      organizationId,
      skillSlug,
    });

    return {
      checksum: skill.checksum ?? '',
      downloadUrl,
      expiresIn: DOWNLOAD_URL_TTL_SECONDS,
      skill: {
        name: skill.name,
        slug: skill.slug,
        version: skill.version,
      },
    };
  }

  @HandleErrors('install skill pack', 'skills-pro')
  async installSkill(
    organizationId: string,
    receiptId: string,
    skillSlug: string,
  ): Promise<SkillsProInstallationResult> {
    const { receipt, skill } = await this.authorizeSkill(
      organizationId,
      receiptId,
      skillSlug,
    );
    const checksum = this.requireChecksum(skill.checksum);
    const downloadUrl = await this.filesClientService.getPresignedDownloadUrl(
      skill.s3Key,
      'skills',
      DOWNLOAD_URL_TTL_SECONDS,
    );
    const archive = await this.downloadPack(downloadUrl);

    this.assertChecksum(archive, checksum);

    const pack = parseSkillsProPack(archive);
    if (
      pack.metadata.name !== skill.slug ||
      pack.metadata.version !== skill.version
    ) {
      throw new ForbiddenException(
        'Skills Pro pack identity does not match the purchased catalogue entry',
      );
    }

    const taxonomy = inferFirstPartySkillTaxonomy(skill.slug, {
      tags: pack.metadata.tags,
    });
    const installed = await this.skillsService.installManagedSkillPackage(
      organizationId,
      {
        ...taxonomy,
        checksum,
        description: skill.description,
        files: pack.files,
        instructions: pack.instructions,
        name: skill.name,
        slug: skill.slug,
        version: skill.version,
      },
    );

    await this.recordDownload(organizationId, receipt.id);

    return {
      id: installed.id,
      name: installed.name ?? skill.name,
      slug: installed.slug ?? skill.slug,
      status: 'installed',
      version: installed.version ?? skill.version,
    };
  }

  private async authorizeSkill(
    organizationId: string,
    receiptId: string,
    skillSlug: string,
  ) {
    const receipt = await this.findOrClaimCompletedReceipt(
      organizationId,
      receiptId,
    );
    if (!receipt) {
      throw new NotFoundException({
        message: 'Receipt not found or not completed',
      });
    }

    const entitledSlugs = await this.resolveEntitledSkillSlugs(receipt);
    if (!entitledSlugs.includes(skillSlug)) {
      throw new ForbiddenException('Receipt does not entitle this skill');
    }

    const registry = await this.skillRegistryService.getRegistry();
    const skill = this.skillRegistryService.getSkillBySlug(registry, skillSlug);
    if (!skill) {
      throw new NotFoundException('Skill', skillSlug);
    }

    return { receipt, skill };
  }

  private async findOrClaimCompletedReceipt(
    organizationId: string,
    receiptId: string,
  ): Promise<EntitlementReceipt | null> {
    // tenant-scope-ignore: an opaque, globally unique receipt secret is looked
    // up once so an authenticated organization can atomically claim it.
    const candidate = await this.prisma.skillReceipt.findFirst({
      where: {
        isDeleted: false,
        OR: [
          { receiptId },
          { data: { equals: receiptId, path: ['receiptId'] } },
        ],
        status: 'completed',
      },
    });

    if (
      !candidate ||
      (candidate.expiresAt && candidate.expiresAt.getTime() < Date.now())
    ) {
      return null;
    }

    if (
      candidate.organizationId &&
      candidate.organizationId !== organizationId
    ) {
      return null;
    }

    if (!candidate.organizationId) {
      // sql-risk-audit: ignore bulk-write-tenant-review -- Atomically claims one globally unique, organization-less bearer receipt before any entitlement data is returned.
      const claimed = await this.prisma.skillReceipt.updateMany({
        data: { organizationId },
        where: {
          id: candidate.id,
          isDeleted: false,
          organizationId: null,
          status: 'completed',
        },
      });
      if (claimed.count !== 1) {
        return null;
      }
    }

    return this.prisma.skillReceipt.findFirst({
      where: {
        id: candidate.id,
        isDeleted: false,
        organizationId,
        status: 'completed',
      },
    });
  }

  private async resolveEntitledSkillSlugs(
    receipt: EntitlementReceipt,
  ): Promise<string[]> {
    if (receipt.skillSlugs.length > 0) {
      return receipt.skillSlugs;
    }

    if (receipt.productType !== 'bundle') {
      return [];
    }

    const registry = await this.skillRegistryService.getRegistry();
    return registry.skills.map((skill) => skill.slug);
  }

  private readReceiptData(value: unknown): SkillReceiptData {
    return value && typeof value === 'object' && !Array.isArray(value)
      ? (value as SkillReceiptData)
      : {};
  }

  private async recordDownload(
    organizationId: string,
    receiptId: string,
  ): Promise<void> {
    // sql-risk-audit: ignore bulk-write-tenant-review -- This is a single-row counter update constrained by both receipt id and authenticated organizationId.
    const updated = await this.prisma.skillReceipt.updateMany({
      data: {
        downloadCount: { increment: 1 },
        lastDownloadedAt: new Date(),
      },
      where: { id: receiptId, isDeleted: false, organizationId },
    });

    if (updated.count !== 1) {
      throw new ForbiddenException('Receipt ownership changed during download');
    }
  }

  private async downloadPack(downloadUrl: string): Promise<Buffer> {
    const response = await fetch(downloadUrl);
    if (!response.ok) {
      throw new Error(`Failed to download Skills Pro pack: ${response.status}`);
    }

    const contentLength = Number(response.headers.get('content-length'));
    if (contentLength > MAX_PACK_DOWNLOAD_BYTES) {
      throw new ForbiddenException('Skills Pro pack exceeds the allowed size');
    }

    const archive = Buffer.from(await response.arrayBuffer());
    if (archive.length > MAX_PACK_DOWNLOAD_BYTES) {
      throw new ForbiddenException('Skills Pro pack exceeds the allowed size');
    }

    return archive;
  }

  private requireChecksum(checksum: string | undefined): string {
    const normalized = checksum?.replace(/^sha256:/, '').toLowerCase();
    if (!normalized || !/^[a-f0-9]{64}$/.test(normalized)) {
      throw new ForbiddenException('Skills Pro pack checksum is unavailable');
    }
    return normalized;
  }

  private assertChecksum(archive: Buffer, expectedChecksum: string): void {
    const actual = Buffer.from(
      createHash('sha256').update(archive).digest('hex'),
    );
    const expected = Buffer.from(expectedChecksum);

    if (!timingSafeEqual(actual, expected)) {
      throw new ForbiddenException('Skills Pro pack integrity check failed');
    }
  }
}
