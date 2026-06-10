import { BaseJobService } from '@libs/jobs/base-job.service';
import { Injectable } from '@nestjs/common';
import type { VideoGenerationJob } from '@videos/interfaces/videos.interfaces';

@Injectable()
export class JobService extends BaseJobService<VideoGenerationJob> {}
