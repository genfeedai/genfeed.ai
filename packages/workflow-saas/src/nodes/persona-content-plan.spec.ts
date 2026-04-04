import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PERSONA_CONTENT_PLAN_DATA,
  personaContentPlanNodeDefinition,
} from './persona-content-plan';

describe('persona-content-plan node', () => {
  describe('DEFAULT_PERSONA_CONTENT_PLAN_DATA', () => {
    it('should have label set to Content Plan', () => {
      expect(DEFAULT_PERSONA_CONTENT_PLAN_DATA.label).toBe('Content Plan');
    });

    it('should default to idle status', () => {
      expect(DEFAULT_PERSONA_CONTENT_PLAN_DATA.status).toBe('idle');
    });

    it('should have type set to personaContentPlan', () => {
      expect(DEFAULT_PERSONA_CONTENT_PLAN_DATA.type).toBe('personaContentPlan');
    });

    it('should default days to 7', () => {
      expect(DEFAULT_PERSONA_CONTENT_PLAN_DATA.days).toBe(7);
    });

    it('should default createDrafts to false', () => {
      expect(DEFAULT_PERSONA_CONTENT_PLAN_DATA.createDrafts).toBe(false);
    });

    it('should default personaId and credentialId to null', () => {
      expect(DEFAULT_PERSONA_CONTENT_PLAN_DATA.personaId).toBeNull();
      expect(DEFAULT_PERSONA_CONTENT_PLAN_DATA.credentialId).toBeNull();
    });

    it('should default resolved fields appropriately', () => {
      expect(DEFAULT_PERSONA_CONTENT_PLAN_DATA.resolvedPersonaId).toBeNull();
      expect(DEFAULT_PERSONA_CONTENT_PLAN_DATA.resolvedPersonaLabel).toBeNull();
      expect(DEFAULT_PERSONA_CONTENT_PLAN_DATA.resolvedPlanEntries).toEqual([]);
      expect(DEFAULT_PERSONA_CONTENT_PLAN_DATA.resolvedDraftsCreated).toBe(0);
    });
  });

  describe('personaContentPlanNodeDefinition', () => {
    it('should have type personaContentPlan', () => {
      expect(personaContentPlanNodeDefinition.type).toBe('personaContentPlan');
    });

    it('should be in saas category', () => {
      expect(personaContentPlanNodeDefinition.category).toBe('saas');
    });

    it('should have label Content Plan', () => {
      expect(personaContentPlanNodeDefinition.label).toBe('Content Plan');
    });

    it('should require brand input', () => {
      expect(personaContentPlanNodeDefinition.inputs).toHaveLength(1);
      expect(personaContentPlanNodeDefinition.inputs[0].id).toBe('brand');
      expect(personaContentPlanNodeDefinition.inputs[0].required).toBe(true);
    });

    it('should output a plan object', () => {
      expect(personaContentPlanNodeDefinition.outputs).toHaveLength(1);
      expect(personaContentPlanNodeDefinition.outputs[0].id).toBe('plan');
      expect(personaContentPlanNodeDefinition.outputs[0].type).toBe('object');
    });

    it('should reference default data', () => {
      expect(personaContentPlanNodeDefinition.defaultData).toBe(
        DEFAULT_PERSONA_CONTENT_PLAN_DATA,
      );
    });
  });
});
