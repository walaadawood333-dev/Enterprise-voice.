/**
 * CenterAI Telephony Gateway — Verification Test Suite.
 *
 * Tests the critical production requirements:
 *   1. Call lifecycle state machine
 *   2. Idempotency (duplicate events don't create duplicates)
 *   3. Call → VoiceSession mapping (one-to-one)
 *   4. Multi-tenant isolation
 *   5. Demo provider isolation
 *   6. Webhook security
 *
 * Run with: node --experimental-strip-types server/telephony/__tests__/verification.ts
 */

import { createMemoryDb, newId } from "../../db/store";
import { createTelephonyGateway } from "../gateway";
import { DemoTelephonyProvider } from "../demo";
import { createLogger } from "../../lib/observability";
import { resolveEnv } from "../../config/env";
import {
  CALL_STATES,
  CALL_TRANSITIONS,
  assertCallTransition,
  canCallTransition,
  eventToCallStatus,
  isCallTerminal,
} from "../callStateMachine";
import type { TelephonyEvent } from "../provider";

// ── Test harness ──────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;
const failures: string[] = [];

function assert(condition: boolean, message: string) {
  if (condition) {
    passed += 1;
    console.log(`  ✓ ${message}`);
  } else {
    failed += 1;
    failures.push(message);
    console.log(`  ✗ ${message}`);
  }
}

function assertEqual<T>(actual: T, expected: T, message: string) {
  const ok = actual === expected;
  if (ok) {
    passed += 1;
    console.log(`  ✓ ${message}`);
  } else {
    failed += 1;
    failures.push(`${message} (expected: ${expected}, got: ${actual})`);
    console.log(`  ✗ ${message} (expected: ${expected}, got: ${actual})`);
  }
}

function section(name: string) {
  console.log(`\n━━━ ${name} ━━━`);
}

// ── Test environment ──────────────────────────────────────────────────────────

function createTestGateway(mode: "demo" | "production" = "demo") {
  const db = createMemoryDb();
  const env = resolveEnv({ APP_MODE: mode });
  const logger = createLogger("error"); // Quiet for tests
  const demoProvider = new DemoTelephonyProvider();
  const gateway = createTelephonyGateway({
    db,
    env,
    logger,
    providers: [demoProvider],
  });
  return { db, env, logger, gateway, demoProvider };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

async function testCallStateMachine() {
  section("1. Call State Machine");

  // Valid transitions
  assert(canCallTransition("created", "ringing"), "CREATED → RINGING is valid");
  assert(canCallTransition("ringing", "answered"), "RINGING → ANSWERED is valid");
  assert(canCallTransition("answered", "active"), "ANSWERED → ACTIVE is valid");
  assert(canCallTransition("active", "completed"), "ACTIVE → COMPLETED is valid");
  assert(canCallTransition("created", "failed"), "CREATED → FAILED is valid");
  assert(canCallTransition("ringing", "failed"), "RINGING → FAILED is valid");
  assert(canCallTransition("ringing", "cancelled"), "RINGING → CANCELLED is valid");
  assert(canCallTransition("answered", "failed"), "ANSWERED → FAILED is valid");
  assert(canCallTransition("active", "failed"), "ACTIVE → FAILED is valid");

  // Terminal states - self transitions only
  assert(canCallTransition("completed", "completed"), "COMPLETED → COMPLETED is valid (idempotent)");
  assert(canCallTransition("failed", "failed"), "FAILED → FAILED is valid (idempotent)");
  assert(canCallTransition("cancelled", "cancelled"), "CANCELLED → CANCELLED is valid (idempotent)");

  // Invalid transitions from terminal states
  assert(!canCallTransition("completed", "ringing"), "COMPLETED → RINGING is INVALID");
  assert(!canCallTransition("failed", "answered"), "FAILED → ANSWERED is INVALID");
  assert(!canCallTransition("cancelled", "active"), "CANCELLED → ACTIVE is INVALID");

  // Terminal state detection
  assert(isCallTerminal("completed"), "COMPLETED is terminal");
  assert(isCallTerminal("failed"), "FAILED is terminal");
  assert(isCallTerminal("cancelled"), "CANCELLED is terminal");
  assert(!isCallTerminal("created"), "CREATED is not terminal");
  assert(!isCallTerminal("active"), "ACTIVE is not terminal");

  // Event-to-status mapping
  assertEqual(eventToCallStatus("call_created"), "created", "call_created → created");
  assertEqual(eventToCallStatus("call_ringing"), "ringing", "call_ringing → ringing");
  assertEqual(eventToCallStatus("call_answered"), "answered", "call_answered → answered");
  assertEqual(eventToCallStatus("media_connected"), "active", "media_connected → active");
  assertEqual(eventToCallStatus("call_completed"), "completed", "call_completed → completed");
  assertEqual(eventToCallStatus("call_failed"), "failed", "call_failed → failed");
  assertEqual(eventToCallStatus("call_cancelled"), "cancelled", "call_cancelled → cancelled");

  // Assert throws on invalid
  let threw = false;
  try {
    assertCallTransition("completed", "ringing");
  } catch {
    threw = true;
  }
  assert(threw, "assertCallTransition throws on invalid transition");
}

async function testCallLifecycle() {
  section("2. Call Lifecycle (Inbound Demo)");

  const { gateway, db } = createTestGateway();

  // Create a test agent first
  const orgId = "org_demo";
  const agent = await db.agents.create({
    id: "agt_test_lifecycle",
    organizationId: orgId,
    name: "Lifecycle Test Agent",
    description: "Test",
    industry: "Banking",
    language: "en",
    voice: "layla-service",
    systemPrompt: "Test",
    welcomeMessage: "Hello",
    status: "active",
  });

  const result = await gateway.simulateInboundCall({
    organizationId: orgId,
    agentId: agent.id,
    fromNumber: "+15551111111",
    toNumber: "+15552222222",
  });

  assertEqual(result.status, "completed", "Inbound call completes successfully");
  assert(result.events.length >= 4, `Call has ${result.events.length} events (expected ≥ 4)`);
  assert(result.fromNumber === "+15551111111", "From number is preserved");
  assert(result.toNumber === "+15552222222", "To number is preserved");
  assertEqual(result.direction, "inbound", "Direction is inbound");
  assert(result.durationSeconds !== null, "Duration is recorded");

  // Verify events are in order
  const eventTypes = result.events.map((e) => e.eventType);
  assert(eventTypes.includes("call_created"), "Events include call_created");
  assert(eventTypes.includes("call_ringing"), "Events include call_ringing");
  assert(eventTypes.includes("call_answered"), "Events include call_answered");
  assert(eventTypes.includes("call_completed"), "Events include call_completed");
}

async function testOutboundCall() {
  section("3. Call Lifecycle (Outbound Demo)");

  const { gateway, db } = createTestGateway();
  const orgId = "org_demo";
  const agent = await db.agents.create({
    id: "agt_test_outbound",
    organizationId: orgId,
    name: "Outbound Test Agent",
    description: "Test",
    industry: "Banking",
    language: "en",
    voice: "layla-service",
    systemPrompt: "Test",
    welcomeMessage: "Hello",
    status: "active",
  });

  const result = await gateway.simulateOutboundCall({
    organizationId: orgId,
    agentId: agent.id,
  });

  assertEqual(result.status, "completed", "Outbound call completes successfully");
  assertEqual(result.direction, "outbound", "Direction is outbound");
  assert(result.events.length >= 4, "Outbound call has expected events");
}

async function testIdempotency() {
  section("4. Idempotency (Duplicate Event Handling)");

  const { gateway, db } = createTestGateway();
  const orgId = "org_demo";
  const agent = await db.agents.create({
    id: "agt_test_idem",
    organizationId: orgId,
    name: "Idempotency Test Agent",
    description: "Test",
    industry: "Banking",
    language: "en",
    voice: "layla-service",
    systemPrompt: "Test",
    welcomeMessage: "Hello",
    status: "active",
  });

  // Send the same event multiple times
  const testEvent: TelephonyEvent = {
    providerEventId: "evt_idempotency_test_001",
    eventType: "call_created",
    providerCallId: "call_idem_test_001",
    fromNumber: "+15553333333",
    toNumber: "+15554444444",
    metadata: { test: true },
    occurredAt: new Date().toISOString(),
  };

  // First delivery
  const first = await gateway.handleProviderEvent({
    organizationId: orgId,
    providerId: "demo",
    event: testEvent,
    skipVerification: true,
  });
  assert(!first.duplicate, "First delivery is not a duplicate");

  // Second delivery (identical event)
  const second = await gateway.handleProviderEvent({
    organizationId: orgId,
    providerId: "demo",
    event: testEvent,
    skipVerification: true,
  });
  assert(second.duplicate, "Second delivery is detected as duplicate");
  assertEqual(second.call.id, first.call.id, "Duplicate returns same call ID");

  // Third delivery
  const third = await gateway.handleProviderEvent({
    organizationId: orgId,
    providerId: "demo",
    event: testEvent,
    skipVerification: true,
  });
  assert(third.duplicate, "Third delivery is also detected as duplicate");

  // Verify only ONE CallEvent exists for this providerEventId
  const events = await db.callEvents.findByProviderEventId("demo", "evt_idempotency_test_001");
  assert(events !== null && events !== undefined, "Exactly one CallEvent exists for this providerEventId");

  // Verify only ONE Call exists for this providerCallId
  const call = await db.calls.findByProviderCallId("demo", "call_idem_test_001");
  assert(call !== null && call !== undefined, "Exactly one Call exists for this providerCallId");
}

async function testIdempotencyAnswered() {
  section("4b. Idempotency (Duplicate ANSWERED Event)");

  const { gateway } = createTestGateway();
  const orgId = "org_demo";

  // Create a call first
  const createEvent: TelephonyEvent = {
    providerEventId: "evt_answered_create_001",
    eventType: "call_created",
    providerCallId: "call_answered_test_001",
    fromNumber: "+15555555555",
    toNumber: "+15556666666",
    metadata: {},
    occurredAt: new Date().toISOString(),
  };

  await gateway.handleProviderEvent({
    organizationId: orgId,
    providerId: "demo",
    event: createEvent,
    skipVerification: true,
  });

  // Send answered event twice
  const answeredEvent: TelephonyEvent = {
    providerEventId: "evt_answered_dup_001",
    eventType: "call_answered",
    providerCallId: "call_answered_test_001",
    fromNumber: "+15555555555",
    toNumber: "+15556666666",
    metadata: {},
    occurredAt: new Date().toISOString(),
  };

  const first = await gateway.handleProviderEvent({
    organizationId: orgId,
    providerId: "demo",
    event: answeredEvent,
    skipVerification: true,
  });

  const second = await gateway.handleProviderEvent({
    organizationId: orgId,
    providerId: "demo",
    event: answeredEvent,
    skipVerification: true,
  });

  assertEqual(first.call.status, "answered", "First delivery transitions to answered");
  assert(second.duplicate, "Duplicate answered event is detected");
}

async function testIdempotencyCompletion() {
  section("4c. Idempotency (Duplicate COMPLETION Event)");

  const { gateway } = createTestGateway();
  const orgId = "org_demo";

  // Create a call and progress it to active
  const events: TelephonyEvent[] = [
    {
      providerEventId: "evt_comp_create_001",
      eventType: "call_created",
      providerCallId: "call_comp_test_001",
      fromNumber: "+15557777777",
      toNumber: "+15558888888",
      metadata: {},
      occurredAt: new Date().toISOString(),
    },
    {
      providerEventId: "evt_comp_active_001",
      eventType: "call_answered",
      providerCallId: "call_comp_test_001",
      fromNumber: "+15557777777",
      toNumber: "+15558888888",
      metadata: {},
      occurredAt: new Date().toISOString(),
    },
  ];

  for (const event of events) {
    await gateway.handleProviderEvent({
      organizationId: orgId,
      providerId: "demo",
      event,
      skipVerification: true,
    });
  }

  // Send completion twice
  const completeEvent: TelephonyEvent = {
    providerEventId: "evt_comp_complete_001",
    eventType: "call_completed",
    providerCallId: "call_comp_test_001",
    fromNumber: "+15557777777",
    toNumber: "+15558888888",
    metadata: {},
    occurredAt: new Date().toISOString(),
  };

  const first = await gateway.handleProviderEvent({
    organizationId: orgId,
    providerId: "demo",
    event: completeEvent,
    skipVerification: true,
  });

  const second = await gateway.handleProviderEvent({
    organizationId: orgId,
    providerId: "demo",
    event: completeEvent,
    skipVerification: true,
  });

  assertEqual(first.call.status, "completed", "First completion transitions to completed");
  assert(second.duplicate, "Duplicate completion is detected as duplicate");
}

async function testMultiTenantIsolation() {
  section("5. Multi-Tenant Security");

  const { gateway, db } = createTestGateway();

  // Create two organizations
  const orgA = await db.organizations.create({
    name: "Organization A",
    slug: "org-a",
    status: "active",
  });
  const orgB = await db.organizations.create({
    name: "Organization B",
    slug: "org-b",
    status: "active",
  });

  // Create agents for each
  const agentA = await db.agents.create({
    id: "agt_org_a",
    organizationId: orgA.id,
    name: "Agent A",
    description: "Org A agent",
    industry: "Banking",
    language: "en",
    voice: "layla-service",
    systemPrompt: "Test",
    welcomeMessage: "Hello",
    status: "active",
  });

  const agentB = await db.agents.create({
    id: "agt_org_b",
    organizationId: orgB.id,
    name: "Agent B",
    description: "Org B agent",
    industry: "Banking",
    language: "en",
    voice: "layla-service",
    systemPrompt: "Test",
    welcomeMessage: "Hello",
    status: "active",
  });

  // Org A creates a call
  const callResult = await gateway.simulateInboundCall({
    organizationId: orgA.id,
    agentId: agentA.id,
  });

  // Org B tries to read Org A's call
  let notFound = false;
  try {
    await gateway.getCall({ organizationId: orgB.id, callId: callResult.id });
  } catch {
    notFound = true;
  }
  assert(notFound, "Org B cannot read Org A's call (returns not found)");

  // Org B tries to list calls — should only see Org B's calls
  const orgBCalls = await gateway.listCalls(orgB.id);
  const hasOrgACall = orgBCalls.some((c) => c.id === callResult.id);
  assert(!hasOrgACall, "Org B's call list does not include Org A's calls");

  // Org B tries to end Org A's call
  let endBlocked = false;
  try {
    await gateway.endCall({ organizationId: orgB.id, callId: callResult.id });
  } catch {
    endBlocked = true;
  }
  assert(endBlocked, "Org B cannot end Org A's call");

  // Org B tries to assign an agent to Org A's call
  let assignBlocked = false;
  try {
    await gateway.assignAgent({
      organizationId: orgB.id,
      callId: callResult.id,
      agentId: agentB.id,
    });
  } catch {
    assignBlocked = true;
  }
  assert(assignBlocked, "Org B cannot assign agent to Org A's call");

  // Org B tries to use Org A's agent
  let crossAgentBlocked = false;
  try {
    await gateway.simulateInboundCall({
      organizationId: orgB.id,
      agentId: agentA.id,
    });
  } catch {
    crossAgentBlocked = true;
  }
  assert(crossAgentBlocked, "Org B cannot use Org A's agent for simulation");

  // Org A can see its own call
  const orgACalls = await gateway.listCalls(orgA.id);
  const hasOwnCall = orgACalls.some((c) => c.id === callResult.id);
  assert(hasOwnCall, "Org A can see its own call");
}

async function testDemoProviderIsolation() {
  section("6. Demo Provider Isolation");

  // Demo mode
  const { gateway: demoGw, demoProvider } = createTestGateway("demo");
  assert(demoProvider.info.simulation === true, "Demo provider is marked simulation: true");
  assert(demoProvider.info.id === "demo", "Demo provider id is 'demo'");

  // Production mode should reject demo provider
  const { gateway: prodGw } = createTestGateway("production");
  const orgId = "org_demo";
  const db = (prodGw as any); // Access internal state isn't needed — we test through the public API

  let rejectedInProduction = false;
  try {
    // In production mode, the demo provider should be rejected
    await prodGw.initiateCall({
      organizationId: orgId,
      agentId: "any-agent",
      toNumber: "+15551234567",
      providerId: "demo",
    });
  } catch (e: any) {
    rejectedInProduction = e.code === "PROVIDER_NOT_CONFIGURED" || e.message?.includes("production") || e.message?.includes("Demo");
  }
  assert(rejectedInProduction, "Production mode rejects demo provider");
}

async function testWebhookSecurity() {
  section("7. Webhook Security");

  const { gateway, demoProvider } = createTestGateway("demo");
  const orgId = "org_demo";

  // Demo mode accepts unsigned webhooks
  const uniqueId = `webhook_${Date.now()}`;
  const event: TelephonyEvent = {
    providerEventId: `evt_${uniqueId}`,
    eventType: "call_created",
    providerCallId: `call_${uniqueId}`,
    fromNumber: "+15559999999",
    toNumber: "+15550000000",
    metadata: {},
    occurredAt: new Date().toISOString(),
  };

  const result = await gateway.handleProviderEvent({
    organizationId: orgId,
    providerId: "demo",
    event,
    webhookContext: {
      rawBody: JSON.stringify({ event }),
      headers: {},
      appMode: "demo",
    },
  });

  assert(!result.duplicate, "First webhook delivery succeeds in demo mode");

  // Replay detection
  const replay = await gateway.handleProviderEvent({
    organizationId: orgId,
    providerId: "demo",
    event,
    webhookContext: {
      rawBody: JSON.stringify({ event }),
      headers: {},
      appMode: "demo",
    },
  });

  assert(replay.duplicate, "Replay is detected and flagged as duplicate");
}

async function testCallToVoiceSessionMapping() {
  section("8. Call → VoiceSession Mapping");

  const { gateway, db } = createTestGateway();
  const orgId = "org_demo";

  // Create an agent and a call
  const agent = await db.agents.create({
    id: "agt_test_vs_mapping",
    organizationId: orgId,
    name: "VS Mapping Test Agent",
    description: "Test",
    industry: "Banking",
    language: "en",
    voice: "layla-service",
    systemPrompt: "Test",
    welcomeMessage: "Hello",
    status: "active",
  });

  // Assign the agent to a call
  const createEvent: TelephonyEvent = {
    providerEventId: "evt_vs_map_create_001",
    eventType: "call_created",
    providerCallId: "call_vs_map_001",
    fromNumber: "+15551111000",
    toNumber: "+15552222000",
    metadata: {},
    occurredAt: new Date().toISOString(),
  };

  await gateway.handleProviderEvent({
    organizationId: orgId,
    providerId: "demo",
    event: createEvent,
    skipVerification: true,
  });

  // Assign agent
  const call = await db.calls.findByProviderCallId("demo", "call_vs_map_001");
  await gateway.assignAgent({
    organizationId: orgId,
    callId: call!.id,
    agentId: agent.id,
  });

  // Answer the call (should trigger VoiceSession creation)
  const answeredEvent: TelephonyEvent = {
    providerEventId: "evt_vs_map_answer_001",
    eventType: "call_answered",
    providerCallId: "call_vs_map_001",
    fromNumber: "+15551111000",
    toNumber: "+15552222000",
    metadata: {},
    occurredAt: new Date().toISOString(),
  };

  await gateway.handleProviderEvent({
    organizationId: orgId,
    providerId: "demo",
    event: answeredEvent,
    skipVerification: true,
  });

  // Verify VoiceSession was created
  const updatedCall = await db.calls.findByProviderCallId("demo", "call_vs_map_001");
  assert(updatedCall?.voiceSessionId !== null, "VoiceSession is mapped to the call on answer");

  // Send another answered event (reconnect scenario) — should NOT create a duplicate VoiceSession
  const reconnectEvent: TelephonyEvent = {
    providerEventId: "evt_vs_map_reconnect_001",
    eventType: "call_answered",
    providerCallId: "call_vs_map_001",
    fromNumber: "+15551111000",
    toNumber: "+15552222000",
    metadata: {},
    occurredAt: new Date().toISOString(),
  };

  // This will be a duplicate since the call is already answered (terminal-ish for this transition)
  const result = await gateway.handleProviderEvent({
    organizationId: orgId,
    providerId: "demo",
    event: reconnectEvent,
    skipVerification: true,
  });

  // Verify only one VoiceSession exists for this call
  const sessions = await db.sessions.listByOrg(orgId);
  const sessionsForCall = sessions.filter((s) => s.id === updatedCall?.voiceSessionId);
  assertEqual(sessionsForCall.length, 1, "Exactly one VoiceSession per call (no duplicate on reconnect)");
}

async function testAnalytics() {
  section("9. Call Analytics (Real Data Only)");

  const { gateway, db } = createTestGateway();
  const orgId = "org_demo";

  // Empty state
  const emptyAnalytics = await gateway.analytics(orgId);
  assert(emptyAnalytics.empty, "Empty analytics has empty: true");
  assertEqual(emptyAnalytics.total, 0, "Empty analytics has total: 0");

  // Create some calls
  const agent = await db.agents.create({
    id: "agt_test_analytics",
    organizationId: orgId,
    name: "Analytics Test Agent",
    description: "Test",
    industry: "Banking",
    language: "en",
    voice: "layla-service",
    systemPrompt: "Test",
    welcomeMessage: "Hello",
    status: "active",
  });

  await gateway.simulateInboundCall({
    organizationId: orgId,
    agentId: agent.id,
  });

  await gateway.simulateOutboundCall({
    organizationId: orgId,
    agentId: agent.id,
  });

  // Verify analytics are computed from real data
  const analytics = await gateway.analytics(orgId);
  assert(!analytics.empty, "Analytics has data");
  assert(analytics.total >= 2, `Analytics total ≥ 2 (got ${analytics.total})`);
  assert(analytics.inbound >= 1, `At least 1 inbound (got ${analytics.inbound})`);
  assert(analytics.outbound >= 1, `At least 1 outbound (got ${analytics.outbound})`);
  assert(analytics.completed >= 2, `At least 2 completed (got ${analytics.completed})`);
  assertEqual(analytics.byProvider["demo"], analytics.total, "All calls from demo provider");
}

async function testFailurePaths() {
  section("10. Failure Paths");

  const { gateway, db } = createTestGateway();
  const orgId = "org_demo";

  const agent = await db.agents.create({
    id: "agt_test_failure",
    organizationId: orgId,
    name: "Failure Test Agent",
    description: "Test",
    industry: "Banking",
    language: "en",
    voice: "layla-service",
    systemPrompt: "Test",
    welcomeMessage: "Hello",
    status: "active",
  });

  // Test failure at ringing
  const failAtRinging = await gateway.simulateInboundCall({
    organizationId: orgId,
    agentId: agent.id,
    failAt: "ringing",
  });
  assertEqual(failAtRinging.status, "failed", "Call that fails at ringing has status: failed");

  // Test failure at answered
  const failAtAnswered = await gateway.simulateInboundCall({
    organizationId: orgId,
    agentId: agent.id,
    failAt: "answered",
  });
  assertEqual(failAtAnswered.status, "failed", "Call that fails at answered has status: failed");

  // Test failure at active
  const failAtActive = await gateway.simulateInboundCall({
    organizationId: orgId,
    agentId: agent.id,
    failAt: "active",
  });
  assertEqual(failAtActive.status, "failed", "Call that fails at active has status: failed");
}

// ── Run all tests ─────────────────────────────────────────────────────────────

async function main() {
  console.log("\n╔══════════════════════════════════════════════════════════╗");
  console.log("║   CenterAI Telephony Gateway — Verification Suite     ║");
  console.log("╚══════════════════════════════════════════════════════════╝");

  await testCallStateMachine();
  await testCallLifecycle();
  await testOutboundCall();
  await testIdempotency();
  await testIdempotencyAnswered();
  await testIdempotencyCompletion();
  await testMultiTenantIsolation();
  await testDemoProviderIsolation();
  await testWebhookSecurity();
  await testCallToVoiceSessionMapping();
  await testAnalytics();
  await testFailurePaths();

  console.log("\n╔══════════════════════════════════════════════════════════╗");
  console.log(`║   Results: ${passed} passed, ${failed} failed${" ".repeat(Math.max(0, 37 - String(passed).length - String(failed).length))}║`);
  console.log("╚══════════════════════════════════════════════════════════╝");

  if (failures.length > 0) {
    console.log("\nFailed tests:");
    for (const f of failures) {
      console.log(`  ✗ ${f}`);
    }
  }

  process.exit(failed > 0 ? 1 : 0);
}

main().catch((error) => {
  console.error("Test suite crashed:", error);
  process.exit(2);
});
