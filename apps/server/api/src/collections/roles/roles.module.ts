/**
 * Roles Module
 * Permission system: define roles (admin, editor, viewer), manage capabilities,
and control feature access.
 */

import { RolesController } from '@api/collections/roles/controllers/roles.controller';
import { RolesService } from '@api/collections/roles/services/roles.service';
import { Module } from '@nestjs/common';

@Module({
  controllers: [RolesController],
  exports: [RolesService],
  imports: [],
  providers: [RolesService],
})
export class RolesModule {}
