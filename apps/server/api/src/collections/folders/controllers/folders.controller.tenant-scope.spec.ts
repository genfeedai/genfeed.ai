import { FoldersController } from '@api/collections/folders/controllers/folders.controller';
import { BaseQueryDto } from '@api/helpers/dto/base-query.dto';
import {
  adminUser,
  fieldValues,
  memberUser,
  sessionBrandId,
  sessionOrganizationId,
  targetBrandId,
  targetOrganizationId,
  tenantReadQuery,
} from '@api-test/helpers/tenant-read.fixture';
import { ForbiddenException } from '@nestjs/common';

describe('Folders list tenant reads (#6176)', () => {
  const controller = Object.create(
    FoldersController.prototype,
  ) as FoldersController;

  it('reads the selected organization using canonical DTO keys', () => {
    const result = controller.buildFindAllQuery(
      adminUser,
      tenantReadQuery(BaseQueryDto, {
        organizationId: targetOrganizationId,
      }),
    );
    expect(result.where).toEqual({
      organizationId: targetOrganizationId,
      isDeleted: false,
    });
    expect(fieldValues(result, 'brandId')).not.toContain(sessionBrandId);
  });

  it('rejects a member foreign organization', () => {
    expect(() =>
      controller.buildFindAllQuery(
        memberUser,
        tenantReadQuery(BaseQueryDto, {
          organizationId: targetOrganizationId,
        }),
      ),
    ).toThrow(ForbiddenException);
  });

  it('keeps shared and current-brand folders for a member without override', () => {
    expect(
      controller.buildFindAllQuery(
        memberUser,
        tenantReadQuery(BaseQueryDto, {}),
      ).where,
    ).toEqual({
      isDeleted: false,
      OR: [
        { organizationId: sessionOrganizationId, brandId: null },
        { organizationId: sessionOrganizationId, brandId: sessionBrandId },
      ],
    });
  });

  it('scopes an explicit target brand under the target organization', () => {
    const result = controller.buildFindAllQuery(
      adminUser,
      tenantReadQuery(BaseQueryDto, {
        organizationId: targetOrganizationId,
        brandId: targetBrandId,
      }),
    );
    expect(fieldValues(result.where, 'brandId')).toContain(targetBrandId);
    expect(fieldValues(result.where, 'organizationId')).not.toContain(
      sessionOrganizationId,
    );
  });
});
