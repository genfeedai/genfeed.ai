import { CreateMemberDto } from '@api/collections/members/dto/create-member.dto';
import { UpdateMemberDto } from '@api/collections/members/dto/update-member.dto';
import {
  Member,
  type MemberDocument,
} from '@api/collections/members/schemas/member.schema';
import { DB_CONNECTIONS } from '@api/constants/database.constants';
import { BaseService } from '@api/shared/services/base/base.service';
import { AggregatePaginateModel } from '@api/types/mongoose-aggregate-paginate-v2';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { type QueryFilter, Types } from 'mongoose';

@Injectable()
export class MembersService extends BaseService<
  MemberDocument,
  CreateMemberDto,
  UpdateMemberDto
> {
  public readonly constructorName: string = String(this.constructor.name);

  constructor(
    @InjectModel(Member.name, DB_CONNECTIONS.AUTH)
    protected readonly model: AggregatePaginateModel<MemberDocument>,
    public readonly logger: LoggerService,
  ) {
    super(model, logger);
  }

  async find(filter: QueryFilter<MemberDocument>): Promise<MemberDocument[]> {
    return await this.model.find(filter).exec();
  }

  async setLastUsedBrand(
    filter: QueryFilter<MemberDocument>,
    brandId: Types.ObjectId,
  ): Promise<void> {
    await this.model.updateOne(filter, { $set: { lastUsedBrand: brandId } });
  }
}
