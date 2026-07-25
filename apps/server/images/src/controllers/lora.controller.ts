import { InternalApiKeyGuard } from '@images/guards/internal-api-key.guard';
import type { LoraUploadRequest } from '@images/interfaces/lora.interfaces';
import { LoraService } from '@images/services/lora.service';
import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

@ApiTags('LoRAs')
@Controller('loras')
@UseGuards(InternalApiKeyGuard)
export class LoraController {
  constructor(private readonly loraService: LoraService) {}

  @Post()
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
