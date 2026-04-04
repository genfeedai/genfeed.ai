import type { LoraUploadRequest } from '@images/interfaces/lora.interfaces';
import { LoraService } from '@images/services/lora.service';
import { Body, Controller, Get, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

@ApiTags('LoRAs')
@Controller('loras')
export class LoraController {
  constructor(private readonly loraService: LoraService) {}

  @Post('upload')
  @ApiOperation({ summary: 'Upload a trained LoRA to S3' })
  uploadLora(@Body() body: LoraUploadRequest) {
    return this.loraService.uploadLora(body);
  }

  @Get()
  @ApiOperation({ summary: 'List available LoRAs (local + S3)' })
  listLoras() {
    return this.loraService.listLoras();
  }
}
