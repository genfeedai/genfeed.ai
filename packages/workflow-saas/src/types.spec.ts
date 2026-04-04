import { HandleTypeEnum, NodeStatusEnum } from '@workflow-saas/types';
import { describe, expect, it } from 'vitest';

describe('types aliased exports', () => {
  it('exports NodeStatusEnum', () => expect(NodeStatusEnum).toBeDefined());
  it('exports HandleTypeEnum', () => expect(HandleTypeEnum).toBeDefined());
});
