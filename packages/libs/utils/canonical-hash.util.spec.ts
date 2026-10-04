import { sha256Hex, stableStringify } from '@libs/utils/canonical-hash.util';
import { hashProviderContract } from '@libs/utils/provider-contract.util';
import { describe, expect, it } from 'vitest';

// Expected strings and hashes were captured from the pre-refactor local copies
// (agent-transfers, publish-approval-integrity, provider-contract) before the
// shared helper existed. They guard persisted hashes: never regenerate them.
const FIXTURES: Record<string, unknown> = {
  nested: { z: 1, a: { y: [3, { b: 2, a: 1 }], x: null }, m: 'text' },
  unicode: {
    é: 'café',
    B: '  ',
    a: '日本語 😀',
    lone: '\ud800',
    ключ: 'значение',
  },
  arrays: [[], [[1, [2, [3]]]], [{ b: 1, a: 2 }, null, 'x']],
  nulls: { a: null, b: [null, null], c: { d: null } },
  keyOrder: { b: 1, B: 2, a: 3, '10': 4, '2': 5, '': 6, aa: 7, 'a b': 8 },
  numbers: {
    a: -0,
    b: 1e21,
    c: 0.1,
    d: 123456789012345680000,
    e: Number.NaN,
    f: Number.POSITIVE_INFINITY,
  },
  scalars: [true, false, 0, '', 'q"uote\\ \n\t'],
  empty: {},
  dateField: { when: new Date('2026-01-02T03:04:05.678Z') },
  nestedUndefined: { a: undefined, b: [undefined, 1], c: { d: undefined } },
  topUndefined: undefined,
  topNull: null,
  topString: 'abc',
  topNumber: 42,
};

const GOLDEN: Record<
  string,
  {
    canonical: string;
    sha256: string;
    publishApproval: string;
    providerContract: string;
  }
> = {
  nested: {
    canonical: '{"a":{"x":null,"y":[3,{"a":1,"b":2}]},"m":"text","z":1}',
    sha256: '68b6fe91d0759179587c5d061b542189eba8c647c28a64ab0bf18e0f2d43d628',
    publishApproval:
      'sha256:v1:68b6fe91d0759179587c5d061b542189eba8c647c28a64ab0bf18e0f2d43d628',
    providerContract:
      'sha256:68b6fe91d0759179587c5d061b542189eba8c647c28a64ab0bf18e0f2d43d628',
  },
  unicode: {
    canonical:
      '{"B":"\u2028\u2029","a":"日本語 😀","lone":"\\ud800","é":"café","ключ":"значение"}',
    sha256: '0acb335bf6931e65eb98de7217208c89d5dd4f59525a6d4b77d42c35d80d8ac9',
    publishApproval:
      'sha256:v1:0acb335bf6931e65eb98de7217208c89d5dd4f59525a6d4b77d42c35d80d8ac9',
    providerContract:
      'sha256:0acb335bf6931e65eb98de7217208c89d5dd4f59525a6d4b77d42c35d80d8ac9',
  },
  arrays: {
    canonical: '[[],[[1,[2,[3]]]],[{"a":2,"b":1},null,"x"]]',
    sha256: 'cfea104994246cb906685e48d806155b697d06f9e8a68856e518360b732df9a4',
    publishApproval:
      'sha256:v1:cfea104994246cb906685e48d806155b697d06f9e8a68856e518360b732df9a4',
    providerContract:
      'sha256:cfea104994246cb906685e48d806155b697d06f9e8a68856e518360b732df9a4',
  },
  nulls: {
    canonical: '{"a":null,"b":[null,null],"c":{"d":null}}',
    sha256: '2713b3b615d7e09eccadee72c891418568839c137830c8975435b94da7375bf1',
    publishApproval:
      'sha256:v1:2713b3b615d7e09eccadee72c891418568839c137830c8975435b94da7375bf1',
    providerContract:
      'sha256:2713b3b615d7e09eccadee72c891418568839c137830c8975435b94da7375bf1',
  },
  keyOrder: {
    canonical: '{"":6,"10":4,"2":5,"B":2,"a":3,"a b":8,"aa":7,"b":1}',
    sha256: '73d7ebbd08cb883c0f86a0ac7a36204ac28710aec21d87c1f73261c8f3cbabce',
    publishApproval:
      'sha256:v1:73d7ebbd08cb883c0f86a0ac7a36204ac28710aec21d87c1f73261c8f3cbabce',
    providerContract:
      'sha256:73d7ebbd08cb883c0f86a0ac7a36204ac28710aec21d87c1f73261c8f3cbabce',
  },
  numbers: {
    canonical:
      '{"a":0,"b":1e+21,"c":0.1,"d":123456789012345680000,"e":null,"f":null}',
    sha256: '76d5813ae9348dfe5e46e7a4252719b626737e2b3471ae6741570508f64f7262',
    publishApproval:
      'sha256:v1:76d5813ae9348dfe5e46e7a4252719b626737e2b3471ae6741570508f64f7262',
    providerContract:
      'sha256:76d5813ae9348dfe5e46e7a4252719b626737e2b3471ae6741570508f64f7262',
  },
  scalars: {
    canonical: '[true,false,0,"","q\\"uote\\\\ \\n\\t"]',
    sha256: 'e25c4759b114d39f6d09cb52ecaa73048b7895eac82e71226eadf5e47a43fe0f',
    publishApproval:
      'sha256:v1:e25c4759b114d39f6d09cb52ecaa73048b7895eac82e71226eadf5e47a43fe0f',
    providerContract:
      'sha256:e25c4759b114d39f6d09cb52ecaa73048b7895eac82e71226eadf5e47a43fe0f',
  },
  empty: {
    canonical: '{}',
    sha256: '44136fa355b3678a1146ad16f7e8649e94fb4fc21fe77e8310c060f61caaff8a',
    publishApproval:
      'sha256:v1:44136fa355b3678a1146ad16f7e8649e94fb4fc21fe77e8310c060f61caaff8a',
    providerContract:
      'sha256:44136fa355b3678a1146ad16f7e8649e94fb4fc21fe77e8310c060f61caaff8a',
  },
  dateField: {
    canonical: '{"when":{}}',
    sha256: '987a771ced05fb0b25e84ea9704adf2665a9f070cc5215f67bc40fad00746e59',
    publishApproval:
      'sha256:v1:987a771ced05fb0b25e84ea9704adf2665a9f070cc5215f67bc40fad00746e59',
    providerContract:
      'sha256:987a771ced05fb0b25e84ea9704adf2665a9f070cc5215f67bc40fad00746e59',
  },
  nestedUndefined: {
    canonical: '{"a":null,"b":[null,1],"c":{"d":null}}',
    sha256: 'a7dea63332a9630124b444f7ef4774f989a715eff83b23b8896ead071efc63a8',
    publishApproval:
      'sha256:v1:a7dea63332a9630124b444f7ef4774f989a715eff83b23b8896ead071efc63a8',
    providerContract:
      'sha256:a7dea63332a9630124b444f7ef4774f989a715eff83b23b8896ead071efc63a8',
  },
  topUndefined: {
    canonical: 'null',
    sha256: '74234e98afe7498fb5daf1f36ac2d78acc339464f950703b8c019892f982b90b',
    publishApproval:
      'sha256:v1:74234e98afe7498fb5daf1f36ac2d78acc339464f950703b8c019892f982b90b',
    providerContract:
      'sha256:74234e98afe7498fb5daf1f36ac2d78acc339464f950703b8c019892f982b90b',
  },
  topNull: {
    canonical: 'null',
    sha256: '74234e98afe7498fb5daf1f36ac2d78acc339464f950703b8c019892f982b90b',
    publishApproval:
      'sha256:v1:74234e98afe7498fb5daf1f36ac2d78acc339464f950703b8c019892f982b90b',
    providerContract:
      'sha256:74234e98afe7498fb5daf1f36ac2d78acc339464f950703b8c019892f982b90b',
  },
  topString: {
    canonical: '"abc"',
    sha256: '6cc43f858fbb763301637b5af970e2a46b46f461f27e5a0f41e009c59b827b25',
    publishApproval:
      'sha256:v1:6cc43f858fbb763301637b5af970e2a46b46f461f27e5a0f41e009c59b827b25',
    providerContract:
      'sha256:6cc43f858fbb763301637b5af970e2a46b46f461f27e5a0f41e009c59b827b25',
  },
  topNumber: {
    canonical: '42',
    sha256: '73475cb40a568e8da8a045ced110137e159f890ac4da883b6b17dc651b3a8049',
    publishApproval:
      'sha256:v1:73475cb40a568e8da8a045ced110137e159f890ac4da883b6b17dc651b3a8049',
    providerContract:
      'sha256:73475cb40a568e8da8a045ced110137e159f890ac4da883b6b17dc651b3a8049',
  },
};

describe('stableStringify / sha256Hex golden vectors', () => {
  it('covers every fixture', () => {
    expect(Object.keys(GOLDEN).sort()).toEqual(Object.keys(FIXTURES).sort());
  });

  it.each(Object.keys(GOLDEN))(
    'reproduces the legacy output for %s',
    (name) => {
      const expected = GOLDEN[name];
      const canonical = stableStringify(FIXTURES[name]);

      expect(canonical).toBe(expected.canonical);
      expect(sha256Hex(canonical)).toBe(expected.sha256);
      expect(`sha256:v1:${sha256Hex(canonical)}`).toBe(
        expected.publishApproval,
      );
      expect(hashProviderContract(FIXTURES[name])).toBe(
        expected.providerContract,
      );
    },
  );
});
