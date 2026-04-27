import { z } from 'zod';

/**
 * Login form input. The 8/72 password bounds match Supabase's own bcrypt
 * limits — anything longer is silently truncated by the auth API, so we
 * reject it at the edge for clearer UX.
 */
export const loginSchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(8).max(72),
});

export type LoginInput = z.infer<typeof loginSchema>;
