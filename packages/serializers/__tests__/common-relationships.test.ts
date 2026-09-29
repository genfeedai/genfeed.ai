import {
  ASSET_REL,
  BRAND_MINIMAL_REL,
  BRAND_REL,
  CONTENT_ENTITY_RELS,
  EVALUATION_REL,
  FOLDER_REL,
  MINIMAL_ENTITY_RELS,
  ORGANIZATION_MINIMAL_REL,
  ORGANIZATION_REL,
  STANDARD_ENTITY_RELS,
  TAG_REL,
  USER_REL,
} from '@serializers/relationships/common-relationships';

describe('common-relationships', () => {
  describe('Individual Relationship Constants', () => {
    describe('USER_REL', () => {
      it('should have user attributes', () => {
        expect(USER_REL.attributes).toContain('email');
        expect(USER_REL.attributes).toContain('firstName');
        expect(USER_REL.attributes).toContain('lastName');
      });
    });

    describe('ORGANIZATION_REL', () => {
      it('should have organization attributes', () => {
        expect(ORGANIZATION_REL.attributes).toContain('label');
        expect(ORGANIZATION_REL.attributes).toContain('credits');
      });
    });

    describe('BRAND_REL', () => {
      it('should have brand attributes', () => {
        expect(BRAND_REL.attributes).toContain('label');
        expect(BRAND_REL.attributes).toContain('slug');
        expect(BRAND_REL.attributes).toContain('description');
      });
    });
  });

  describe('Bundled Relationship Sets', () => {
    describe('CONTENT_ENTITY_RELS', () => {
      it('should include all standard entity relationships', () => {
        expect(CONTENT_ENTITY_RELS.user).toBe(USER_REL);
        expect(CONTENT_ENTITY_RELS.organization).toBe(ORGANIZATION_REL);
        expect(CONTENT_ENTITY_RELS.brand).toBe(BRAND_REL);
        expect(CONTENT_ENTITY_RELS.tags).toBe(TAG_REL);
      });
    });
  });

  describe('Relationship Structure Validation', () => {
    const allRelationships = [
      { name: 'USER_REL', rel: USER_REL },
      { name: 'ORGANIZATION_REL', rel: ORGANIZATION_REL },
      { name: 'BRAND_REL', rel: BRAND_REL },
      { name: 'TAG_REL', rel: TAG_REL },
      { name: 'ASSET_REL', rel: ASSET_REL },
      { name: 'EVALUATION_REL', rel: EVALUATION_REL },
      { name: 'FOLDER_REL', rel: FOLDER_REL },
      { name: 'ORGANIZATION_MINIMAL_REL', rel: ORGANIZATION_MINIMAL_REL },
      { name: 'BRAND_MINIMAL_REL', rel: BRAND_MINIMAL_REL },
    ];

    test.each(allRelationships)(
      '$name should have required properties',
      ({ rel }) => {
        expect(rel).toHaveProperty('type');
        expect(rel).toHaveProperty('ref');
        expect(rel).toHaveProperty('attributes');
        expect(typeof rel.type).toBe('string');
        expect(rel.ref).toBe('id');
        expect(Array.isArray(rel.attributes)).toBe(true);
      },
    );
  });

  describe('Spread Usage Pattern', () => {
    it('should allow spreading STANDARD_ENTITY_RELS into config', () => {
      const config = {
        attributes: ['title', 'content'],
        type: 'post',
        ...STANDARD_ENTITY_RELS,
      };

      expect(config.user).toBe(USER_REL);
      expect(config.organization).toBe(ORGANIZATION_REL);
      expect(config.brand).toBe(BRAND_REL);
      expect(config.tags).toBe(TAG_REL);
    });

    it('should allow spreading MINIMAL_ENTITY_RELS into config', () => {
      const config = {
        attributes: ['label'],
        type: 'list-item',
        ...MINIMAL_ENTITY_RELS,
      };

      expect(config.organization).toBe(ORGANIZATION_MINIMAL_REL);
      expect(config.brand).toBe(BRAND_MINIMAL_REL);
    });
  });
});
