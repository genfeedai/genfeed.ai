import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { TTSInferenceService } from '@voices/services/tts-inference.service';

/**
 * Voices-specific health route for the TTS inference container.
 *
 * The base `/health*` routes are served by the shared `@libs/health`
 * controller; this controller owns only `GET /health/tts`, which probes the
 * separate TTS inference process. Kept distinctly named to avoid colliding with
 * the shared `HealthController` registered in the same module.
 */
@ApiTags('Health')
@Controller('health')
export class TtsHealthController {
  constructor(private readonly ttsInferenceService: TTSInferenceService) {}

  @Get('tts')
  @ApiOperation({ summary: 'TTS inference container health' })
  async ttsHealth() {
    const status = await this.ttsInferenceService.getStatus();

    return {
      service: 'tts-inference',
      ...status,
      timestamp: new Date().toISOString(),
    };
  }
}
