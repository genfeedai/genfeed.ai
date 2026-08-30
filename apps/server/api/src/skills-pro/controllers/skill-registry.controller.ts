import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { serializeCollection } from '@api/helpers/utils/response/response.util';
import type {
  SkillsProRegistryResponse,
  SkillsProStorefrontCatalogDto,
} from '@api/skills-pro/contracts/skill-registry.contract';
import { SkillRegistryService } from '@api/skills-pro/services/skill-registry.service';
import { SkillsProRegistryEntrySerializer } from '@genfeedai/serializers';
import { Public } from '@libs/decorators/public.decorator';
import { Controller, Get, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import type { Request } from 'express';

@AutoSwagger('Skills Pro')
@Controller('skills-pro')
export class SkillRegistryController {
  constructor(private readonly skillRegistryService: SkillRegistryService) {}

  @Get('registry')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get authenticated Skills Pro registry metadata' })
  async getRegistry(
    @Req() request: Request,
  ): Promise<SkillsProRegistryResponse> {
    const registry = await this.skillRegistryService.getMetadataRegistry();
    const serialized = serializeCollection(
      request,
      SkillsProRegistryEntrySerializer,
      { docs: registry.skills },
    ) as unknown as SkillsProRegistryResponse;

    return {
      ...serialized,
      meta: {
        bundlePrice: registry.bundlePrice,
        updatedAt: registry.updatedAt,
      },
    };
  }

  @Public()
  @Get('storefront')
  @ApiOperation({ summary: 'Get public Skills Pro storefront metadata' })
  getStorefrontCatalog(): Promise<SkillsProStorefrontCatalogDto> {
    return this.skillRegistryService.getStorefrontCatalog();
  }
}
