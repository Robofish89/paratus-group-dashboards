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
 *   2. Subscribe to private channel `agent:<uid>` with `config.private:true`
 *      and BLOCK on the SUBSCRIBED handshake — Realtime drops broadcasts
 *      received before a channel is fully joined, so any fixed-timer delay
 *      is unsafe under cold-start conditions.
 *   3. POST a fresh signed lead at country_code='MZ' so round-robin assigns
 *      to the only active MZ agent (this user). The AFTER UPDATE trigger
 *      `leads_broadcast_agent` then calls `realtime.broadcast_changes()`.
 *   4. Assert the broadcast arrives within 5 s and carries an MZ record.
 *
 * Note on event:'*'. The agent broadcast trigger fires on (INSERT with
 * assigned_to set) OR (UPDATE OF assigned_to). The webhook ingest path
 * creates the lead with assigned_to=NULL then UPDATEs it via assign_lead(),
 * so the natural event is `UPDATE`, not `INSERT`. Listening on '*' catches
 * whichever the trigger emits and keeps the test honest against the real
 * production code path.
 */

type BroadcastEnvelope = {
  payload?: {
    record?: { country_code?: string; id?: string };
    operation?: string;
  };
};

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

    // Single buffer for any broadcast that arrives — also serves as a "next
    // event" promise so the assertion side can await whichever comes first.
    const queue: BroadcastEnvelope[] = [];
    let waiter: ((env: BroadcastEnvelope) => void) | null = null;
    const onEvent = (env: BroadcastEnvelope) => {
      if (waiter) {
        const w = waiter;
        waiter = null;
        w(env);
      } else {
        queue.push(env);
      }
    };
    const next = (timeoutMs: number) =>
      new Promise<BroadcastEnvelope>((resolve, reject) => {
        if (queue.length > 0) return resolve(queue.shift()!);
        const timer = setTimeout(
          () => reject(new Error(`no broadcast on ${topic} within ${timeoutMs}ms`)),
          timeoutMs,
        );
        waiter = (env) => {
          clearTimeout(timer);
          resolve(env);
        };
      });

    const channel = agent.channel(topic, { config: { private: true } });
    channel.on("broadcast", { event: "*" }, (msg) =>
      onEvent(msg as BroadcastEnvelope),
    );

    const subscribed = new Promise<void>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error(`subscribe to ${topic} timed out after 8s`)),
        8000,
      );
      channel.subscribe((status) => {
        if (status === "SUBSCRIBED") {
          clearTimeout(timer);
          resolve();
        } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          clearTimeout(timer);
          reject(new Error(`subscribe failed: ${status}`));
        }
      });
    });

    try {
      await subscribed;

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

      const event = await next(5000);
      expect(event.payload?.record?.country_code).toBe("MZ");
      expect(event.payload?.record?.id).toBe(ingestJson.lead_id);
    } finally {
      await agent.removeChannel(channel);
    }
  });
});
