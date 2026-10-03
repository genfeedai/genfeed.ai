import type { AuthenticatedUser } from '@api/auth/interfaces/authenticated-user.interface';
import {
  BrandedGenerationPromptInspectionQueryDto,
  BrandedGenerationReceiptEmptyQueryDto,
  BrandedGenerationReceiptHistoryQueryDto,
  BrandedGenerationReceiptListQueryDto,
  BrandIdentityPreviewQueryDto,
} from '@api/collections/branded-generation-receipts/dto/branded-generation-receipt-query.dto';
import { NotFoundException } from '@api/exceptions/not-found.exception';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import {
  serializeCollection,
  serializeSingle,
} from '@api/helpers/utils/response/response.util';
import { BrandIdentitySnapshotService } from '@api/services/branded-generation-receipts/brand-identity-snapshot.service';
import { BrandedGenerationReceiptsService } from '@api/services/branded-generation-receipts/branded-generation-receipts.service';
import { learningContractIdSchema } from '@genfeedai/contracts/api-types/contracts/content-learning-generation.contract';
import {
  BrandedGenerationPromptInspectionSerializer,
  BrandedGenerationReceiptRevisionSerializer,
  BrandedGenerationReceiptSerializer,
  BrandIdentityPreviewSerializer,
} from '@genfeedai/serializers';
import {
  BadRequestException,
  Controller,
  ForbiddenException,
  Get,
  Header,
  Param,
  Query,
  Req,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import type { Request } from 'express';
@Controller('brands/:brandId/generation-receipts')
@UseGuards(RolesGuard)
@UsePipes(
  new ValidationPipe({
    transform: true,
    whitelist: true,
    forbidNonWhitelisted: true,
    exceptionFactory: () => new BadRequestException('receipt_query_invalid'),
  }),
)
export class BrandedGenerationReceiptsController {
  constructor(
    private readonly receipts: BrandedGenerationReceiptsService,
    private readonly identities: BrandIdentitySnapshotService,
  ) {}
  private id(value: string): string {
    const parsed = learningContractIdSchema.safeParse(value);
    if (!parsed.success) throw new BadRequestException('receipt_query_invalid');
    return parsed.data;
  }
  private actor(user: AuthenticatedUser, brandId: string) {
    if (!user?.organizationId || !(user.userId ?? user.id))
      throw new ForbiddenException('receipt_access_denied');
    return {
      organizationId: this.id(user.organizationId),
      actorId: this.id(user.userId ?? user.id),
      brandId: this.id(brandId),
    };
  }
  private revision(value: string): number {
    if (
      typeof value !== 'string' ||
      value.length > 10 ||
      !/^(0|[1-9][0-9]{0,9})$/.test(value) ||
      Number(value) > 2147483647
    )
      throw new BadRequestException('receipt_query_invalid');
    return Number(value);
  }
  @Get()
  @Header('Cache-Control', 'private,no-store')
  @Header('Vary', 'Cookie,Authorization')
  async list(
    @Req() request: Request,
    @CurrentUser() user: AuthenticatedUser,
    @Param('brandId') brandId: string,
    @Query() query: BrandedGenerationReceiptListQueryDto,
  ) {
    const page = await this.receipts.list(this.actor(user, brandId), query);
    return serializeCollection(request, BrandedGenerationReceiptSerializer, {
      docs: page.items,
      limit: query.limit,
      hasMore: page.nextCursor !== null,
      nextCursor: page.nextCursor,
    });
  }
  @Get('identity-preview')
  @Header('Cache-Control', 'private,no-store')
  @Header('Vary', 'Cookie,Authorization')
  async identityPreview(
    @Req() request: Request,
    @CurrentUser() user: AuthenticatedUser,
    @Param('brandId') brandId: string,
    @Query() query: BrandIdentityPreviewQueryDto,
  ) {
    const snapshot = await this.identities.preview(
      this.actor(user, brandId),
      query.receiptId === undefined ? undefined : this.id(query.receiptId),
    );
    return serializeSingle(request, BrandIdentityPreviewSerializer, {
      id: snapshot.contentHash,
      snapshot,
      source:
        query.receiptId === undefined
          ? 'current_approved_revision'
          : 'receipt_snapshot',
    });
  }
  @Get(':receiptId')
  @Header('Cache-Control', 'private,no-store')
  @Header('Vary', 'Cookie,Authorization')
  async get(
    @Req() request: Request,
    @CurrentUser() user: AuthenticatedUser,
    @Param('brandId') brandId: string,
    @Param('receiptId') receiptId: string,
    @Query() _query: BrandedGenerationReceiptEmptyQueryDto,
  ) {
    return serializeSingle(
      request,
      BrandedGenerationReceiptSerializer,
      await this.receipts.get(this.actor(user, brandId), this.id(receiptId)),
    );
  }
  @Get(':receiptId/history')
  @Header('Cache-Control', 'private,no-store')
  @Header('Vary', 'Cookie,Authorization')
  async history(
    @Req() request: Request,
    @CurrentUser() user: AuthenticatedUser,
    @Param('brandId') brandId: string,
    @Param('receiptId') receiptId: string,
    @Query() query: BrandedGenerationReceiptHistoryQueryDto,
  ) {
    const page = await this.receipts.history(
      this.actor(user, brandId),
      this.id(receiptId),
      query,
    );
    return serializeCollection(
      request,
      BrandedGenerationReceiptRevisionSerializer,
      {
        docs: page.items,
        limit: query.limit,
        hasMore: page.nextAfterRevision !== null,
        nextCursor:
          page.nextAfterRevision === null
            ? null
            : String(page.nextAfterRevision),
      },
    );
  }
  @Get(':receiptId/revisions/:revision')
  @Header('Cache-Control', 'private,no-store')
  @Header('Vary', 'Cookie,Authorization')
  async getRevision(
    @Req() request: Request,
    @CurrentUser() user: AuthenticatedUser,
    @Param('brandId') brandId: string,
    @Param('receiptId') receiptId: string,
    @Param('revision') revision: string,
    @Query() _query: BrandedGenerationReceiptEmptyQueryDto,
  ) {
    const number = this.revision(revision);
    const page = await this.receipts.history(
      this.actor(user, brandId),
      this.id(receiptId),
      { limit: 1, ...(number > 0 ? { afterRevision: number - 1 } : {}) },
    );
    if (page.items[0]?.revision !== number)
      throw new NotFoundException({ message: 'receipt_not_found' });
    return serializeSingle(
      request,
      BrandedGenerationReceiptRevisionSerializer,
      page.items[0],
    );
  }
  @Get(':receiptId/prompts/:stage')
  @Header('Cache-Control', 'private,no-store')
  @Header('Vary', 'Cookie,Authorization')
  async readPrompt(
    @Req() request: Request,
    @CurrentUser() user: AuthenticatedUser,
    @Param('brandId') brandId: string,
    @Param('receiptId') receiptId: string,
    @Param('stage') stage: string,
    @Query() query: BrandedGenerationPromptInspectionQueryDto,
  ) {
    if (stage !== 'original' && stage !== 'enhanced' && stage !== 'compiled')
      throw new BadRequestException('receipt_query_invalid');
    const id = this.id(receiptId);
    const result = await this.receipts.readPrompt(
      this.actor(user, brandId),
      id,
      stage,
      query.revision,
    );
    return serializeSingle(
      request,
      BrandedGenerationPromptInspectionSerializer,
      { receiptId: id, receiptRevision: query.revision, stage, result },
    );
  }
}
