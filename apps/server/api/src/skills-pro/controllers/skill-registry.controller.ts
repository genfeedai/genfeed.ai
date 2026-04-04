import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { SkillRegistryService } from '@api/skills-pro/services/skill-registry.service';
import { Public } from '@libs/decorators/public.decorator';
import { Controller, Get } from '@nestjs/common';
import { ApiOperation } from '@nestjs/swagger';

@AutoSwagger('Skills Pro')
@Controller('skills-pro')
export class SkillRegistryController {
  constructor(private readonly skillRegistryService: SkillRegistryService) {}

  @Public()
  @Get('registry')
  @ApiOperation({ summary: 'Get the skill registry with available skills' })
  getRegistry() {
    return this.skillRegistryService.getRegistry();
  }
}
