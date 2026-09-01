import { ActivitySource } from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';
import type { AuthenticatedUser as User } from '@server/auth/interfaces/authenticated-user.interface';
import { CreditsUtilsService } from '@server/collections/credits/services/credits.utils.service';
import { ModelsService } from '@server/collections/models/services/models.service';

@Injectable()
export class MusicGenerationCreditsService {
  constructor(
    private readonly creditsUtilsService: CreditsUtilsService,
    private readonly loggerService: LoggerService,
    private readonly modelsService: ModelsService,
  ) {}

  async settle(
    user: User,
    model: string,
    outputs: number,
    generationId: string,
  ): Promise<void> {
    const modelData = await this.modelsService.findOne({ key: model });
    let credits = modelData?.cost || 0;
    if (credits > 0 && outputs > 1) {
      credits *= outputs;
    }
    if (credits <= 0) {
      return;
    }
    await this.creditsUtilsService.deductCreditsFromOrganization(
      user.organizationId,
      user.userId ?? user.id,
      credits,
      `Music generation - ${model}${outputs > 1 ? ` (${outputs} outputs)` : ''}`,
      ActivitySource.MUSIC_GENERATION,
    );
    this.loggerService.log('Credits deducted after music generation', {
      credits,
      generationId,
      model,
      organizationId: user.organizationId,
      outputs,
      userId: user.userId ?? user.id,
    });
  }
}
