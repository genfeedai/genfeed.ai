import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { StartBrandInterviewDto } from '@api/collections/brands/brand-interview/dto/start-brand-interview.dto';
import { SubmitBrandInterviewAnswerDto } from '@api/collections/brands/brand-interview/dto/submit-brand-interview-answer.dto';
import { BrandInterviewService } from '@api/collections/brands/brand-interview/services/brand-interview.service';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { getPublicMetadata } from '@api/helpers/utils/auth/auth.util';
import type {
  IActiveBrandInterview,
  IBrandInterviewAnswerResult,
  IBrandInterviewCompleteness,
  IBrandInterviewStartResult,
} from '@genfeedai/interfaces';
import type { BrandInterview } from '@genfeedai/prisma';
import { LoggerService } from '@libs/logger/logger.service';
import {
  Body,
  Controller,
  Get,
  HttpException,
  HttpStatus,
  Param,
  Post,
} from '@nestjs/common';

@AutoSwagger()
@Controller('brands')
export class BrandInterviewController {
  constructor(
    private readonly logger: LoggerService,
    private readonly brandInterviewService: BrandInterviewService,
  ) {}

  /**
   * Extract org context or throw 403.
   */
  private requireOrganizationId(user: User): string {
    const publicMetadata = getPublicMetadata(user);
    const orgId = publicMetadata.organization?.toString();

    if (!orgId) {
      throw new HttpException(
        {
          detail: 'Organization context is required',
          title: 'Forbidden',
        },
        HttpStatus.FORBIDDEN,
      );
    }

    return orgId;
  }

  /**
   * POST /brands/:brandId/interview
   * Start (or resume) a brand context interview.
   */
  @Post(':brandId/interview')
  async start(
    @Param('brandId') brandId: string,
    @CurrentUser() user: User,
    @Body() dto: StartBrandInterviewDto,
  ): Promise<IBrandInterviewStartResult> {
    const organizationId = this.requireOrganizationId(user);
    const publicMetadata = getPublicMetadata(user);
    const userId = publicMetadata.user?.toString() ?? '';

    return this.brandInterviewService.start(brandId, organizationId, userId);
  }

  /**
   * GET /brands/:brandId/interview/active
   * Return the active (in_progress) interview for a brand, or 404.
   */
  @Get(':brandId/interview/active')
  async getActiveForBrand(
    @Param('brandId') brandId: string,
    @CurrentUser() user: User,
  ): Promise<IActiveBrandInterview | null> {
    const organizationId = this.requireOrganizationId(user);
    return this.brandInterviewService.getActiveForBrand(
      brandId,
      organizationId,
    );
  }

  /**
   * GET /brands/:brandId/completeness
   * Return brand completeness scores (interviewable gaps only).
   */
  @Get(':brandId/completeness')
  async getCompleteness(
    @Param('brandId') brandId: string,
    @CurrentUser() user: User,
  ): Promise<IBrandInterviewCompleteness> {
    const organizationId = this.requireOrganizationId(user);
    return this.brandInterviewService.getCompleteness(brandId, organizationId);
  }

  /**
   * GET /brands/interview/:interviewId
   * Fetch a specific interview session.
   */
  @Get('interview/:interviewId')
  async getById(
    @Param('interviewId') interviewId: string,
    @CurrentUser() user: User,
  ): Promise<BrandInterview> {
    const organizationId = this.requireOrganizationId(user);
    return this.brandInterviewService.getById(interviewId, organizationId);
  }

  /**
   * POST /brands/interview/:interviewId/answer
   * Submit an answer to the current question.
   */
  @Post('interview/:interviewId/answer')
  async submitAnswer(
    @Param('interviewId') interviewId: string,
    @CurrentUser() user: User,
    @Body() dto: SubmitBrandInterviewAnswerDto,
  ): Promise<IBrandInterviewAnswerResult> {
    const organizationId = this.requireOrganizationId(user);
    const publicMetadata = getPublicMetadata(user);
    const userId = publicMetadata.user?.toString() ?? '';

    return this.brandInterviewService.submitAnswer(
      interviewId,
      organizationId,
      userId,
      dto.answer,
    );
  }

  /**
   * POST /brands/interview/:interviewId/skip
   * Skip the current question and advance.
   */
  @Post('interview/:interviewId/skip')
  async skipField(
    @Param('interviewId') interviewId: string,
    @CurrentUser() user: User,
  ): Promise<IBrandInterviewAnswerResult> {
    const organizationId = this.requireOrganizationId(user);
    return this.brandInterviewService.skipField(interviewId, organizationId);
  }

  /**
   * POST /brands/interview/:interviewId/abandon
   * Abandon an in-progress interview.
   */
  @Post('interview/:interviewId/abandon')
  async abandon(
    @Param('interviewId') interviewId: string,
    @CurrentUser() user: User,
  ): Promise<BrandInterview> {
    const organizationId = this.requireOrganizationId(user);
    return this.brandInterviewService.abandon(interviewId, organizationId);
  }
}
