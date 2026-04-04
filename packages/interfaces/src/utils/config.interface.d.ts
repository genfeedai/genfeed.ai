import type { NextConfig } from 'next';
import type { PWANextConfigOptions } from '../pwa/pwa.interface';
export interface AppNextConfigOptions {
    appName: string;
    sentryProject: string;
    redirects?: NextConfig['redirects'];
    headers?: NextConfig['headers'];
    sassOptions?: NextConfig['sassOptions'];
    env?: NextConfig['env'];
    output?: NextConfig['output'];
    pwa?: PWANextConfigOptions;
}
//# sourceMappingURL=config.interface.d.ts.map