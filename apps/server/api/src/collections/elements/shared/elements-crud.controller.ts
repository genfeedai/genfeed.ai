import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { canModifyOrganizationElement } from '@api/collections/elements/shared/can-modify-organization-element.util';
import {
  buildElementScopeConditions,
  canReadElement,
  type ScopedElement,
  withPlatformDefaultFlag,
} from '@api/collections/elements/shared/element-scope.util';
import { BaseQueryDto } from '@api/helpers/dto/base-query.dto';
import { getIsSuperAdmin } from '@api/helpers/utils/auth/auth.util';
import { ScopedCRUDController } from '@api/shared/controllers/base-crud/scoped-crud.controller';
import type { PlatformElementDto } from '@api/shared/dto/element/platform-element.dto';
import { ForbiddenException } from '@nestjs/common';

/**
 * CRUD base for element types that can be platform defaults (#6038).
 *
 * - Reads: platform defaults are readable by everyone (inactive ones by
 *   superadmins only); organization rows only by their own organization.
 * - Lookups and writes go through the scoped query of `ScopedCRUDController`
 *   so the CLOUD tenant guard sees the caller's organization.
 * - Writes: only superadmins create platform defaults and may modify them.
 *   Organization routes answer not-found for a default they cannot modify.
 */
export abstract class ElementsCRUDController<
  T extends ScopedElement,
  CreateDto extends PlatformElementDto,
  UpdateDto extends Partial<PlatformElementDto>,
  QueryDto extends BaseQueryDto = BaseQueryDto,
> extends ScopedCRUDController<T, CreateDto, UpdateDto, QueryDto> {
  protected buildScopeConditions(user: User): Record<string, unknown>[] {
    return buildElementScopeConditions({
      isSuperAdmin: getIsSuperAdmin(user),
      organizationId: user.organizationId,
    });
  }

  public override enrichCreateDto(
    createDto: Partial<CreateDto>,
    user: User,
  ): CreateDto {
    const isSuperAdmin = getIsSuperAdmin(user);
    const { isPlatformDefault } = createDto;

    if (isPlatformDefault === true && !isSuperAdmin) {
      throw new ForbiddenException(
        'Only superadmins can create platform default elements',
      );
    }

    const enriched: CreateDto = {
      ...super.enrichCreateDto(createDto, user),
    };
    delete enriched.isPlatformDefault;

    if (isSuperAdmin && isPlatformDefault !== false) {
      return Object.assign(enriched, { organizationId: null });
    }

    return enriched;
  }

  public override async enrichUpdateDto(
    updateDto: Partial<UpdateDto>,
    user: User,
  ): Promise<UpdateDto> {
    const enriched: UpdateDto = {
      ...(await super.enrichUpdateDto(updateDto, user)),
    };
    delete enriched.isPlatformDefault;

    return enriched;
  }

  public override canUserModifyEntity(user: User, entity: T): boolean {
    return canModifyOrganizationElement(user, entity);
  }

  public override canUserReadEntity(user: User, entity: T): boolean {
    return canReadElement(user, entity);
  }

  public override decorateForResponse(data: T, _user: User): T {
    return withPlatformDefaultFlag(data);
  }

  public override decorateListForResponse(docs: T[], _user: User): T[] {
    return docs.map(withPlatformDefaultFlag);
  }
}
