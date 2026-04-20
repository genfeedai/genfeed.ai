/**
 * Folders Module
 * Content organization: folder structure, hierarchical organization,
content categorization, and folder permissions.
 */
import { FoldersController } from '@api/collections/folders/controllers/folders.controller';
import { FoldersService } from '@api/collections/folders/services/folders.service';
import { Module } from '@nestjs/common';

@Module({
  controllers: [FoldersController],
  exports: [FoldersService],
  imports: [],
  providers: [FoldersService],
})
export class FoldersModule {}
