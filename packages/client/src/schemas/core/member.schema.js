import { z } from 'zod';
export const inviteMemberSchema = z.object({
  email: z.string().email('Invalid email address').min(1, 'Email is required'),
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  role: z.string().min(1, 'Role is required'),
});
export const memberEditSchema = z.object({
  brands: z.array(z.string()).min(1, 'At least one brand must be selected'),
});
//# sourceMappingURL=member.schema.js.map
