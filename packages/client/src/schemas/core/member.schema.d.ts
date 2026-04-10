import { z } from 'zod';
export declare const inviteMemberSchema: z.ZodObject<
  {
    email: z.ZodString;
    firstName: z.ZodOptional<z.ZodString>;
    lastName: z.ZodOptional<z.ZodString>;
    role: z.ZodString;
  },
  z.core.$strip
>;
export type InviteMemberSchema = z.infer<typeof inviteMemberSchema>;
export declare const memberEditSchema: z.ZodObject<
  {
    brands: z.ZodArray<z.ZodString>;
  },
  z.core.$strip
>;
export type MemberEditSchema = z.infer<typeof memberEditSchema>;
//# sourceMappingURL=member.schema.d.ts.map
