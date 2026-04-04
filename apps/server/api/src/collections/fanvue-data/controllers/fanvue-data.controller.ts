import { FanvueDataService } from '@api/collections/fanvue-data/services/fanvue-data.service';
import { Controller } from '@nestjs/common';

@Controller('fanvue-data')
export class FanvueDataController {
  constructor(readonly _fanvueDataService: FanvueDataService) {}
}
