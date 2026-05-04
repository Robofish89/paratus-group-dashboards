import { z } from "zod";

/**
 * Cursor helper for the country-admin lead list (plan 06-04 task 1).
 *
 * The list is sorted by `(created_at DESC, id DESC)` — composite key so ties
 * on identical `created_at` resolve deterministically by UUID. The cursor
 * encodes the last visible row's `(created_at, id)` so the next page picks
 * up strictly after that tuple.
 *
 * URL contract: `?cursor=<base64url>` — base64url is URL-safe (no `=`
 * padding, no `+` / `/`) so cursors survive copy-paste in URLs without
 * additional escaping.
 *
 * Decoding is permissive: any malformed cursor returns null rather than
 * throwing, which makes "go to first page" the safe recovery for a hand-
 * edited URL.
 */

export interface LeadCursor {
  created_at: string;
  id: string;
}

const cursorSchema = z.object({
  created_at: z.string().min(1),
  id: z.string().uuid(),
});

export function encodeCursor(cursor: LeadCursor): string {
  const json = JSON.stringify(cursor);
  return Buffer.from(json, "utf8").toString("base64url");
}

export function decodeCursor(value: string | null | undefined): LeadCursor | null {
  if (!value) return null;
  try {
    const json = Buffer.from(value, "base64url").toString("utf8");
    const parsed = JSON.parse(json) as unknown;
    const result = cursorSchema.safeParse(parsed);
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}
