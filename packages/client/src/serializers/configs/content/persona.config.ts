import { personaAttributes } from '../../attributes/content/persona.attributes';
import { credentialAttributes } from '../../attributes/organizations/credential.attributes';
import { rel } from '../../builders';
import { STANDARD_ENTITY_RELS } from '../../relationships';

export const personaSerializerConfig = {
  attributes: personaAttributes,
  type: 'persona',
  ...STANDARD_ENTITY_RELS,
  assignedMembers: rel('user', ['firstName', 'lastName', 'email', 'imageUrl']),
  avatar: rel('ingredient', ['label', 'url', 'thumbnailUrl', 'type']),
  credentials: rel('credential', credentialAttributes),
  voice: rel('voice', ['label', 'provider', 'externalId']),
};
