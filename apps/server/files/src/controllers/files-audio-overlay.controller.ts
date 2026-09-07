import {
  type AudioOverlayRequest,
  AudioOverlayService,
} from '@files/services/audio-overlay/audio-overlay.service';
import {
  type SpeechAssemblyRequest,
  SpeechAssemblyService,
} from '@files/services/audio-overlay/speech-assembly.service';
import { Body, Controller, Post } from '@nestjs/common';

@Controller('files')
export class FilesAudioOverlayController {
  constructor(
    private readonly audioOverlayService: AudioOverlayService,
    private readonly speechAssemblyService: SpeechAssemblyService,
  ) {}

  @Post('processing/speech-assembly')
  async assembleSpeech(@Body() body: SpeechAssemblyRequest) {
    return this.speechAssemblyService.assemble(body);
  }

  @Post('processing/audio-overlay')
  async audioOverlay(@Body() body: AudioOverlayRequest) {
    return this.audioOverlayService.processAudioOverlay(body);
  }
}
