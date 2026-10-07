import type { AuthenticatedUser } from '@api/auth/interfaces/authenticated-user.interface';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { TenantReadPolicy } from '@api/helpers/interceptors/tenant-context/tenant-read-policy.decorator';
import { resolveTenantReadScope } from '@api/helpers/interceptors/tenant-context/tenant-read-scope.context';
import { GenerationHarnessSettingsService } from '@api/services/harness/generation-harness-settings.service';
import type { UpdateGenerationHarnessSettings } from '@genfeedai/contracts/interfaces';
import { Body, Controller, Get, Patch, Query } from '@nestjs/common';
import {
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  ValidateIf,
} from 'class-validator';

export class UpdateGenerationHarnessSettingsDto
  implements UpdateGenerationHarnessSettings
{
  @IsIn(['organization', 'brand'])
  scope!: 'organization' | 'brand';

  @IsOptional()
  @IsString()
  brandId?: string;

  @ValidateIf((_object, value: unknown) => value !== null)
  @IsBoolean()
  isEnabled!: boolean | null;
}

@Controller('generation-harness')
export class GenerationHarnessController {
  constructor(private readonly settings: GenerationHarnessSettingsService) {}

  @TenantReadPolicy('selected')
  @Get('settings')
  get(
    @CurrentUser() user: AuthenticatedUser,
    @Query('brandId') brandId?: string,
  ) {
    return this.settings.get(
      resolveTenantReadScope(user).organizationId,
      brandId,
    );
  }

  @Patch('settings')
  set(
    @CurrentUser() user: AuthenticatedUser,
    @Body() input: UpdateGenerationHarnessSettingsDto,
  ) {
    return this.settings.set(user.organizationId, input);
  }
}
