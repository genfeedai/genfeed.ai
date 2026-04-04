import { TranscriptSerializer } from '@genfeedai/client/serializers';
import { Transcript } from '@models/content/transcript.model';
import { BaseService } from '@services/core/base.service';

export class TranscriptsService extends BaseService<Transcript> {
  constructor(token: string) {
    super('/transcripts', token, Transcript, TranscriptSerializer);
  }

  public static getInstance(token: string): TranscriptsService {
    return BaseService.getDataServiceInstance(
      TranscriptsService,
      token,
    ) as TranscriptsService;
  }
}
