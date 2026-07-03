import { channelTargetAttributes } from '@serializers/attributes/content/channel-target.attributes';
import { recurrenceRuleAttributes } from '@serializers/attributes/content/recurrence-rule.attributes';
import { releaseAttachmentAttributes } from '@serializers/attributes/content/release-attachment.attributes';
import { releaseGroupAttributes } from '@serializers/attributes/content/release-group.attributes';
import { credentialAttributes } from '@serializers/attributes/organizations/credential.attributes';
import { nestedRel, rel } from '@serializers/builders';
import {
  BRAND_REL,
  ORGANIZATION_REL,
  USER_REL,
} from '@serializers/relationships';

export const releaseGroupSerializerConfig = {
  attributes: releaseGroupAttributes,
  attachments: rel('release-attachment', releaseAttachmentAttributes),
  brand: BRAND_REL,
  organization: ORGANIZATION_REL,
  owner: USER_REL,
  recurrence: rel('recurrence-rule', recurrenceRuleAttributes),
  targets: nestedRel('channel-target', channelTargetAttributes, {
    credential: rel('credential', credentialAttributes),
  }),
  type: 'release-group',
};
