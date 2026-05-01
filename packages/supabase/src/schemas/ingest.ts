import { z } from 'zod';

/**
 * Webhook ingest body schema. Verbatim contract for the HTTP-side `/api/leads/ingest`
 * route + the n8n bridge — every required field comes straight from the form
 * payload that paratus.africa POSTs (or that n8n forwards). Optional fields are
 * tolerated so the upstream form definition can grow without breaking ingest.
 *
 * Mirrors the `payload` argument of the `ingest_lead(jsonb)` RPC shipped in
 * migration 00007 — the route handler does not transform fields, only Zod-validates.
 */
export const ingestSchema = z
  .object({
    form_slug: z.string().min(1),
    country_code: z.string().length(2).regex(/^[A-Z]{2}$/),
    submitted_at: z.string().datetime(),
    name: z.string().min(1).max(200),
    email: z.string().email().optional().nullable(),
    phone: z.string().min(5).max(40).optional().nullable(),
    message: z.string().max(5000).optional().nullable(),
    source_url: z.string().url().optional().nullable(),
    utm_source: z.string().max(120).optional().nullable(),
    utm_medium: z.string().max(120).optional().nullable(),
    utm_campaign: z.string().max(120).optional().nullable(),
    raw_payload: z.record(z.string(), z.unknown()).optional(),
  })
  .refine((d) => Boolean(d.email) || Boolean(d.phone), {
    message: 'Either email or phone is required',
  });

export type IngestInput = z.infer<typeof ingestSchema>;
