import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { CreatorEarningsService } from '@api/collections/creator-payments/services/creator-earnings.service';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { BrandScopeQueryDto } from '@api/helpers/dto/brand-scope-query.dto';
import { extractRequestContext } from '@api/helpers/utils/auth/auth.util';
import type { ICreatorEarnings } from '@genfeedai/contracts/interfaces/billing';
import { Controller, Get, Query } from '@nestjs/common';

@AutoSwagger()
@Controller('creator-payments/earnings')
export class CreatorEarningsController {
  constructor(
    private readonly creatorEarningsService: CreatorEarningsService,
  ) {}

  /** What the organization earned from readers, and what it paid creators. */
  @Get()
  async getEarnings(
    @CurrentUser() user: User,
    @Query() query: BrandScopeQueryDto,
  ): Promise<ICreatorEarnings> {
    const { organizationId } = extractRequestContext(user, query);
    return this.creatorEarningsService.getEarnings(organizationId);
  }
}
