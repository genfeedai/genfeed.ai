import { afterEach, describe, expect, it } from 'vitest';
import { ServiceInstanceManager } from '../src/utils/service-instance-manager.util';

describe('ServiceInstanceManager', () => {
  afterEach(() => {
    ServiceInstanceManager.clearAll();
  });

  it('keys instances by service name and token', () => {
    const first = { id: 'a' };
    const second = { id: 'b' };

    ServiceInstanceManager.set('runs', 'token-1', first);
    ServiceInstanceManager.set('runs', 'token-2', second);

    expect(ServiceInstanceManager.getKey('runs', 'token-1')).toBe(
      'runs:token-1',
    );
    expect(ServiceInstanceManager.get('runs', 'token-1')).toBe(first);
    expect(ServiceInstanceManager.get('runs', 'token-2')).toBe(second);
    expect(ServiceInstanceManager.get('ideas', 'token-1')).toBeUndefined();
  });

  it('clears one instance without dropping the others', () => {
    ServiceInstanceManager.set('runs', 'token-1', { id: 'a' });
    ServiceInstanceManager.set('runs', 'token-2', { id: 'b' });

    ServiceInstanceManager.clear('runs', 'token-1');

    expect(ServiceInstanceManager.get('runs', 'token-1')).toBeUndefined();
    expect(ServiceInstanceManager.get('runs', 'token-2')).toEqual({ id: 'b' });
  });

  it('clears every cached instance', () => {
    ServiceInstanceManager.set('runs', 'token-1', { id: 'a' });
    ServiceInstanceManager.set('ideas', 'token-1', { id: 'c' });

    ServiceInstanceManager.clearAll();

    expect(ServiceInstanceManager.get('runs', 'token-1')).toBeUndefined();
    expect(ServiceInstanceManager.get('ideas', 'token-1')).toBeUndefined();
  });
});
