import { InternalApiKeyGuard } from '@images/guards/internal-api-key.guard';
import { ComfyUIService } from '@images/services/comfyui.service';
import { Controller, Get, Post, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

@ApiTags('ComfyUI')
@Controller('comfyui')
@UseGuards(InternalApiKeyGuard)
export class ComfyUIController {
  constructor(private readonly comfyuiService: ComfyUIService) {}

  @Get('status')
  @ApiOperation({ summary: 'Check ComfyUI container health' })
  getStatus() {
    return this.comfyuiService.getStatus();
  }

  @Post('restart')
  @ApiOperation({ summary: 'Restart ComfyUI container' })
  restart() {
    return this.comfyuiService.restart();
  }
}
