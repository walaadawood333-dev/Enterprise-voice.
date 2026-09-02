# Phase 12 — Campaign Execution & Intelligent Dialing Engine

## Executive Summary

Phase 12 transforms CenterAI from a campaign visualization platform into a **real campaign execution and intelligent dialing engine**. The system moves from campaign creation/monitoring to actual execution with:

- Contact import, validation, normalization, and deduplication
- DNC/compliance screening before dialing
- Intelligent dialing queue with priority engine
- Configurable retry logic with backoff strategies
- Outcome classification and extraction
- Campaign execution controls (start/pause/resume/stop)
- Real-time metrics and monitoring
- Demo simulation mode

## Status

**Database Schema**: ✅ Complete  
**Type Definitions**: ✅ Complete  
**Implementation**: 🔄 Core architecture defined

## Architecture Overview

```
IMPORT CONTACTS
        ↓
VALIDATE & NORMALIZE
        ↓
DEDUPLICATE
        ↓
SEGMENTATION
        ↓
DNC / COMPLIANCE CHECK
        ↓
ELIGIBILITY ENGINE
        ↓
CAMPAIGN QUEUE
        ↓
PRIORITIZATION
        ↓
DIALING ENGINE
        ↓
AI AGENT
        ↓
VOICE SESSION
        ↓
OUTCOME CLASSIFICATION
        ↓
RETRY / FOLLOW-UP LOGIC
        ↓
CAMPAIGN ANALYTICS
        ↓
SUPERVISOR / REPORTING
```

## Database Schema (Complete)

### New Models

1. **Contact** — Master contact record with validation, normalization, DNC status
   - Fields: firstName, lastName, rawPhone, normalizedPhone, email, customerId, externalId
   - Validation: validationStatus, phoneValidation, isDnc, isDuplicate
   - Custom fields: JSON support for flexible data

2. **CampaignContactPhase12** — Campaign-specific contact with queue state
   - Queue status: QUEUED, RESERVED, DIALING, CONNECTED, COMPLETED, RETRY, FAILED, SKIPPED, BLOCKED, CANCELLED
   - Attempt tracking: attemptNumber, maxAttempts, lastAttemptAt, nextAttemptAt
   - Locking: lockedAt, lockedBy (concurrency control)
   - Outcome: lastOutcome, lastOutcomeDetail
   - Callback: isCallback, callbackAt

3. **DialAttempt** — Individual dial attempt record
   - Links to call and voice session
   - Outcome classification
   - Duration and provider tracking
   - Error handling

4. **CampaignEvent** — Campaign lifecycle events
   - Event types: CREATED, STARTED, PAUSED, RESUMED, STOPPED, COMPLETED
   - Contact processing events: IMPORTED, VALIDATED, DEDUPLICATED, DNC_CHECKED
   - Audit trail with metadata

5. **RetryPolicy** — Configurable retry logic
   - Backoff strategies: FIXED, LINEAR, EXPONENTIAL, CUSTOM
   - Outcome-based delays and actions
   - JSON configuration for flexibility

6. **CampaignSchedule** — Execution schedule
   - Timezone-aware scheduling
   - Allowed weekdays and hours
   - Holiday exclusions

### Indexes (Optimized for Queue Access)

```sql
-- Contact indexes
(organizationId, validationStatus)
(organizationId, normalizedPhone)
(organizationId, customerId)

-- Campaign contact indexes
(organizationId, campaignId, status)
(organizationId, campaignId, priority)
(organizationId, campaignId, nextAttemptAt)

-- Dial attempt indexes
(organizationId, campaignContactId)
(organizationId, callId)
```

## Type Definitions (Complete)

All Phase 12 types defined in `shared/contracts.ts`:

- ContactValidationStatus, PhoneValidationStatus
- DialingQueueItemStatus (10 states)
- CallOutcomeType (15 outcome types)
- RetryBackoffStrategy
- CampaignEventType12
- Row types for all models
- DTO types for API responses
- Import/export interfaces

## Implementation Plan

### Phase 12A — Contact Management Engine
- [ ] Contact import service (CSV, JSON, API)
- [ ] Phone normalization (E.164)
- [ ] Validation engine
- [ ] Deduplication engine
- [ ] DNC screening integration

### Phase 12B — Dialing Queue Engine
- [ ] Queue management service
- [ ] Priority engine
- [ ] Concurrency control (locking)
- [ ] Queue reservation (atomic)

### Phase 12C — Campaign Execution Engine
- [ ] Campaign start/pause/resume/stop
- [ ] Eligibility checking
- [ ] Schedule enforcement
- [ ] Usage limit checking

### Phase 12D — Dialer Worker
- [ ] Next contact selection
- [ ] Telephony provider integration
- [ ] Call initiation
- [ ] Voice session creation

### Phase 12E — Outcome & Retry Engine
- [ ] Outcome classification
- [ ] AI outcome extraction (foundation)
- [ ] Retry policy execution
- [ ] Callback scheduling

### Phase 12F — Demo Simulation
- [ ] Demo dialer
- [ ] Simulated call flow
- [ ] Outcome generation
- [ ] Analytics simulation

### Phase 12G — Real-time Operations
- [ ] Campaign metrics API
- [ ] Live dialing view
- [ ] Event streaming (foundation)
- [ ] Supervisor monitoring

### Phase 12H — API Routes
- [ ] Import endpoints
- [ ] Queue management endpoints
- [ ] Execution control endpoints
- [ ] Metrics and analytics endpoints

### Phase 12I — Verification Tests
- [ ] Unit tests (phone normalization, validation, dedup)
- [ ] Integration tests (import → validate → DNC → queue)
- [ ] Multi-tenant isolation tests
- [ ] Concurrency tests
- [ ] Demo mode tests

## Key Design Decisions

### 1. Provider-Agnostic Architecture
The dialing engine uses the existing TelephonyProvider abstraction. No hard-coding to Twilio, Vonage, etc.

### 2. Concurrency Control
Queue reservation uses atomic locking to prevent duplicate dialing:
```typescript
lockedAt: timestamp
lockedBy: worker_id
expiresAt: timestamp (timeout)
```

### 3. Compliance-First
Every contact must pass DNC check before entering queue. No exceptions.

### 4. Configurable Retry Logic
Retry policies are tenant-specific and outcome-aware:
```json
{
  "NO_ANSWER": { "delay": 14400, "action": "retry" },
  "BUSY": { "delay": 1800, "action": "retry" },
  "WRONG_NUMBER": { "action": "stop" },
  "DNC_REQUEST": { "action": "suppress" }
}
```

### 5. Demo Mode Safety
Demo mode simulates the entire flow without requiring real telephony. Clear separation between DEMO and LIVE modes.

### 6. Multi-Tenant Isolation
All queries scoped to organizationId. No cross-tenant access possible.

### 7. No Hard-Coded Business Rules
Country codes, calling hours, outcomes are all configurable. No Jordan-specific hard-coding.

## API Design

### Contact Management
```
POST   /api/workspace/contacts/import
GET    /api/workspace/contacts
GET    /api/workspace/contacts/:id
DELETE /api/workspace/contacts/:id
```

### Campaign Execution
```
POST   /api/workspace/campaigns/:id/import-contacts
POST   /api/workspace/campaigns/:id/validate-contacts
POST   /api/workspace/campaigns/:id/deduplicate-contacts
POST   /api/workspace/campaigns/:id/dnc-check
POST   /api/workspace/campaigns/:id/prepare-queue
POST   /api/workspace/campaigns/:id/start
POST   /api/workspace/campaigns/:id/pause
POST   /api/workspace/campaigns/:id/resume
POST   /api/workspace/campaigns/:id/stop
```

### Queue Management
```
GET    /api/workspace/campaigns/:id/queue
GET    /api/workspace/campaigns/:id/queue/stats
POST   /api/workspace/dialer/next
POST   /api/workspace/dialer/reserve
POST   /api/workspace/dialer/release
```

### Metrics & Analytics
```
GET    /api/workspace/campaigns/:id/metrics
GET    /api/workspace/campaigns/:id/attempts
GET    /api/workspace/campaigns/:id/outcomes
GET    /api/workspace/campaigns/:id/events
```

## Security & Compliance

### Credential Safety
- Never expose telephony credentials
- Never expose API keys
- Audit all execution events

### DNC Enforcement
- Check before queue entry
- Check before each dial attempt
- Permanent suppression on DNC_REQUEST outcome

### Usage Limits
- Check tenant limits before dialing
- Prevent new calls when limit reached
- Allow active calls to finish

### Audit Trail
- All campaign events logged
- All dial attempts recorded
- All outcomes classified
- Immutable event log

## Performance Considerations

### Batch Processing
- Import contacts in batches (100-1000)
- Process queue in batches
- Aggregate metrics periodically

### Indexes
- Optimized for queue access patterns
- Support priority-based selection
- Support time-based scheduling

### Pagination
- All list endpoints paginated
- Cursor-based for queue
- Offset-based for historical data

## Testing Strategy

### Unit Tests
- Phone normalization (multiple countries)
- Validation rules
- Deduplication logic
- Priority calculation
- Retry policy evaluation
- State transitions

### Integration Tests
- Import → Validate → Deduplicate → DNC → Queue
- Queue → Reserve → Dial → Outcome → Retry
- Campaign start → Execute → Complete

### Multi-Tenant Tests
- Tenant A cannot access Tenant B contacts
- Tenant A cannot access Tenant B campaigns
- Tenant A cannot access Tenant B queue

### Concurrency Tests
- Two workers cannot reserve same contact
- Lock expiration works correctly
- Queue remains consistent under load

### Demo Mode Tests
- Demo dialer simulates calls
- Demo outcomes generated correctly
- Demo analytics calculated

## Remaining Work

### Immediate Next Steps
1. Implement contact import service
2. Implement phone normalization
3. Implement validation engine
4. Implement DNC screening service
5. Implement queue management service
6. Implement campaign execution service
7. Add API routes
8. Implement demo dialer
9. Create verification tests
10. Run all tests

### Future Enhancements
- Predictive dialing algorithm
- AI-powered outcome extraction (real LLM integration)
- Real-time WebSocket event streaming
- Advanced analytics and reporting
- A/B testing for dialing strategies
- Multi-language support
- Advanced segmentation engine
- Integration with external CRM systems

## Limitations

### Current Limitations
1. No real-time WebSocket streaming (REST polling only)
2. No background job processor (queue processing is synchronous)
3. No real telephony integration (demo mode only)
4. No AI outcome extraction (manual outcome selection)
5. No predictive dialing (simple priority-based selection)

### Production Readiness
To make this production-ready:
1. Add background job processor (Redis/Bull, Celery, etc.)
2. Add real telephony provider integration
3. Add WebSocket event streaming
4. Add AI/ML outcome extraction
5. Add advanced analytics and reporting
6. Add comprehensive monitoring and alerting
7. Add disaster recovery and failover

## Conclusion

Phase 12 delivers the **foundation** for a production-grade campaign execution engine. The architecture is solid, the schema is complete, and the type system is comprehensive. The remaining work is implementation of the services, API routes, and demo simulation.

The system is designed to be:
- **Provider-agnostic** — Works with any telephony provider
- **Compliance-first** — DNC enforcement at every step
- **Configurable** — Retry policies, schedules, outcomes are all tenant-specific
- **Scalable** — Optimized indexes, batch processing, pagination
- **Secure** — Multi-tenant isolation, credential protection, audit trail
- **Testable** — Comprehensive test coverage planned

**Status**: Architecture complete, implementation in progress.

---

*Implementation Date: 2026-08-31*  
*Last Updated: 2026-08-31*
