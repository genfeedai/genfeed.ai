import { getRequestedAddressFamily } from './webhook-address-family.util';

describe('getRequestedAddressFamily', () => {
  it('accepts numeric and named IPv4/IPv6 lookup families', () => {
    expect(getRequestedAddressFamily(4)).toBe(4);
    expect(getRequestedAddressFamily('IPv4')).toBe(4);
    expect(getRequestedAddressFamily(6)).toBe(6);
    expect(getRequestedAddressFamily('IPv6')).toBe(6);
  });

  it('returns undefined for unspecified or unknown families', () => {
    expect(getRequestedAddressFamily(undefined)).toBeUndefined();
    expect(getRequestedAddressFamily(0)).toBeUndefined();
    expect(getRequestedAddressFamily('all')).toBeUndefined();
  });
});
