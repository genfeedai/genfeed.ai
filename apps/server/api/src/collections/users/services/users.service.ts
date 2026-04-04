import { CreateUserDto } from '@api/collections/users/dto/create-user.dto';
import { UpdateUserDto } from '@api/collections/users/dto/update-user.dto';
import {
  User,
  type UserDocument,
} from '@api/collections/users/schemas/user.schema';
import { DB_CONNECTIONS } from '@api/constants/database.constants';
import { BaseService } from '@api/shared/services/base/base.service';
import type { AggregatePaginateModel } from '@api/types/mongoose-aggregate-paginate-v2';
import type { PopulateOption } from '@genfeedai/interfaces';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Types } from 'mongoose';

@Injectable()
export class UsersService extends BaseService<
  UserDocument,
  CreateUserDto,
  UpdateUserDto
> {
  constructor(
    @InjectModel(User.name, DB_CONNECTIONS.AUTH)
    protected readonly model: AggregatePaginateModel<UserDocument>,
    public readonly logger: LoggerService,
  ) {
    super(model, logger);
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
   * Check if a user document has the isOnboardingCompleted field in MongoDB.
   * Older user records may not include this field.
   */
  async hasOnboardingField(userId: Types.ObjectId): Promise<boolean> {
    const doc = await this.findOne(
      { _id: userId, isOnboardingCompleted: { $exists: true } },
      [],
    );
    return doc !== null;
  }
}
