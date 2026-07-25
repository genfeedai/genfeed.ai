import { Controller, Get, Post, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { InternalApiKeyGuard } from '@videos/guards/internal-api-key.guard';
import { ComfyUIService } from '@videos/services/comfyui.service';

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
