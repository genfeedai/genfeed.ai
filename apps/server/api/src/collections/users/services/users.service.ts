import { CreateUserDto } from '@api/collections/users/dto/create-user.dto';
import { UpdateUserDto } from '@api/collections/users/dto/update-user.dto';
import type { UserDocument } from '@api/collections/users/schemas/user.schema';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import {
  BaseService,
  type PrismaFindAllInput,
} from '@api/shared/services/base/base.service';
import type { AggregatePaginateResult } from '@api/types/aggregate-paginate-result';
import type { PopulateOption } from '@genfeedai/interfaces';
import type { AggregationOptions } from '@libs/interfaces/query.interface';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';

const USER_FIND_ALL_SELECT = {
  id: true,
  authProviderId: true,
  handle: true,
  firstName: true,
  lastName: true,
  email: true,
  avatar: true,
  platformRole: true,
  isOnboardingCompleted: true,
  onboardingStartedAt: true,
  onboardingCompletedAt: true,
  onboardingType: true,
  onboardingStepsCompleted: true,
  settings: true,
};

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

  private withSafeFindAllSelect(input: PrismaFindAllInput): PrismaFindAllInput {
    if (input.select) {
      return input;
    }

    const { include, ...query } = input;
    return {
      ...query,
      select: {
        ...USER_FIND_ALL_SELECT,
        ...(include ?? {}),
      },
    };
  }

  async findAll(
    input: unknown,
    options: AggregationOptions,
    enableCache: boolean = true,
  ): Promise<AggregatePaginateResult<UserDocument>> {
    if (typeof input === 'object' && input !== null && !Array.isArray(input)) {
      return await super.findAll(
        this.withSafeFindAllSelect(input as PrismaFindAllInput),
        options,
        enableCache,
      );
    }

    return await super.findAll(input, options, enableCache);
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

  async findMongoIdByAuthProviderId(
    authProviderId: string,
  ): Promise<string | null> {
    const user = await this.findOne({ authProviderId }, []);
    if (!user?.id) {
      return null;
    }
    return String(user.id);
  }

  /**
   * Check if a user document has the isOnboardingCompleted field.
   */
  async hasOnboardingField(userId: string): Promise<boolean> {
    const doc = await this.prisma.user.findUnique({
      select: { id: true },
      where: { id: String(userId) },
    });
    return doc !== null;
  }
}
