import { UsersService } from '@api/collections/users/services/users.service';
import { Module } from '@nestjs/common';

/** User persistence only. Profile HTTP stays on UsersModule. */
@Module({
  exports: [UsersService],
  providers: [UsersService],
})
export class UsersCoreModule {}
