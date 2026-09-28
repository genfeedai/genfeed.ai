import { ReportingPolicyDto } from '@api/collections/agent-strategies/dto/create-agent-strategy.dto';
import { CreateArticleAnalyticsDto } from '@api/collections/articles/dto/create-article-analytics.dto';
import { GrantBillingRoleDto } from '@api/collections/billing-accounts/dto/grant-billing-role.dto';
import { BotsQueryDto } from '@api/collections/bots/dto/bots-query.dto';
import { CreateCredentialDto } from '@api/collections/credentials/dto/create-credential.dto';
import { CreateIngredientDto } from '@api/collections/ingredients/dto/create-ingredient.dto';
import { CreateMemberDto } from '@api/collections/members/dto/create-member.dto';
import { CreateOrganizationDto } from '@api/collections/organizations/dto/create-organization.dto';
import { CreatePersonaDto } from '@api/collections/personas/dto/create-persona.dto';
import { UpdatePersonaDto } from '@api/collections/personas/dto/update-persona.dto';
import { CreatePostAnalyticsDto } from '@api/collections/posts/dto/create-post-analytics.dto';
import { CreatePromptDto } from '@api/collections/prompts/dto/create-prompt.dto';
import { CreateSettingDto } from '@api/collections/settings/dto/create-setting.dto';
import { CreateSubscriptionDto } from '@api/collections/subscriptions/dto/create-subscription.dto';
import {
  OrganizationalCreateDto,
  OrganizationalUpdateDto,
} from '@api/shared/dto/base/base.dto';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

/**
 * Production holds legacy Better Auth base62 user IDs beside UUIDs (#5410).
 * This one fails every Genfeed entity-id shape (UUID, cuid, cuid2, ULID).
 */
const LEGACY_USER_ID = 'LegacyBetterAuthUserIdBase62Abcd';

class OrganizationalCreateExampleDto extends OrganizationalCreateDto {}
class OrganizationalUpdateExampleDto extends OrganizationalUpdateDto {}

type DtoClass = new () => object;

const USER_ID_FIELDS: ReadonlyArray<{
  dto: DtoClass;
  isArray: boolean;
  property: string;
}> = [
  {
    dto: ReportingPolicyDto,
    isArray: true,
    property: 'reportRecipientUserIds',
  },
  { dto: CreateArticleAnalyticsDto, isArray: false, property: 'user' },
  { dto: GrantBillingRoleDto, isArray: false, property: 'userId' },
  { dto: BotsQueryDto, isArray: false, property: 'userId' },
  { dto: CreateCredentialDto, isArray: false, property: 'userId' },
  { dto: CreateIngredientDto, isArray: false, property: 'userId' },
  { dto: CreateMemberDto, isArray: false, property: 'userId' },
  { dto: CreateOrganizationDto, isArray: false, property: 'userId' },
  { dto: CreatePersonaDto, isArray: true, property: 'assignedMembers' },
  { dto: UpdatePersonaDto, isArray: true, property: 'memberIds' },
  { dto: CreatePostAnalyticsDto, isArray: false, property: 'userId' },
  { dto: CreatePromptDto, isArray: false, property: 'userId' },
  { dto: CreateSettingDto, isArray: false, property: 'user' },
  { dto: CreateSubscriptionDto, isArray: false, property: 'userId' },
  { dto: OrganizationalCreateExampleDto, isArray: false, property: 'userId' },
  { dto: OrganizationalUpdateExampleDto, isArray: false, property: 'userId' },
];

async function errorsFor(
  dto: DtoClass,
  property: string,
  value: unknown,
): Promise<string[]> {
  const errors = await validate(plainToInstance(dto, { [property]: value }));

  return errors
    .filter((error) => error.property === property)
    .flatMap((error) => Object.keys(error.constraints ?? {}));
}

describe('user ID fields are opaque', () => {
  it.each(USER_ID_FIELDS)(
    '$dto.name.$property accepts a legacy Better Auth user ID',
    async ({ dto, isArray, property }) => {
      const value = isArray ? [LEGACY_USER_ID] : LEGACY_USER_ID;

      expect(await errorsFor(dto, property, value)).toEqual([]);
    },
  );

  it.each(USER_ID_FIELDS)(
    '$dto.name.$property rejects an empty user ID',
    async ({ dto, isArray, property }) => {
      const value = isArray ? [''] : '';

      expect(await errorsFor(dto, property, value)).toContain('isNotEmpty');
    },
  );
});
