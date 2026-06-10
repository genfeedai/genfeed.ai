import { BaseJobService } from '@libs/jobs/base-job.service';
import { Injectable } from '@nestjs/common';
import type { TTSJob } from '@voices/interfaces/voices.interfaces';

@Injectable()
export class JobService extends BaseJobService<TTSJob> {}
