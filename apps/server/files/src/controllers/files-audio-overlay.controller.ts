import {
  type AudioOverlayRequest,
  AudioOverlayService,
} from '@files/services/audio-overlay/audio-overlay.service';
import { Body, Controller, Post } from '@nestjs/common';

@Controller('files')
export class FilesAudioOverlayController {
  constructor(private readonly audioOverlayService: AudioOverlayService) {}

  @Post('processing/audio-overlay')
  async audioOverlay(@Body() body: AudioOverlayRequest) {
    return this.audioOverlayService.processAudioOverlay(body);
  }
}
