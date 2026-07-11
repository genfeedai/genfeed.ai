import { describe, expect, it } from 'vitest';
import { HandleTypeEnum, NodeStatusEnum } from './types';

describe('types aliased exports', () => {
  it('exports NodeStatusEnum', () => expect(NodeStatusEnum).toBeDefined());
  it('exports HandleTypeEnum', () => expect(HandleTypeEnum).toBeDefined());
});
