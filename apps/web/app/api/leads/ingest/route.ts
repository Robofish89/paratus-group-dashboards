import 'server-only';

import { createHmac, timingSafeEqual } from 'node:crypto';

import { ingestLead, isIngestLeadError } from '@repo/supabase/dal';
import { ingestSchema } from '@repo/supabase/schemas';

/**
 * Webhook ingest endpoint — Path 1 of PRD/lead-ingestion.md.
 *
 * Order of operations is RESEARCH §Pattern 4 (immutable):
 *   1. Read raw body via req.text()  (must not consume as JSON first)
 *   2. HMAC-SHA256 with PARATUS_INGEST_SECRET; compare via timingSafeEqual
 *   3. JSON.parse + Zod validate
 *   4. Call ingest_lead() RPC via service-role DAL
 *
 * Response codes:
 *   201 — fresh lead created
 *   200 — duplicate (same form/contact within 5-min bucket)
 *   400 — JSON parse error or Zod validation failure
 *   401 — missing or wrong HMAC signature
 *   422 — RPC returned a known error envelope (unknown_country, unknown_form)
 *   500 — unexpected error / missing PARATUS_INGEST_SECRET / RPC throw
 *
 * Runtime: Node — node:crypto.timingSafeEqual is not available on Edge.
 */
export const runtime = 'nodejs';

interface IngestErrorLog {
  event: 'ingest_error';
  message: string;
  stack?: string;
}

function logError(message: string, stack?: string): void {
  const entry: IngestErrorLog = { event: 'ingest_error', message };
  if (stack) entry.stack = stack;
  // Structured stderr — Vercel ships this to the runtime logs.
  process.stderr.write(JSON.stringify(entry) + '\n');
}

export async function POST(req: Request): Promise<Response> {
  try {
    const secret = process.env.PARATUS_INGEST_SECRET;
    if (!secret) {
      logError('PARATUS_INGEST_SECRET not set');
      return new Response('server misconfigured', { status: 500 });
    }

    // 1. Read raw body ONCE — must precede any JSON parse so the bytes match
    //    what the sender hashed.
    const raw = await req.text();

    // 2. Constant-time HMAC compare. Buffers must be equal-length or
    //    timingSafeEqual throws — guard up front.
    const provided = req.headers.get('x-paratus-signature') ?? '';
    const expected = createHmac('sha256', secret).update(raw).digest('hex');
    const providedBuf = Buffer.from(provided, 'hex');
    const expectedBuf = Buffer.from(expected, 'hex');
    if (
      providedBuf.length !== expectedBuf.length ||
      !timingSafeEqual(providedBuf, expectedBuf)
    ) {
      return new Response('invalid signature', { status: 401 });
    }

    // 3. Parse JSON, then Zod-validate.
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return Response.json({ error: 'invalid_json' }, { status: 400 });
    }

    const validated = ingestSchema.safeParse(parsed);
    if (!validated.success) {
      return Response.json(
        { error: validated.error.flatten() },
        { status: 400 },
      );
    }

    // 4. Call ingest_lead() RPC. The RPC is atomic: validate FK → dedupe →
    //    insert → log → assign.
    const result = await ingestLead(validated.data);

    if (isIngestLeadError(result)) {
      return Response.json(result, { status: 422 });
    }

    return Response.json(result, {
      status: result.duplicate ? 200 : 201,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const stack = err instanceof Error ? err.stack : undefined;
    logError(message, stack);
    return new Response('internal error', { status: 500 });
  }
}
