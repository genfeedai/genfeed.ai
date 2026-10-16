import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { findBrandToRelocate } from '@api/collections/brands/controllers/brand-access.helpers';
import { toRelocationActor } from '@api/collections/brands/controllers/brand-relocation.helpers';
import { decorateBrandResponse } from '@api/collections/brands/controllers/brand-response.helpers';
import { BrandFleetAccess } from '@api/collections/brands/decorators/brand-fleet-access.decorator';
import { BrandRelocationJobsService } from '@api/collections/brands/services/brand-relocation-jobs.service';
import { BrandsService } from '@api/collections/brands/services/brands.service';
import { CredentialsService } from '@api/collections/credentials/services/credentials.service';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { serializeSingle } from '@api/helpers/utils/response/response.util';
import { BrandRelocationStatus } from '@genfeedai/contracts';
import type { JsonApiSingleResponse } from '@genfeedai/contracts/interfaces';
import {
  BrandRelocationSerializer,
  BrandSerializer,
} from '@genfeedai/serializers';
import { LoggerService } from '@libs/logger/logger.service';
import { Controller, Get, Param, Req } from '@nestjs/common';
import type { Request } from 'express';

@AutoSwagger()
@Controller('brands')
@BrandFleetAccess()
export class BrandRelocationsController {
  constructor(
    private readonly relocationJobs: BrandRelocationJobsService,
    private readonly brandsService: BrandsService,
    private readonly credentialsService: CredentialsService,
    private readonly loggerService: LoggerService,
  ) {}

  @Get(':id/relocations/:operationId')
  async getRelocation(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Param('operationId') operationId: string,
  ): Promise<JsonApiSingleResponse> {
    const operation = await this.relocationJobs.get(
      id,
      operationId,
      toRelocationActor(user, request),
    );
    const result = serializeSingle(
      request,
      BrandRelocationSerializer,
      operation,
    );
    if (operation.status !== BrandRelocationStatus.DONE) return result;
    const brand = await findBrandToRelocate(this.brandsService, id);
    if (!brand || brand.organizationId !== operation.destinationOrganizationId)
      return result;
    // Status is authoritative even if response decoration or refresh is unavailable.
    try {
      return {
        ...result,
        meta: {
          brand: serializeSingle(
            request,
            BrandSerializer,
            await decorateBrandResponse(
              brand,
              this.brandsService,
              this.credentialsService,
            ),
          ),
        },
      };
    } catch (error) {
      this.loggerService.warn(
        'Committed brand move response refresh unavailable',
        { operationId, error },
      );
      return result;
    }
  }
}
