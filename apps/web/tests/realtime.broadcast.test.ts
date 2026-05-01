import { createHmac } from "node:crypto";

import { afterAll, describe, expect, test } from "vitest";

import {
  TEST_USERS,
  createServiceClient,
  getIngestSecret,
  getIngestUrl,
  getUserId,
  signInAs,
} from "./_helpers";

/**
 * Phase 2 acceptance — realtime broadcast emits to the assigned agent.
 *
 * The flow:
 *   1. Sign in as the MZ agent via magiclink (client carries that user's JWT).
 *   2. Subscribe to private channel `agent:<uid>` with `config.private:true`.
 *      RLS policy `agent_own_topic` on `realtime.messages` (migration 00008)
 *      checks the JWT's `sub` claim against the topic suffix; only the agent
 *      themselves (or hq_admin) can subscribe.
 *   3. POST a fresh signed lead at country_code='MZ' so round-robin assigns
 *      to the only active MZ agent (this user). The AFTER INSERT trigger
 *      `leads_broadcast_agent` then calls `realtime.broadcast_changes()`.
 *   4. Assert the broadcast arrives within 5 s and carries an MZ record.
 */

function sign(body: string, secret: string): string {
  return createHmac("sha256", secret).update(body).digest("hex");
}

describe("realtime broadcast → agent:<uid>", () => {
  let createdLeadId: string | null = null;

  afterAll(async () => {
    if (!createdLeadId) return;
    const admin = createServiceClient();
    await admin.from("lead_events").delete().eq("lead_id", createdLeadId);
    await admin.from("leads").delete().eq("id", createdLeadId);
  });

  test("agent receives broadcast within 5s of an assigned ingest", async () => {
    const agentId = await getUserId(TEST_USERS.agentMz);
    const agent = await signInAs(TEST_USERS.agentMz);
    const topic = `agent:${agentId}`;

    // Promise that resolves on first matching broadcast event, or rejects on
    // 5 s timeout. Set up BEFORE the ingest so we can't miss the broadcast.
    type BroadcastEnvelope = {
      payload?: {
        record?: { country_code?: string; id?: string };
        operation?: string;
      };
    };
    // The agent broadcast trigger fires on (INSERT with assigned_to set) OR
    // (UPDATE OF assigned_to). The webhook ingest path creates the lead with
    // assigned_to=NULL and then UPDATEs it via assign_lead(), so the event
    // shape we get is `UPDATE`, not `INSERT`. Subscribe with event:'*' to
    // catch whichever the trigger ends up emitting — keeps the test honest
    // against the production code path.
    const received = new Promise<BroadcastEnvelope>((resolve, reject) => {
      const channel = agent.channel(topic, { config: { private: true } });
      const timer = setTimeout(() => {
        agent.removeChannel(channel);
        reject(new Error(`no broadcast on ${topic} within 5s`));
      }, 5000);

      channel
        .on("broadcast", { event: "*" }, (msg) => {
          clearTimeout(timer);
          agent.removeChannel(channel);
          resolve(msg as BroadcastEnvelope);
        })
        .subscribe((status) => {
          if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
            clearTimeout(timer);
            agent.removeChannel(channel);
            reject(new Error(`subscribe failed: ${status}`));
          }
        });
    });

    // Give Realtime a beat to confirm the subscription before firing the
    // ingest. 500 ms is comfortably more than the SDK's local handshake.
    await new Promise((r) => setTimeout(r, 500));

    const submittedAt = new Date().toISOString();
    const body = JSON.stringify({
      form_slug: "starlink",
      country_code: "MZ",
      submitted_at: submittedAt,
      name: "Realtime Test",
      email: `realtime-${Date.now()}@paratus.test`,
      message: "phase 2 realtime vitest",
    });
    const res = await fetch(getIngestUrl(), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Paratus-Signature": sign(body, getIngestSecret()),
      },
      body,
    });
    expect(res.status).toBe(201);
    const ingestJson = (await res.json()) as {
      lead_id: string;
      agent_id: string | null;
    };
    createdLeadId = ingestJson.lead_id;
    // Sanity: round-robin assigned to this agent (only active MZ agent).
    expect(ingestJson.agent_id).toBe(agentId);

    const event = await received;
    expect(event.payload?.record?.country_code).toBe("MZ");
    expect(event.payload?.record?.id).toBe(ingestJson.lead_id);
  });
});
