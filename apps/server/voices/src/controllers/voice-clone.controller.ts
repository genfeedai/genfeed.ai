import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { InternalApiKeyGuard } from '@voices/guards/internal-api-key.guard';
import type { VoiceCloneUploadRequest } from '@voices/interfaces/voice-clone.interfaces';
import { VoiceCloneService } from '@voices/services/voice-clone.service';

@ApiTags('Voice Clones')
@Controller('clones')
@UseGuards(InternalApiKeyGuard)
export class VoiceCloneController {
  constructor(private readonly voiceCloneService: VoiceCloneService) {}

  @Post()
  @ApiOperation({ summary: 'Upload a trained voice clone model to S3' })
  uploadClone(@Body() body: VoiceCloneUploadRequest) {
    return this.voiceCloneService.uploadClone(body);
  }

  @Get()
  @ApiOperation({ summary: 'List available voice clones (local + S3)' })
  listClones() {
    return this.voiceCloneService.listClones();
  }
}
