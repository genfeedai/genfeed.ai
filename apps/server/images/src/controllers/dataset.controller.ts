import type { DatasetSyncRequest } from '@images/interfaces/dataset.interfaces';
import { DatasetService } from '@images/services/dataset.service';
import { Body, Controller, Delete, Get, Param, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

@ApiTags('Datasets')
@Controller('datasets')
export class DatasetController {
  constructor(private readonly datasetService: DatasetService) {}

  @Post(':slug/sync')
  @ApiOperation({ summary: 'Sync dataset images from S3 to local storage' })
  syncDataset(@Param('slug') slug: string, @Body() body: DatasetSyncRequest) {
    return this.datasetService.syncDataset(slug, body);
  }

  @Get(':slug')
  @ApiOperation({ summary: 'Get dataset info and image list' })
  getDataset(@Param('slug') slug: string) {
    return this.datasetService.getDataset(slug);
  }

  @Delete(':slug')
  @ApiOperation({ summary: 'Delete a local dataset' })
  deleteDataset(@Param('slug') slug: string) {
    return this.datasetService.deleteDataset(slug);
  }
}
