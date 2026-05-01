import { createHmac } from "node:crypto";

import { afterAll, describe, expect, test } from "vitest";

import {
  createServiceClient,
  getIngestSecret,
  getIngestUrl,
} from "../test-support/helpers";

/**
 * Phase 2 acceptance — webhook idempotency + signature gate.
 *
 * Hits the live `/api/leads/ingest` route with HMAC-signed payloads:
 *
 *   1. Fresh body                → 201, duplicate=false
 *   2. Same body again           → 200, duplicate=true, SAME lead_id
 *   3. Tampered signature        → 401
 *   4. Malformed JSON            → 400
 *
 * The endpoint URL defaults to http://localhost:3012/api/leads/ingest; set
 * INGEST_TEST_URL to point at a deployed environment if needed.
 */

function sign(body: string, secret: string): string {
  return createHmac("sha256", secret).update(body).digest("hex");
}

describe("POST /api/leads/ingest — idempotency + signature", () => {
  const url = getIngestUrl();
  const secret = getIngestSecret();

  // Carry the bucket-stable submitted_at across the suite so the second POST
  // lands in the same 5-minute dedupe slot as the first.
  const submittedAt = new Date().toISOString();
  const uniqueEmail = `idempotency-${Date.now()}@paratus.test`;
  const body = JSON.stringify({
    form_slug: "starlink",
    country_code: "MZ",
    submitted_at: submittedAt,
    name: "Idempotency Test",
    email: uniqueEmail,
    message: "phase 2 idempotency vitest",
  });
  let createdLeadId: string | null = null;

  afterAll(async () => {
    // Cleanup: delete the test lead so the suite can be re-run repeatedly
    // without stacking dedupe-window artefacts across days.
    if (!createdLeadId) return;
    const admin = createServiceClient();
    await admin.from("lead_events").delete().eq("lead_id", createdLeadId);
    await admin.from("leads").delete().eq("id", createdLeadId);
  });

  test("first POST → 201 with duplicate=false", async () => {
    const sig = sign(body, secret);
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Paratus-Signature": sig,
      },
      body,
    });
    expect(res.status).toBe(201);
    const json = (await res.json()) as {
      lead_id: string;
      agent_id: string | null;
      duplicate: boolean;
    };
    expect(json.duplicate).toBe(false);
    expect(typeof json.lead_id).toBe("string");
    createdLeadId = json.lead_id;
  });

  test("second POST with identical body → 200 with duplicate=true and same lead_id", async () => {
    const sig = sign(body, secret);
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Paratus-Signature": sig,
      },
      body,
    });
    expect(res.status).toBe(200);
    const json = (await res.json()) as { lead_id: string; duplicate: boolean };
    expect(json.duplicate).toBe(true);
    expect(json.lead_id).toBe(createdLeadId);
  });

  test("tampered signature → 401", async () => {
    const sig = sign(body, secret);
    // Flip a single hex nibble. timingSafeEqual will reject after the equal-
    // length check passes; a bad-length sig would have been a different code
    // path (still 401), so we tamper while preserving length.
    const tampered = (sig[0] === "0" ? "1" : "0") + sig.slice(1);
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Paratus-Signature": tampered,
      },
      body,
    });
    expect(res.status).toBe(401);
  });

  test("malformed JSON → 400", async () => {
    const malformed = "{not valid json";
    const sig = sign(malformed, secret);
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Paratus-Signature": sig,
      },
      body: malformed,
    });
    expect(res.status).toBe(400);
  });
});
