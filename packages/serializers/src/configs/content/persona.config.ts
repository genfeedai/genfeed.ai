import { personaAttributes } from '@serializers/attributes/content/persona.attributes';
import { credentialAttributes } from '@serializers/attributes/organizations/credential.attributes';
import { rel } from '@serializers/builders';
import { STANDARD_ENTITY_RELS } from '@serializers/relationships';

export const personaSerializerConfig = {
  attributes: personaAttributes,
  type: 'persona',
  ...STANDARD_ENTITY_RELS,
  assignedMembers: rel('user', ['firstName', 'lastName', 'email', 'imageUrl']),
  avatar: rel('ingredient', ['label', 'url', 'thumbnailUrl', 'type']),
  credentials: rel('credential', credentialAttributes),
  voice: rel('voice', ['label', 'provider', 'externalId']),
};
