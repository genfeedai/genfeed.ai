import { createEntityAttributes } from '@genfeedai/helpers';

export const fleetEc2InstanceAttributes = createEntityAttributes([
  'instanceId',
  'instanceType',
  'name',
  'role',
  'state',
]);
