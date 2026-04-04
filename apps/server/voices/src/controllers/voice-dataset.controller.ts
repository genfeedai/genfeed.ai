import { Body, Controller, Delete, Get, Param, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { VoiceDatasetSyncRequest } from '@voices/interfaces/voice-dataset.interfaces';
import { VoiceDatasetService } from '@voices/services/voice-dataset.service';

@ApiTags('Voice Datasets')
@Controller('datasets')
export class VoiceDatasetController {
  constructor(private readonly voiceDatasetService: VoiceDatasetService) {}

  @Post(':voiceId/sync')
  @ApiOperation({ summary: 'Sync voice samples from S3 to local storage' })
  syncDataset(
    @Param('voiceId') voiceId: string,
    @Body() body: VoiceDatasetSyncRequest,
  ) {
    return this.voiceDatasetService.syncFromS3(voiceId, body);
  }

  @Get(':voiceId')
  @ApiOperation({ summary: 'Get voice dataset info and sample list' })
  getDatasetInfo(@Param('voiceId') voiceId: string) {
    return this.voiceDatasetService.getDatasetInfo(voiceId);
  }

  @Delete(':voiceId')
  @ApiOperation({ summary: 'Delete a local voice dataset' })
  deleteDataset(@Param('voiceId') voiceId: string) {
    return this.voiceDatasetService.deleteDataset(voiceId);
  }
}
