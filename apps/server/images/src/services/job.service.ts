import type { GenerationJob } from '@images/interfaces/images.interfaces';
import { BaseJobService } from '@libs/jobs/base-job.service';
import { Injectable } from '@nestjs/common';

@Injectable()
export class JobService extends BaseJobService<GenerationJob> {}
