import { z } from 'zod';

/**
 * Zod schema for one CSV row in the country-admin bulk import path
 * (`POST /api/leads/import-csv`).
 *
 * Mirrors the webhook ingest schema (Path 1) so the same `ingest_lead()` RPC
 * accepts both, but allows `submitted_at` to come in either ISO format or
 * common spreadsheet formats (Excel-exported "2026-04-29 11:00:00" etc.) by
 * coercing through `new Date(...)` first.
 *
 * Either `email` or `phone` is required — `ingest_lead()` itself enforces the
 * same rule, but rejecting at the edge gives the importer a precise row index
 * in the error response.
 */
export const csvRowSchema = z
  .object({
    form_slug: z.string().min(1),
    country_code: z.string().length(2).regex(/^[A-Z]{2}$/),
    submitted_at: z.preprocess(
      (v) => {
        if (typeof v !== 'string') return v;
        const trimmed = v.trim();
        if (!trimmed) return v;
        const d = new Date(trimmed);
        return Number.isNaN(d.getTime()) ? v : d.toISOString();
      },
      z.string().datetime(),
    ),
    name: z.string().min(1).max(200),
    email: z
      .string()
      .email()
      .optional()
      .nullable()
      .or(z.literal('').transform(() => null)),
    phone: z
      .string()
      .min(5)
      .max(40)
      .optional()
      .nullable()
      .or(z.literal('').transform(() => null)),
    message: z
      .string()
      .max(5000)
      .optional()
      .nullable()
      .or(z.literal('').transform(() => null)),
    source_url: z
      .string()
      .url()
      .optional()
      .nullable()
      .or(z.literal('').transform(() => null)),
    utm_source: z
      .string()
      .max(120)
      .optional()
      .nullable()
      .or(z.literal('').transform(() => null)),
    utm_medium: z
      .string()
      .max(120)
      .optional()
      .nullable()
      .or(z.literal('').transform(() => null)),
    utm_campaign: z
      .string()
      .max(120)
      .optional()
      .nullable()
      .or(z.literal('').transform(() => null)),
  })
  .refine((d) => Boolean(d.email) || Boolean(d.phone), {
    message: 'Either email or phone is required',
  });

export type CsvRow = z.infer<typeof csvRowSchema>;
