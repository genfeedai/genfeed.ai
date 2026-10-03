import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { BaseQueryDto } from '@api/helpers/dto/base-query.dto';
import { getIsSuperAdmin } from '@api/helpers/utils/auth/auth.util';
import { ErrorResponse } from '@api/helpers/utils/error-response/error-response.util';
import { serializeSingle } from '@api/helpers/utils/response/response.util';
import { isEntityId } from '@api/helpers/validation/entity-id.validator';
import { BaseCRUDController } from '@api/shared/controllers/base-crud/base-crud.controller';
import type { JsonApiSingleResponse } from '@genfeedai/contracts/interfaces';
import type { Request } from 'express';

/**
 * CRUD base for collections whose readable rows are a shared scope (for
 * example platform defaults with no organization) plus the caller's own.
 *
 * The inherited lookups and writes address a row by primary key alone, which
 * carries no tenant proof, so the CLOUD Prisma tenant guard rejects them on
 * tenant models. This base resolves and writes every row through the scope
 * returned by `buildScopeConditions`, which names the caller's organization.
 * A row outside the scope is answered as not-found.
 */
export abstract class ScopedCRUDController<
  T,
  CreateDto,
  UpdateDto,
  QueryDto extends BaseQueryDto = BaseQueryDto,
> extends BaseCRUDController<T, CreateDto, UpdateDto, QueryDto> {
  /** Prisma OR arms selecting the rows `user` may address. */
  protected abstract buildScopeConditions(
    user: User,
  ): Record<string, unknown>[];

  public override buildFindOneQuery(
    user: User,
    id: string,
    _request?: Request,
  ): Record<string, unknown> {
    return { id, isDeleted: false, OR: this.buildScopeConditions(user) };
  }

  public override async patch(
    request: Request,
    user: User,
    id: string,
    updateDto: UpdateDto,
  ): Promise<JsonApiSingleResponse> {
    if (!isEntityId(id)) {
      ErrorResponse.notFound(this.entityName, id);
    }

    const where = this.buildFindOneQuery(user, id, request);
    const existing = await this.service.findOne(
      where,
      this.getPopulateForOwnershipCheck(),
    );

    if (
      !existing ||
      (!this.canUserModifyEntity(user, existing) &&
        !getIsSuperAdmin(user, request))
    ) {
      return ErrorResponse.notFound(this.entityName, id);
    }

    await this.assertPatchAllowed(user, existing, updateDto, request);

    const data = await this.service.patchOneWhere(
      where,
      await this.enrichUpdateDto(updateDto, user),
      this.getPopulateFields(),
    );

    if (!data) {
      return ErrorResponse.notFound(this.entityName, id);
    }

    return serializeSingle(
      request,
      this.serializer,
      await this.decorateForResponse(data, user),
    );
  }

  public override async remove(
    request: Request,
    user: User,
    id: string,
  ): Promise<JsonApiSingleResponse> {
    if (!isEntityId(id)) {
      ErrorResponse.notFound(this.entityName, id);
    }

    const where = this.buildFindOneQuery(user, id, request);
    const existing = await this.service.findOne(where);

    if (
      !existing ||
      (!this.canUserModifyEntity(user, existing) &&
        !getIsSuperAdmin(user, request))
    ) {
      return ErrorResponse.notFound(this.entityName, id);
    }

    const data = await this.service.patchOneWhere(where, { isDeleted: true });

    if (!data) {
      return ErrorResponse.notFound(this.entityName, id);
    }

    return serializeSingle(request, this.serializer, data);
  }
}
