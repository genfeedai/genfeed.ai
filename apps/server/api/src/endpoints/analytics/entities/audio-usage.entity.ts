export class AudioUsageEntity {
  declare readonly totalVoice: number;
  declare readonly totalMusic: number;

  constructor(partial: Partial<AudioUsageEntity>) {
    Object.assign(this, partial);
  }
}
