import { createEntityAttributes } from '@genfeedai/helpers';

export const darkroomEc2InstanceAttributes = createEntityAttributes([
  'instanceId',
  'instanceType',
  'name',
  'role',
  'state',
]);
