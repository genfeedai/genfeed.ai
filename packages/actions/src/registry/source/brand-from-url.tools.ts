import { BRAND_FROM_URL_CREDIT_COST } from '@genfeedai/contracts/constants/tool-credit.constant';
import type { SourceTool } from '../../interfaces/source-tool.interface';

export const BRAND_FROM_URL_TOOLS: SourceTool[] = [
  {
    creditCost: BRAND_FROM_URL_CREDIT_COST,
    description:
      'Create a brand from a website URL with a draft guide and analyzed voice. Organization owners and admins only. Costs one credit on success. Set approve explicitly to approve the guide. Poll get_brand_scan_status if scanStatus is running.',
    name: 'create_brand_from_url',
    parameters: {
      properties: {
        url: {
          description: 'Website URL using http or https.',
          type: 'string',
        },
        label: {
          description: 'Brand label. Defaults to the website hostname.',
          type: 'string',
        },
        approve: {
          description: 'Explicitly approve the guide. Defaults to false.',
          type: 'boolean',
          default: false,
        },
      },
      required: ['url'],
      type: 'object',
    },
    requiredRole: 'admin',
  },
  {
    creditCost: 0,
    description:
      'Read the current website scan, guide revision and completeness for a brand created from a URL.',
    name: 'get_brand_scan_status',
    parameters: {
      properties: {
        brandId: {
          description: 'Brand ID returned by create_brand_from_url.',
          type: 'string',
        },
      },
      required: ['brandId'],
      type: 'object',
    },
    requiredRole: 'user',
  },
];
