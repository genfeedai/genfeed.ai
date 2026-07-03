import { channelTargetAttributes } from '@serializers/attributes/content/channel-target.attributes';
import { releaseAttachmentAttributes } from '@serializers/attributes/content/release-attachment.attributes';
import { credentialAttributes } from '@serializers/attributes/organizations/credential.attributes';
import { rel } from '@serializers/builders';

export const channelTargetSerializerConfig = {
  attributes: channelTargetAttributes,
  attachments: rel('release-attachment', releaseAttachmentAttributes),
  credential: rel('credential', credentialAttributes),
  type: 'channel-target',
};
