import {
  GENFEED_SUBDOMAINS,
  getGenfeedCorsOrigins,
} from '@libs/config/cors.config';

describe('CORS Configuration', () => {
  describe('getGenfeedCorsOrigins', () => {
    describe('Development Mode', () => {
      it('should return development origins', () => {
        const origins = getGenfeedCorsOrigins({
          isDevelopment: true,
        });

        expect(origins).toContainEqual(expect.any(RegExp));
        expect(origins).toContain('https://chat.openai.com');
        expect(origins).toContain('https://chatgpt.com');
      });

      it('should allow localhost and local.genfeed.ai for ports 3000-3999', () => {
        const origins = getGenfeedCorsOrigins({
          isDevelopment: true,
        });

        const localPattern = origins.find(
          (o) =>
            o instanceof RegExp &&
            o.source.includes('localhost') &&
            o.source.includes('local'),
        ) as RegExp;

        expect(localPattern).toBeDefined();
        // Server ports
        expect(localPattern.test('http://localhost:3000')).toBe(true); // Docs
        expect(localPattern.test('http://localhost:3001')).toBe(true); // API
        expect(localPattern.test('http://localhost:3010')).toBe(true);
        expect(localPattern.test('http://local.genfeed.ai:3010')).toBe(true);
        // Web app ports (3100-3108)
        expect(localPattern.test('http://localhost:3100')).toBe(true); // Academy
        expect(localPattern.test('http://localhost:3104')).toBe(true); // Login
        expect(localPattern.test('http://localhost:3108')).toBe(true); // Workflows
        expect(localPattern.test('http://local.genfeed.ai:3106')).toBe(true); // Studio
        // Upper boundary
        expect(localPattern.test('http://localhost:3999')).toBe(true);
        // Out of range
        expect(localPattern.test('http://localhost:4000')).toBe(false);
        expect(localPattern.test('http://localhost:2999')).toBe(false);
      });

      it('should allow all Chrome extensions in development', () => {
        const origins = getGenfeedCorsOrigins({
          isDevelopment: true,
        });

        const chromeExtPattern = origins.find(
          (o) => o instanceof RegExp && o.source.includes('chrome-extension'),
        ) as RegExp;

        expect(chromeExtPattern).toBeDefined();
        expect(chromeExtPattern.test('chrome-extension://abc123')).toBe(true);
        expect(chromeExtPattern.test('chrome-extension://xyz789def456')).toBe(
          true,
        );
      });

      it('should include additional origins in development', () => {
        const origins = getGenfeedCorsOrigins({
          additionalOrigins: ['https://custom.domain.com'],
          isDevelopment: true,
        });

        expect(origins).toContain('https://custom.domain.com');
      });
    });

    describe('Production Mode', () => {
      it('should return production origins', () => {
        const origins = getGenfeedCorsOrigins({
          isDevelopment: false,
        });

        expect(origins).toContainEqual(expect.any(RegExp));
        expect(origins).toContain('https://chat.openai.com');
        expect(origins).toContain('https://chatgpt.com');
      });

      it('should allow main domain', () => {
        const origins = getGenfeedCorsOrigins({
          isDevelopment: false,
        });

        const mainDomainPattern = origins.find(
          (o) =>
            o instanceof RegExp &&
            o.test('https://genfeed.ai') &&
            !o.test('https://admin.genfeed.ai'),
        ) as RegExp;

        expect(mainDomainPattern).toBeDefined();
        expect(mainDomainPattern.test('https://genfeed.ai')).toBe(true);
      });

      it('should allow all documented subdomains', () => {
        const origins = getGenfeedCorsOrigins({
          isDevelopment: false,
        });

        const subdomainPattern = origins.find(
          (o) => o instanceof RegExp && o.test('https://admin.genfeed.ai'),
        ) as RegExp;

        expect(subdomainPattern).toBeDefined();

        // Test all documented subdomains
        GENFEED_SUBDOMAINS.forEach((subdomain) => {
          expect(subdomainPattern.test(`https://${subdomain}.genfeed.ai`)).toBe(
            true,
          );
        });
      });

      it('should not allow chrome extensions without extension ID', () => {
        const origins = getGenfeedCorsOrigins({
          isDevelopment: false,
        });

        const hasWildcardExtension = origins.some(
          (o) =>
            o instanceof RegExp &&
            o.source.includes('chrome-extension') &&
            o.source.includes('.*'),
        );

        expect(hasWildcardExtension).toBe(false);
      });

      it('should allow specific Chrome extension when ID is provided', () => {
        const extensionId = 'abc123xyz789';
        const origins = getGenfeedCorsOrigins({
          chromeExtensionId: extensionId,
          isDevelopment: false,
        });

        expect(origins).toContain(`chrome-extension://${extensionId}`);
      });

      it('should include additional origins in production', () => {
        const origins = getGenfeedCorsOrigins({
          additionalOrigins: [
            'https://mcp.genfeed.ai',
            /^https:\/\/custom\..*$/,
          ],
          isDevelopment: false,
        });

        expect(origins).toContain('https://mcp.genfeed.ai');
        expect(origins).toContainEqual(/^https:\/\/custom\..*$/);
      });
    });

    describe('Security', () => {
      it('should not allow http in production main domain', () => {
        const origins = getGenfeedCorsOrigins({
          isDevelopment: false,
        });

        const mainDomainPattern = origins.find(
          (o) =>
            o instanceof RegExp &&
            o.test('https://genfeed.ai') &&
            !o.test('https://admin.genfeed.ai'),
        ) as RegExp;

        expect(mainDomainPattern.test('http://genfeed.ai')).toBe(false);
      });

      it('should not allow http in production subdomains', () => {
        const origins = getGenfeedCorsOrigins({
          isDevelopment: false,
        });

        const subdomainPattern = origins.find(
          (o) => o instanceof RegExp && o.test('https://admin.genfeed.ai'),
        ) as RegExp;

        expect(subdomainPattern.test('http://admin.genfeed.ai')).toBe(false);
        expect(subdomainPattern.test('http://app.genfeed.ai')).toBe(false);
      });

      it('should not allow unauthorized subdomains', () => {
        const origins = getGenfeedCorsOrigins({
          isDevelopment: false,
        });

        const subdomainPattern = origins.find(
          (o) => o instanceof RegExp && o.test('https://admin.genfeed.ai'),
        ) as RegExp;

        expect(subdomainPattern.test('https://evil.genfeed.ai')).toBe(false);
        expect(subdomainPattern.test('https://unauthorized.genfeed.ai')).toBe(
          false,
        );
      });
    });
  });

  describe('GENFEED_SUBDOMAINS', () => {
    it('should include all standard subdomains', () => {
      const expectedSubdomains = [
        'admin',
        'app',
        'chatgpt',
        'docs',
        'login',
        'marketplace',
        'studio',
        'website',
        'workflows',
      ];

      expectedSubdomains.forEach((subdomain) => {
        expect(GENFEED_SUBDOMAINS).toContain(subdomain);
      });
    });
  });
});
