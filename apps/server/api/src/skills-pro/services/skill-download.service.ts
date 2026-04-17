import { ConfigService } from '@api/config/config.service';
import { HandleErrors } from '@api/helpers/decorators/error-handler.decorator';
import { FilesClientService } from '@api/services/files-microservice/client/files-client.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { SkillRegistryService } from '@api/skills-pro/services/skill-registry.service';
import { LoggerService } from '@libs/logger/logger.service';
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

type SkillReceiptData = {
  receiptId?: string;
  email?: string;
  status?: string;
  downloadCount?: number;
  lastDownloadedAt?: string;
};

@Injectable()
export class SkillDownloadService {
  private readonly constructorName: string = String(this.constructor.name);

  constructor(
    readonly _configService: ConfigService,
    private readonly loggerService: LoggerService,
    private readonly skillRegistryService: SkillRegistryService,
    private readonly filesClientService: FilesClientService,
    private readonly prisma: PrismaService,
  ) {}

  @HandleErrors('verify receipt', 'skills-pro')
  async verifyReceipt(receiptId: string): Promise<{
    valid: boolean;
    productType: string;
    skills: string[];
    email: string;
  }> {
    this.loggerService.log(`${this.constructorName} verifyReceipt`, {
      receiptId,
    });

    const receipts = await this.prisma.skillReceipt.findMany({
      where: { isDeleted: false },
    });

    const receipt = receipts.find((r) => {
      const data = r.data as SkillReceiptData;
      return data?.receiptId === receiptId && data?.status === 'completed';
    });

    if (!receipt) {
      return { email: '', productType: '', skills: [], valid: false };
    }

    const data = receipt.data as SkillReceiptData;
    const registry = await this.skillRegistryService.getRegistry();
    const allSlugs = registry.skills.map((s) => s.slug);

    return {
      email: data.email ?? '',
      productType: 'bundle',
      skills: allSlugs,
      valid: true,
    };
  }

  @HandleErrors('get download url', 'skills-pro')
  async getDownloadUrl(
    receiptId: string,
    skillSlug?: string,
  ): Promise<{
    downloadUrl: string;
    expiresIn: number;
    skill: { slug: string; name: string; version: string };
  }> {
    this.loggerService.log(`${this.constructorName} getDownloadUrl`, {
      receiptId,
      skillSlug,
    });

    const receipts = await this.prisma.skillReceipt.findMany({
      where: { isDeleted: false },
    });

    const receipt = receipts.find((r) => {
      const data = r.data as SkillReceiptData;
      return data?.receiptId === receiptId && data?.status === 'completed';
    });

    if (!receipt) {
      throw new NotFoundException('Receipt not found or not completed');
    }

    if (!skillSlug) {
      throw new BadRequestException('skillSlug is required');
    }

    const registry = await this.skillRegistryService.getRegistry();

    const skillEntry = this.skillRegistryService.getSkillBySlug(
      registry,
      skillSlug,
    );

    if (!skillEntry) {
      throw new NotFoundException(`Skill "${skillSlug}" not found in registry`);
    }

    // Generate presigned download URL via files microservice
    const downloadUrl = await this.filesClientService.getPresignedDownloadUrl(
      skillEntry.s3Key,
      'skills',
      900, // 15 minutes
    );

    // Increment download count
    const data = receipt.data as SkillReceiptData;
    await this.prisma.skillReceipt.update({
      data: {
        data: {
          ...data,
          downloadCount: (data.downloadCount ?? 0) + 1,
          lastDownloadedAt: new Date().toISOString(),
        },
      },
      where: { id: receipt.id },
    });

    this.loggerService.log(`${this.constructorName} download URL generated`, {
      receiptId,
      skillSlug,
    });

    return {
      downloadUrl,
      expiresIn: 900,
      skill: {
        name: skillEntry.name,
        slug: skillEntry.slug,
        version: skillEntry.version,
      },
    };
  }
}
