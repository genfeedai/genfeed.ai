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
      it('should have type user', () => {
        expect(USER_REL.type).toBe('user');
      });

      it('should have _id reference', () => {
        expect(USER_REL.ref).toBe('_id');
      });

      it('should have user attributes', () => {
        expect(USER_REL.attributes).toContain('email');
        expect(USER_REL.attributes).toContain('firstName');
        expect(USER_REL.attributes).toContain('lastName');
      });
    });

    describe('ORGANIZATION_REL', () => {
      it('should have type organization', () => {
        expect(ORGANIZATION_REL.type).toBe('organization');
      });

      it('should have _id reference', () => {
        expect(ORGANIZATION_REL.ref).toBe('_id');
      });

      it('should have organization attributes', () => {
        expect(ORGANIZATION_REL.attributes).toContain('label');
        expect(ORGANIZATION_REL.attributes).toContain('credits');
      });
    });

    describe('BRAND_REL', () => {
      it('should have type brand', () => {
        expect(BRAND_REL.type).toBe('brand');
      });

      it('should have _id reference', () => {
        expect(BRAND_REL.ref).toBe('_id');
      });

      it('should have brand attributes', () => {
        expect(BRAND_REL.attributes).toContain('label');
        expect(BRAND_REL.attributes).toContain('slug');
        expect(BRAND_REL.attributes).toContain('description');
      });
    });

    describe('TAG_REL', () => {
      it('should have type tag', () => {
        expect(TAG_REL.type).toBe('tag');
      });

      it('should have _id reference', () => {
        expect(TAG_REL.ref).toBe('_id');
      });
    });

    describe('ASSET_REL', () => {
      it('should have type asset', () => {
        expect(ASSET_REL.type).toBe('asset');
      });

      it('should have _id reference', () => {
        expect(ASSET_REL.ref).toBe('_id');
      });
    });

    describe('EVALUATION_REL', () => {
      it('should have type evaluation', () => {
        expect(EVALUATION_REL.type).toBe('evaluation');
      });

      it('should have _id reference', () => {
        expect(EVALUATION_REL.ref).toBe('_id');
      });
    });

    describe('FOLDER_REL', () => {
      it('should have type folder', () => {
        expect(FOLDER_REL.type).toBe('folder');
      });

      it('should have _id reference', () => {
        expect(FOLDER_REL.ref).toBe('_id');
      });
    });
  });

  describe('Minimal Relationship Constants', () => {
    describe('ORGANIZATION_MINIMAL_REL', () => {
      it('should have type organization', () => {
        expect(ORGANIZATION_MINIMAL_REL.type).toBe('organization');
      });

      it('should have minimal attributes', () => {
        expect(ORGANIZATION_MINIMAL_REL.attributes).toEqual(['label']);
      });
    });

    describe('BRAND_MINIMAL_REL', () => {
      it('should have type brand', () => {
        expect(BRAND_MINIMAL_REL.type).toBe('brand');
      });

      it('should have minimal attributes', () => {
        expect(BRAND_MINIMAL_REL.attributes).toEqual(['label', 'slug']);
      });
    });
  });

  describe('Bundled Relationship Sets', () => {
    describe('STANDARD_ENTITY_RELS', () => {
      it('should have user relationship', () => {
        expect(STANDARD_ENTITY_RELS.user).toBe(USER_REL);
      });

      it('should have organization relationship', () => {
        expect(STANDARD_ENTITY_RELS.organization).toBe(ORGANIZATION_REL);
      });

      it('should have brand relationship', () => {
        expect(STANDARD_ENTITY_RELS.brand).toBe(BRAND_REL);
      });

      it('should have tags relationship', () => {
        expect(STANDARD_ENTITY_RELS.tags).toBe(TAG_REL);
      });

      it('should have exactly 4 relationships', () => {
        expect(Object.keys(STANDARD_ENTITY_RELS)).toHaveLength(4);
      });
    });

    describe('CONTENT_ENTITY_RELS', () => {
      it('should include all standard entity relationships', () => {
        expect(CONTENT_ENTITY_RELS.user).toBe(USER_REL);
        expect(CONTENT_ENTITY_RELS.organization).toBe(ORGANIZATION_REL);
        expect(CONTENT_ENTITY_RELS.brand).toBe(BRAND_REL);
        expect(CONTENT_ENTITY_RELS.tags).toBe(TAG_REL);
      });

      it('should have evaluation relationship', () => {
        expect(CONTENT_ENTITY_RELS.evaluation).toBe(EVALUATION_REL);
      });

      it('should have exactly 5 relationships', () => {
        expect(Object.keys(CONTENT_ENTITY_RELS)).toHaveLength(5);
      });
    });

    describe('MINIMAL_ENTITY_RELS', () => {
      it('should have user relationship (full)', () => {
        expect(MINIMAL_ENTITY_RELS.user).toBe(USER_REL);
      });

      it('should have minimal organization relationship', () => {
        expect(MINIMAL_ENTITY_RELS.organization).toBe(ORGANIZATION_MINIMAL_REL);
      });

      it('should have minimal brand relationship', () => {
        expect(MINIMAL_ENTITY_RELS.brand).toBe(BRAND_MINIMAL_REL);
      });

      it('should have exactly 3 relationships', () => {
        expect(Object.keys(MINIMAL_ENTITY_RELS)).toHaveLength(3);
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

    test.each(allRelationships)('$name should have required properties', ({
      rel,
    }) => {
      expect(rel).toHaveProperty('type');
      expect(rel).toHaveProperty('ref');
      expect(rel).toHaveProperty('attributes');
      expect(typeof rel.type).toBe('string');
      expect(rel.ref).toBe('_id');
      expect(Array.isArray(rel.attributes)).toBe(true);
    });

    test.each(allRelationships)('$name should have non-empty type', ({
      rel,
    }) => {
      expect(rel.type.length).toBeGreaterThan(0);
    });
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

    it('should allow spreading CONTENT_ENTITY_RELS into config', () => {
      const config = {
        attributes: ['url', 'format'],
        type: 'ingredient',
        ...CONTENT_ENTITY_RELS,
      };

      expect(config.evaluation).toBe(EVALUATION_REL);
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
