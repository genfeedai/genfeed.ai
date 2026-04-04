import { CreditBalanceEntity } from '@api/collections/credits/entities/credit-balance.entity';
import {
  CreditBalance,
  type CreditBalanceDocument,
} from '@api/collections/credits/schemas/credit-balance.schema';
import { DB_CONNECTIONS } from '@api/constants/database.constants';
import { HandleErrors } from '@api/helpers/decorators/error-handler.decorator';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';

@Injectable()
export class CreditBalanceService {
  private readonly constructorName: string = String(this.constructor.name);

  constructor(
    @InjectModel(CreditBalance.name, DB_CONNECTIONS.AUTH)
    private readonly model: Model<CreditBalanceDocument>,
    private readonly logger: LoggerService,
  ) {}

  @HandleErrors('create credit balance', 'credits')
  async create(
    creditBalance: CreditBalanceEntity,
  ): Promise<CreditBalanceDocument> {
    const newCreditBalance = new this.model(creditBalance);
    return await newCreditBalance.save();
  }

  private isValidObjectId(id: string): boolean {
    return Types.ObjectId.isValid(id) && id.length === 24;
  }

  @HandleErrors('find by organization', 'credits')
  async findByOrganization(
    organizationId: string,
  ): Promise<CreditBalanceDocument | null> {
    if (!this.isValidObjectId(organizationId)) {
      this.logger.warn(`${this.constructorName} findByOrganization failed`, {
        organizationId,
      });
      return null;
    }

    return await this.model
      .findOne({
        isDeleted: { $ne: true },
        organization: new Types.ObjectId(organizationId),
      })
      .exec();
  }

  @HandleErrors('get or create balance', 'credits')
  async getOrCreateBalance(
    organizationId: string,
  ): Promise<CreditBalanceDocument> {
    if (!this.isValidObjectId(organizationId)) {
      throw new Error(`Invalid organization ID: ${organizationId}`);
    }

    let balance = await this.findByOrganization(organizationId);

    if (!balance) {
      const newBalance = new CreditBalanceEntity({
        balance: 0,
        isDeleted: false,
        organization: new Types.ObjectId(organizationId),
      });
      balance = await this.create(newBalance);
    }

    return balance;
  }

  @HandleErrors('update balance', 'credits')
  async updateBalance(
    organizationId: string,
    newBalance: number,
  ): Promise<CreditBalanceDocument> {
    const balance = await this.getOrCreateBalance(organizationId);

    return (await this.model
      .findByIdAndUpdate(
        balance._id,
        { balance: newBalance },
        { returnDocument: 'after' },
      )
      .exec()) as CreditBalanceDocument;
  }

  @HandleErrors('delete credit balance', 'credits')
  async delete(id: string): Promise<void> {
    await this.model.findByIdAndUpdate(id, { isDeleted: true }).exec();
  }
}
