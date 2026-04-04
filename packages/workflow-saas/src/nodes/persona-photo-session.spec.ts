import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PERSONA_PHOTO_SESSION_DATA,
  personaPhotoSessionNodeDefinition,
} from './persona-photo-session';

describe('persona-photo-session node', () => {
  describe('DEFAULT_PERSONA_PHOTO_SESSION_DATA', () => {
    it('should have label set to Persona Photo Session', () => {
      expect(DEFAULT_PERSONA_PHOTO_SESSION_DATA.label).toBe(
        'Persona Photo Session',
      );
    });

    it('should default to idle status', () => {
      expect(DEFAULT_PERSONA_PHOTO_SESSION_DATA.status).toBe('idle');
    });

    it('should have type set to personaPhotoSession', () => {
      expect(DEFAULT_PERSONA_PHOTO_SESSION_DATA.type).toBe(
        'personaPhotoSession',
      );
    });

    it('should default count to 1', () => {
      expect(DEFAULT_PERSONA_PHOTO_SESSION_DATA.count).toBe(1);
    });

    it('should default personaId and prompt to null', () => {
      expect(DEFAULT_PERSONA_PHOTO_SESSION_DATA.personaId).toBeNull();
      expect(DEFAULT_PERSONA_PHOTO_SESSION_DATA.prompt).toBeNull();
    });

    it('should default resolved fields appropriately', () => {
      expect(DEFAULT_PERSONA_PHOTO_SESSION_DATA.resolvedPersonaId).toBeNull();
      expect(
        DEFAULT_PERSONA_PHOTO_SESSION_DATA.resolvedPersonaLabel,
      ).toBeNull();
      expect(
        DEFAULT_PERSONA_PHOTO_SESSION_DATA.resolvedAvatarProvider,
      ).toBeNull();
      expect(DEFAULT_PERSONA_PHOTO_SESSION_DATA.resolvedImageUrls).toEqual([]);
      expect(DEFAULT_PERSONA_PHOTO_SESSION_DATA.resolvedJobIds).toEqual([]);
    });
  });

  describe('personaPhotoSessionNodeDefinition', () => {
    it('should have type personaPhotoSession', () => {
      expect(personaPhotoSessionNodeDefinition.type).toBe(
        'personaPhotoSession',
      );
    });

    it('should be in saas category', () => {
      expect(personaPhotoSessionNodeDefinition.category).toBe('saas');
    });

    it('should have label Persona Photo Session', () => {
      expect(personaPhotoSessionNodeDefinition.label).toBe(
        'Persona Photo Session',
      );
    });

    it('should require brand input', () => {
      expect(personaPhotoSessionNodeDefinition.inputs).toHaveLength(1);
      expect(personaPhotoSessionNodeDefinition.inputs[0].id).toBe('brand');
      expect(personaPhotoSessionNodeDefinition.inputs[0].required).toBe(true);
    });

    it('should output images as multiple', () => {
      expect(personaPhotoSessionNodeDefinition.outputs).toHaveLength(1);
      expect(personaPhotoSessionNodeDefinition.outputs[0].id).toBe('images');
      expect(personaPhotoSessionNodeDefinition.outputs[0].multiple).toBe(true);
      expect(personaPhotoSessionNodeDefinition.outputs[0].type).toBe('image');
    });

    it('should reference default data', () => {
      expect(personaPhotoSessionNodeDefinition.defaultData).toBe(
        DEFAULT_PERSONA_PHOTO_SESSION_DATA,
      );
    });
  });
});
