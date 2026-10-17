import type { AuthenticatedUser } from '@api/auth/interfaces/authenticated-user.interface';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { TenantReadPolicy } from '@api/helpers/interceptors/tenant-context/tenant-read-policy.decorator';
import { serializeSingle } from '@api/helpers/utils/response/response.util';
import { BrandedGenerationFeedbackService } from '@api/services/branded-generation-receipts/branded-generation-feedback.service';
import { brandedGenerationFeedbackInputV1Schema } from '@genfeedai/contracts/api-types/contracts/branded-generation-feedback.contract';
import { learningContractIdSchema } from '@genfeedai/contracts/api-types/contracts/content-learning-generation.contract';
import {
  BrandedGenerationFeedbackSerializer,
  BrandedGenerationFeedbackSummarySerializer,
} from '@genfeedai/serializers';
import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Header,
  HttpCode,
  Param,
  Put,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';

/**
 * Thumbs up/down and reason chips on a generation, keyed by its receipt id
 * (#5786). The summary answers whether branded output is rated better than
 * raw output without opening each receipt.
 */
@Controller('brands/:brandId')
@UseGuards(RolesGuard)
export class BrandedGenerationFeedbackController {
  constructor(private readonly feedback: BrandedGenerationFeedbackService) {}

  private id(value: string): string {
    const parsed = learningContractIdSchema.safeParse(value);
    if (!parsed.success) throw new BadRequestException('feedback_invalid');
    return parsed.data;
  }

  private actor(user: AuthenticatedUser, brandId: string) {
    if (!user?.organizationId || !(user.userId ?? user.id))
      throw new ForbiddenException('receipt_access_denied');
    return {
      actorId: this.id(user.userId ?? user.id),
      apiKeyId: user.apiKeyId,
      brandId: this.id(brandId),
      isApiKey: user.isApiKey,
      organizationId: this.id(user.organizationId),
      scopes: user.scopes,
    };
  }

  @TenantReadPolicy('owner')
  @Get('generation-feedback/summary')
  @Header('Cache-Control', 'private,no-store')
  @Header('Vary', 'Cookie,Authorization')
  async summary(
    @Req() request: Request,
    @CurrentUser() user: AuthenticatedUser,
    @Param('brandId') brandId: string,
  ) {
    return serializeSingle(
      request,
      BrandedGenerationFeedbackSummarySerializer,
      await this.feedback.summarize(this.actor(user, brandId)),
    );
  }

  @TenantReadPolicy('owner')
  @Get('generation-receipts/:receiptId/feedback')
  @Header('Cache-Control', 'private,no-store')
  @Header('Vary', 'Cookie,Authorization')
  async get(
    @Req() request: Request,
    @CurrentUser() user: AuthenticatedUser,
    @Param('brandId') brandId: string,
    @Param('receiptId') receiptId: string,
  ) {
    return serializeSingle(
      request,
      BrandedGenerationFeedbackSerializer,
      await this.feedback.get(this.actor(user, brandId), this.id(receiptId)),
    );
  }

  @Put('generation-receipts/:receiptId/feedback')
  @Header('Cache-Control', 'private,no-store')
  async rate(
    @Req() request: Request,
    @CurrentUser() user: AuthenticatedUser,
    @Param('brandId') brandId: string,
    @Param('receiptId') receiptId: string,
    @Body() body: unknown,
  ) {
    const input = brandedGenerationFeedbackInputV1Schema.safeParse(body);
    if (!input.success) throw new BadRequestException('feedback_invalid');
    return serializeSingle(
      request,
      BrandedGenerationFeedbackSerializer,
      await this.feedback.rate(
        this.actor(user, brandId),
        this.id(receiptId),
        input.data,
      ),
    );
  }

  @Delete('generation-receipts/:receiptId/feedback')
  @HttpCode(204)
  async withdraw(
    @CurrentUser() user: AuthenticatedUser,
    @Param('brandId') brandId: string,
    @Param('receiptId') receiptId: string,
  ): Promise<void> {
    await this.feedback.withdraw(this.actor(user, brandId), this.id(receiptId));
  }
}
