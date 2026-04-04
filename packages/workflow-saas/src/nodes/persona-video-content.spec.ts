import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PERSONA_VIDEO_CONTENT_DATA,
  personaVideoContentNodeDefinition,
} from './persona-video-content';

describe('persona-video-content node', () => {
  describe('DEFAULT_PERSONA_VIDEO_CONTENT_DATA', () => {
    it('should have label set to Persona Video', () => {
      expect(DEFAULT_PERSONA_VIDEO_CONTENT_DATA.label).toBe('Persona Video');
    });

    it('should default to idle status', () => {
      expect(DEFAULT_PERSONA_VIDEO_CONTENT_DATA.status).toBe('idle');
    });

    it('should have type set to personaVideoContent', () => {
      expect(DEFAULT_PERSONA_VIDEO_CONTENT_DATA.type).toBe(
        'personaVideoContent',
      );
    });

    it('should default aspectRatio to 16:9', () => {
      expect(DEFAULT_PERSONA_VIDEO_CONTENT_DATA.aspectRatio).toBe('16:9');
    });

    it('should default personaId and script to null', () => {
      expect(DEFAULT_PERSONA_VIDEO_CONTENT_DATA.personaId).toBeNull();
      expect(DEFAULT_PERSONA_VIDEO_CONTENT_DATA.script).toBeNull();
    });

    it('should default resolved fields to null', () => {
      expect(DEFAULT_PERSONA_VIDEO_CONTENT_DATA.resolvedPersonaId).toBeNull();
      expect(
        DEFAULT_PERSONA_VIDEO_CONTENT_DATA.resolvedPersonaLabel,
      ).toBeNull();
      expect(
        DEFAULT_PERSONA_VIDEO_CONTENT_DATA.resolvedAvatarProvider,
      ).toBeNull();
      expect(DEFAULT_PERSONA_VIDEO_CONTENT_DATA.resolvedVideoUrl).toBeNull();
      expect(DEFAULT_PERSONA_VIDEO_CONTENT_DATA.resolvedJobId).toBeNull();
    });
  });

  describe('personaVideoContentNodeDefinition', () => {
    it('should have type personaVideoContent', () => {
      expect(personaVideoContentNodeDefinition.type).toBe(
        'personaVideoContent',
      );
    });

    it('should be in saas category', () => {
      expect(personaVideoContentNodeDefinition.category).toBe('saas');
    });

    it('should have label Persona Video', () => {
      expect(personaVideoContentNodeDefinition.label).toBe('Persona Video');
    });

    it('should have brand (required) and script inputs', () => {
      const brandInput = personaVideoContentNodeDefinition.inputs.find(
        (i) => i.id === 'brand',
      );
      const scriptInput = personaVideoContentNodeDefinition.inputs.find(
        (i) => i.id === 'script',
      );
      expect(brandInput?.required).toBe(true);
      expect(scriptInput).toBeDefined();
    });

    it('should output a video', () => {
      expect(personaVideoContentNodeDefinition.outputs).toHaveLength(1);
      expect(personaVideoContentNodeDefinition.outputs[0].id).toBe('video');
      expect(personaVideoContentNodeDefinition.outputs[0].type).toBe('video');
    });

    it('should reference default data', () => {
      expect(personaVideoContentNodeDefinition.defaultData).toBe(
        DEFAULT_PERSONA_VIDEO_CONTENT_DATA,
      );
    });
  });
});
