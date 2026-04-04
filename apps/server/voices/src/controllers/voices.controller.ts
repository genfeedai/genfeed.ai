import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { VoiceProfilesService } from '@voices/services/voice-profiles.service';

@ApiTags('Voices')
@Controller('voices')
export class VoicesController {
  constructor(private readonly voiceProfilesService: VoiceProfilesService) {}

  @Post('clone')
  @ApiOperation({ summary: 'Clone voice from audio sample' })
  cloneVoice(
    @Body()
    body: { handle: string; audioUrl: string; label?: string },
  ) {
    return this.voiceProfilesService.cloneVoice(body);
  }

  @Get()
  @ApiOperation({ summary: 'List available voice profiles' })
  listVoices() {
    return this.voiceProfilesService.listVoices();
  }

  @Get(':handle')
  @ApiOperation({ summary: 'Get voice profile details' })
  getVoice(@Param('handle') handle: string) {
    return this.voiceProfilesService.getVoice(handle);
  }
}
