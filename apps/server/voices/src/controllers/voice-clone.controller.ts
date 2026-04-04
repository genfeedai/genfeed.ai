import { Body, Controller, Get, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { VoiceCloneUploadRequest } from '@voices/interfaces/voice-clone.interfaces';
import { VoiceCloneService } from '@voices/services/voice-clone.service';

@ApiTags('Voice Clones')
@Controller('clones')
export class VoiceCloneController {
  constructor(private readonly voiceCloneService: VoiceCloneService) {}

  @Post('upload')
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
