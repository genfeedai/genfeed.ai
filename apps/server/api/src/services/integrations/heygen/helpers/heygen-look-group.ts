import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { z } from 'zod';

const lookDetailSchema = z.object({
  data: z.object({ group_id: z.string().nullish() }),
});

/**
 * The avatar group of a look, used only to narrow the filtered listing that
 * proves ownership. Never trusted as proof itself, so any lookup failure
 * falls back to the unfiltered listing.
 */
export async function readHeyGenLookGroupId(
  httpService: HttpService,
  url: string,
  headers: Record<string, string>,
): Promise<string | null> {
  try {
    const response = await firstValueFrom(
      httpService.get<unknown>(url, { headers, timeout: 15_000 }),
    );
    const parsed = lookDetailSchema.safeParse(response.data);
    return parsed.success ? (parsed.data.data.group_id ?? null) : null;
  } catch {
    return null;
  }
}
