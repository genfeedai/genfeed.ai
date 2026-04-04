import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { DownloadSkillDto } from '@api/skills-pro/dto/download-skill.dto';
import { VerifyReceiptDto } from '@api/skills-pro/dto/verify-receipt.dto';
import { SkillDownloadService } from '@api/skills-pro/services/skill-download.service';
import { Public } from '@libs/decorators/public.decorator';
import { Body, Controller, Post } from '@nestjs/common';
import { ApiOperation } from '@nestjs/swagger';

@AutoSwagger('Skills Pro')
@Controller('skills-pro')
export class SkillDownloadController {
  constructor(private readonly skillDownloadService: SkillDownloadService) {}

  @Public()
  @Post('verify')
  @ApiOperation({
    summary: 'Verify a skill receipt and return entitled skills',
  })
  verifyReceipt(@Body() dto: VerifyReceiptDto) {
    return this.skillDownloadService.verifyReceipt(dto.receiptId);
  }

  @Public()
  @Post('download')
  @ApiOperation({
    summary: 'Get a presigned download URL for a purchased skill',
  })
  downloadSkill(@Body() dto: DownloadSkillDto) {
    return this.skillDownloadService.getDownloadUrl(
      dto.receiptId,
      dto.skillSlug,
    );
  }
}
