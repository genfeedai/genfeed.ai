import { CreateUserDto } from '@api/collections/users/dto/create-user.dto';
import { UpdateUserDto } from '@api/collections/users/dto/update-user.dto';
import type { UserDocument } from '@api/collections/users/schemas/user.schema';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { BaseService } from '@api/shared/services/base/base.service';
import type { PopulateOption } from '@genfeedai/interfaces';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';

@Injectable()
export class UsersService extends BaseService<
  UserDocument,
  CreateUserDto,
  UpdateUserDto
> {
  constructor(
    public readonly prisma: PrismaService,
    public readonly logger: LoggerService,
  ) {
    super(prisma, 'user', logger);
  }

  async findOne(
    params: Record<string, unknown>,
    populate: PopulateOption[] = [{ path: 'settings' }],
  ): Promise<UserDocument | null> {
    return await super.findOne(params, populate);
  }

  async patch(
    id: string,
    updateUserDto: Partial<UpdateUserDto>,
  ): Promise<UserDocument> {
    return await super.patch(id, updateUserDto, [{ path: 'settings' }]);
  }

  async findMongoIdByClerkId(clerkId: string): Promise<string | null> {
    const user = await this.findOne({ clerkId }, []);
    if (!user?._id) {
      return null;
    }
    return String(user._id);
  }

  /**
   * Check if a user document has the isOnboardingCompleted field.
   */
  async hasOnboardingField(userId: string): Promise<boolean> {
    const doc = await this.prisma.user.findFirst({
      where: { id: String(userId), isOnboardingCompleted: { not: null } },
    });
    return doc !== null;
  }
}
