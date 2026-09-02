import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import {
  SaveAdDto,
  UnsaveSavedAdDto,
  UpdateSavedAdNoteDto,
} from '@api/collections/saved-ads/dto/saved-ad.dto';
import { SavedAdsService } from '@api/collections/saved-ads/services/saved-ads.service';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { getIsSuperAdmin } from '@api/helpers/utils/auth/auth.util';
import { CollectionFilterUtil } from '@api/helpers/utils/collection-filter/collection-filter.util';
import { serializeCollection } from '@api/helpers/utils/response/response.util';
import { SavedAdSerializer } from '@genfeedai/serializers';
import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  ParseArrayPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';

const MAX_PROVIDER_SAVE_BATCH_SIZE = 5;
const MAX_LOCAL_MUTATION_BATCH_SIZE = 50;

@AutoSwagger()
@Controller('saved-ads')
@UseGuards(RolesGuard)
export class SavedAdsController {
  constructor(private readonly savedAdsService: SavedAdsService) {}

  @Get()
  async list(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Query('brandId') requestedBrandId?: string,
  ) {
    const brandId = this.resolveBrand(user, requestedBrandId);
    const docs = await this.savedAdsService.list(user.organizationId, brandId);
    return serializeCollection(request, SavedAdSerializer, { docs });
  }

  @Post()
  async save(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Body(new ParseArrayPipe({ items: SaveAdDto }))
    inputs: SaveAdDto[],
  ) {
    this.assertBatchSize(inputs, MAX_PROVIDER_SAVE_BATCH_SIZE);
    const authorized = inputs.map((input) => ({
      ...input,
      brandId: this.resolveBrand(user, input.brandId),
    }));
    const docs = await this.savedAdsService.saveMany(
      user.organizationId,
      this.resolveUserId(user),
      authorized,
    );
    return serializeCollection(request, SavedAdSerializer, { docs });
  }

  @Patch()
  async updateNotes(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Body(new ParseArrayPipe({ items: UpdateSavedAdNoteDto }))
    inputs: UpdateSavedAdNoteDto[],
  ) {
    this.assertBatchSize(inputs, MAX_LOCAL_MUTATION_BATCH_SIZE);
    const authorized = inputs.map((input) => ({
      ...input,
      brandId: this.resolveBrand(user, input.brandId),
    }));
    const docs = await this.savedAdsService.updateNotes(
      user.organizationId,
      authorized,
    );
    return serializeCollection(request, SavedAdSerializer, { docs });
  }

  @Delete()
  async unsave(
    @CurrentUser() user: User,
    @Body(new ParseArrayPipe({ items: UnsaveSavedAdDto }))
    inputs: UnsaveSavedAdDto[],
  ) {
    this.assertBatchSize(inputs, MAX_LOCAL_MUTATION_BATCH_SIZE);
    const authorized = inputs.map((input) => ({
      ...input,
      brandId: this.resolveBrand(user, input.brandId),
    }));
    return {
      data: await this.savedAdsService.unsaveMany(
        user.organizationId,
        authorized,
      ),
    };
  }

  private resolveBrand(user: User, requestedBrandId?: string): string {
    const candidate = requestedBrandId ?? user.brandId;
    if (!candidate) throw new ForbiddenException('A brand is required');
    const authorized = CollectionFilterUtil.buildAuthorizedBrandFilter(
      candidate,
      user,
      getIsSuperAdmin(user),
    );
    if (typeof authorized !== 'string') {
      throw new ForbiddenException('A brand is required');
    }
    return authorized;
  }

  private assertBatchSize(inputs: unknown[], max: number): void {
    if (inputs.length === 0 || inputs.length > max) {
      throw new BadRequestException(
        `Saved ad mutation requires 1 to ${max} items`,
      );
    }
  }

  private resolveUserId(user: User): string {
    const userId = user.userId ?? user.id;
    if (!userId) throw new ForbiddenException('A user is required');
    return userId;
  }
}
