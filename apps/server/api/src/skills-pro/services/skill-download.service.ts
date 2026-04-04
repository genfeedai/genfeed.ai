import { ConfigService } from '@api/config/config.service';
import { DB_CONNECTIONS } from '@api/constants/database.constants';
import { HandleErrors } from '@api/helpers/decorators/error-handler.decorator';
import { FilesClientService } from '@api/services/files-microservice/client/files-client.service';
import {
  SkillReceipt,
  type SkillReceiptDocument,
} from '@api/skills-pro/schemas/skill-receipt.schema';
import { SkillRegistryService } from '@api/skills-pro/services/skill-registry.service';
import { LoggerService } from '@libs/logger/logger.service';
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';

@Injectable()
export class SkillDownloadService {
  private readonly constructorName: string = String(this.constructor.name);

  constructor(
    readonly _configService: ConfigService,
    private readonly loggerService: LoggerService,
    private readonly skillRegistryService: SkillRegistryService,
    private readonly filesClientService: FilesClientService,
    @InjectModel(SkillReceipt.name, DB_CONNECTIONS.CLOUD)
    private readonly skillReceiptModel: Model<SkillReceiptDocument>,
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

    const receipt = await this.skillReceiptModel.findOne({
      isDeleted: false,
      receiptId,
      status: 'completed',
    });

    if (!receipt) {
      return { email: '', productType: '', skills: [], valid: false };
    }

    const registry = await this.skillRegistryService.getRegistry();
    const allSlugs = registry.skills.map((s) => s.slug);

    return {
      email: receipt.email,
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

    const receipt = await this.skillReceiptModel.findOne({
      isDeleted: false,
      receiptId,
      status: 'completed',
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
    await this.skillReceiptModel.updateOne(
      { _id: receipt._id },
      {
        $inc: { downloadCount: 1 },
        $set: { lastDownloadedAt: new Date() },
      },
    );

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
