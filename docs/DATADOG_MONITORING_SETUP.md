# DataDog Monitoring Setup Guide

This document outlines the critical paths that are currently monitored via Telegram and should be replicated in DataDog for production monitoring and alerting.

## Overview

All critical API endpoints are instrumented with OpenTelemetry and emit:
- **Traces**: For request tracking and distributed tracing
- **Structured Logs**: JSON logs with trace correlation
- **Span Attributes**: Method, path, status code, duration, error details

These signals can be exported to DataDog via OTLP and used to create monitors that replace Telegram notifications.

## Critical Paths Currently Monitored

The following paths are wrapped with `withTelemetry` middleware (which currently sends to Telegram) and `traced()` for detailed span tracking:

### 1. Proof Submission Endpoints

#### POST /api/v0/proofs/queued
- **Purpose**: Prover queues a new proof request
- **Critical**: Yes - indicates prover is starting work
- **Current Telegram Alerts**: 5xx errors, 4xx errors (sampled)

#### POST /api/v0/proofs/proving
- **Purpose**: Prover transitions proof to "proving" state
- **Critical**: Yes - indicates active proof generation
- **Current Telegram Alerts**: 5xx errors, 4xx errors (sampled)

#### POST /api/v0/proofs/proved
- **Purpose**: Prover submits completed proof with binary
- **Critical**: Yes - successful proof completion
- **Current Telegram Alerts**: 5xx errors, 4xx errors (sampled)

### 2. Machine Registration Endpoints

#### POST /api/v0/single-machine
- **Purpose**: Register a single-machine prover cluster
- **Critical**: Yes - prover onboarding
- **Current Telegram Alerts**: 5xx errors, 4xx errors (sampled)

#### POST /api/v0/clusters
- **Purpose**: Register a multi-machine prover cluster
- **Critical**: Yes - prover onboarding
- **Current Telegram Alerts**: 5xx errors (via withAuth → withTelemetry)

### 3. Authentication Endpoints

All endpoints wrapped with `withAuth` are monitored via `withTelemetry`:
- **Critical**: Yes - authentication failures indicate security issues or prover misconfiguration
- **Current Telegram Alerts**: 401 errors (sampled at 10%)

## Current Telegram Alert Conditions

From `lib/middleware/with-telemetry.ts`:

1. **5xx Server Errors**: Always alert (100% sample rate)
2. **4xx Client Errors**: Sample at max(sampleRate, 10%) - typically 10%
3. **2xx/3xx Success**: Sample at configurable rate (default 0%)
4. **Function Timeout Warning**: Alert when function approaches timeout (30s - 2s headroom)
5. **Unhandled Exceptions**: Always alert (100% sample rate)

## DataDog Monitor Setup

### Monitor 1: High Error Rate on Critical Proof Endpoints

**Purpose**: Alert when proof submission endpoints have elevated error rates

**Metric Query**:
```
sum:trace.http.request.hits{
  service:ethproofs-api,
  resource_name IN (
    "POST /api/v0/proofs/queued",
    "POST /api/v0/proofs/proving",
    "POST /api/v0/proofs/proved"
  ),
  http.status_code:5*
}.as_count()
/
sum:trace.http.request.hits{
  service:ethproofs-api,
  resource_name IN (
    "POST /api/v0/proofs/queued",
    "POST /api/v0/proofs/proving",
    "POST /api/v0/proofs/proved"
  )
}.as_count()
```

**Alert Condition**:
- Trigger when error rate > 5% over 5 minutes
- Warning when error rate > 2% over 5 minutes
- Evaluate every 1 minute
- Require at least 10 requests in evaluation window

**Notification Message**:
```
{{#is_alert}}
Critical: High error rate on proof submission endpoints
{{/is_alert}}
{{#is_warning}}
Warning: Elevated error rate on proof submission endpoints
{{/is_warning}}

Error Rate: {{value}}%
Service: {{service.name}}
Endpoints: POST /api/v0/proofs/{queued,proving,proved}

This may indicate:
- Database connectivity issues
- Storage quota problems
- Invalid proof payloads from provers
- Block RPC failures

View traces: {{link}}
```

**Recovery**: Alert recovers when error rate < 1% for 5 minutes

---

### Monitor 2: Individual 5xx Errors on Critical Paths

**Purpose**: Alert on every 5xx error for immediate investigation

**Log Query**:
```
service:ethproofs-api
status:error
@http.status_code:[500 TO 599]
@http.target:(
  "/api/v0/proofs/queued" OR
  "/api/v0/proofs/proving" OR
  "/api/v0/proofs/proved" OR
  "/api/v0/single-machine" OR
  "/api/v0/clusters"
)
```

**Alert Condition**:
- Trigger when count > 0 over 1 minute
- Evaluate every 1 minute
- Group by: `@http.target`, `@http.method`, `@error_message`

**Notification Message**:
```
Server Error Detected on Critical Path

Method: {{@http.method}}
Path: {{@http.target}}
Status: {{@http.status_code}}
Error: {{@error_message}}
Duration: {{@duration_ms}}ms
Team ID: {{@team_id}}
Block Number: {{@block_number}}
Cluster ID: {{@cluster_id}}

Trace: {{trace_id}}
View in DataDog: {{link}}
```

**Recovery**: Not applicable (alert on every occurrence)

---

### Monitor 3: Authentication Failures Spike

**Purpose**: Detect authentication issues or potential security threats

**Log Query**:
```
service:ethproofs-api
@http.status_code:401
```

**Alert Condition**:
- Trigger when count > 50 over 5 minutes
- Warning when count > 20 over 5 minutes
- Evaluate every 1 minute

**Notification Message**:
```
{{#is_alert}}
Critical: High rate of authentication failures
{{/is_alert}}
{{#is_warning}}
Warning: Elevated authentication failure rate
{{/is_warning}}

Failure Count: {{value}} in 5 minutes
Service: {{service.name}}

This may indicate:
- Provers using invalid/expired API keys
- Potential security attack
- Recent API key rotation without prover updates

Top failing endpoints: {{group_by @http.target}}
View logs: {{link}}
```

**Recovery**: Alert recovers when count < 10 for 5 minutes

---

### Monitor 4: Function Timeout Warnings

**Purpose**: Detect performance degradation before it causes failures

**Log Query**:
```
service:ethproofs-api
@level:warn
@message:"Function timeout imminent"
```

**Alert Condition**:
- Trigger when count > 0 over 1 minute
- Evaluate every 1 minute
- Group by: `@path`, `@method`

**Notification Message**:
```
Function Timeout Warning Detected

Method: {{@method}}
Path: {{@path}}
Duration: {{@duration_ms}}ms
Runtime: {{@runtime}}

This indicates:
- Database query is too slow
- RPC endpoint unresponsive
- Storage operation hanging
- Proof binary upload timeout

Investigate immediately before timeouts cause 5xx errors.

View trace: {{link}}
```

**Recovery**: Not applicable (alert on every occurrence)

---

### Monitor 5: Failed Proof Storage Operations

**Purpose**: Track proof binary upload/storage failures

**Log Query**:
```
service:ethproofs-api
@level:error
@message:"Failed to store proof"
```

**Alert Condition**:
- Trigger when count > 2 over 5 minutes
- Evaluate every 1 minute
- Group by: `@team_id`, `@block_number`

**Notification Message**:
```
Proof Storage Failures Detected

Team ID: {{@team_id}}
Block Number: {{@block_number}}
Failure Count: {{value}}

This may indicate:
- Supabase storage quota exceeded
- Storage bucket permissions issue
- Network connectivity problems
- Binary encoding errors

View logs: {{link}}
```

**Recovery**: Alert recovers when count = 0 for 10 minutes

---

### Monitor 6: Block Update/Fetch Failures

**Purpose**: Track RPC and block processing issues

**Log Query**:
```
service:ethproofs-api
@level:error
(
  @message:"Failed to update block" OR
  @message:"Failed to find/create block"
)
```

**Alert Condition**:
- Trigger when count > 5 over 5 minutes
- Evaluate every 1 minute

**Notification Message**:
```
Block Processing Failures Detected

Failure Count: {{value}} in 5 minutes
Service: {{service.name}}

This may indicate:
- RPC endpoint unavailable
- RPC rate limiting
- Invalid block numbers from provers
- Database constraint violations

Affected blocks: {{group_by @block_number}}
View logs: {{link}}
```

**Recovery**: Alert recovers when count < 2 for 5 minutes

---

### Monitor 7: Cluster/Machine Registration Failures

**Purpose**: Track prover onboarding issues

**Log Query**:
```
service:ethproofs-api
@level:error
(
  @message:"Cluster not found" OR
  @message:"Cluster version not found" OR
  @message:"Cloud instance not found" OR
  @message:"Invalid zkvm version"
)
```

**Alert Condition**:
- Trigger when count > 5 over 15 minutes
- Evaluate every 5 minutes
- Group by: `@message`, `@team_id`

**Notification Message**:
```
Prover Registration/Configuration Failures

Error Type: {{@message}}
Team ID: {{@team_id}}
Failure Count: {{value}} in 15 minutes

This may indicate:
- Provers using incorrect cluster_id
- Missing cloud instance configurations
- Unsupported ZKVM version requests
- Database migration issues

View logs: {{link}}
```

**Recovery**: Alert recovers when count < 2 for 15 minutes

---

### Monitor 8: Request Duration Percentile (P95)

**Purpose**: Detect performance degradation

**Metric Query**:
```
p95:trace.http.request.duration{
  service:ethproofs-api,
  resource_name IN (
    "POST /api/v0/proofs/queued",
    "POST /api/v0/proofs/proving",
    "POST /api/v0/proofs/proved"
  )
}
```

**Alert Condition**:
- Trigger when P95 > 5000ms (5 seconds) over 10 minutes
- Warning when P95 > 3000ms (3 seconds) over 10 minutes
- Evaluate every 5 minutes
- Group by: `resource_name`

**Notification Message**:
```
{{#is_alert}}
Critical: Request duration P95 exceeds threshold
{{/is_alert}}
{{#is_warning}}
Warning: Request duration P95 elevated
{{/is_warning}}

Endpoint: {{resource_name}}
P95 Duration: {{value}}ms
Threshold: 5000ms

This may indicate:
- Database query performance issues
- RPC endpoint slowness
- Storage upload bottleneck
- High load on system

View APM: {{link}}
```

**Recovery**: Alert recovers when P95 < 2000ms for 10 minutes

---

### Monitor 9: Storage Quota Exceeded Warnings

**Purpose**: Track teams hitting storage limits

**Log Query**:
```
service:ethproofs-api
@level:warn
@message:"Storage quota exceeded"
```

**Alert Condition**:
- Trigger when count > 10 over 1 hour
- Evaluate every 10 minutes
- Group by: `@team_id`

**Notification Message**:
```
Storage Quota Exceeded for Team

Team ID: {{@team_id}}
Occurrences: {{value}} in 1 hour

Proofs are being accepted but binaries are not stored.
Consider increasing storage quota or cleaning old proofs.

View logs: {{link}}
```

**Recovery**: Alert recovers when count = 0 for 1 hour

---

### Monitor 10: Unhandled Request Errors

**Purpose**: Catch unexpected exceptions not covered by other monitors

**Log Query**:
```
service:ethproofs-api
@level:error
@message:"Unhandled request error"
```

**Alert Condition**:
- Trigger when count > 0 over 1 minute
- Evaluate every 1 minute
- Group by: `@http.target`, `@error_name`

**Notification Message**:
```
Unhandled Exception in Request Handler

Method: {{@method}}
Path: {{@path}}
Error: {{@error_name}}
Message: {{@error_message}}
Stack: {{@error_stack}}

This is a critical bug that needs immediate investigation.

Trace: {{trace_id}}
View error: {{link}}
```

**Recovery**: Not applicable (alert on every occurrence)

---

## Span Attributes Available for Filtering

All traces and logs include these attributes for filtering:

### HTTP Attributes (from withTelemetry)
- `http.method` - Request method (GET, POST, etc.)
- `http.url` - Full request URL
- `http.target` - Request path
- `http.host` - Hostname
- `http.status_code` - Response status code

### Business Context (from traced() and child loggers)
- `team_id` - Team/user identifier
- `block_number` - Ethereum block number
- `cluster_id` - Prover cluster ID
- `proof_size` - Proof binary size in bytes
- `cloud_instance` - Cloud instance name
- `zkvm_version_id` - ZKVM version

### Error Attributes (from logger.error)
- `error_name` - Error class name
- `error_message` - Error message
- `error_stack` - Stack trace

### Performance Attributes
- `duration_ms` - Request/operation duration
- `trace_id` - OpenTelemetry trace ID
- `span_id` - OpenTelemetry span ID

## Monitor Priority Matrix

| Monitor | Severity | Frequency | Action Required |
|---------|----------|-----------|-----------------|
| Individual 5xx Errors | Critical | Immediate | Investigate within 5 minutes |
| High Error Rate | Critical | 5 min window | Investigate within 15 minutes |
| Unhandled Exceptions | Critical | Immediate | Investigate immediately |
| Function Timeout | High | Immediate | Investigate within 15 minutes |
| Auth Failures Spike | High | 5 min window | Investigate within 30 minutes |
| Proof Storage Failures | High | 5 min window | Investigate within 30 minutes |
| Block Processing Failures | Medium | 5 min window | Investigate within 1 hour |
| Request Duration P95 | Medium | 10 min window | Investigate within 1 hour |
| Registration Failures | Medium | 15 min window | Investigate within 2 hours |
| Storage Quota Warnings | Low | 1 hour window | Review daily |

## Dashboard Recommendations

Create a "Critical Paths" dashboard with:

1. **Request Rate Panel**: Timeseries of requests/min for all critical endpoints
2. **Error Rate Panel**: Timeseries of error % for all critical endpoints
3. **P50/P95/P99 Latency Panel**: Performance distribution over time
4. **Status Code Distribution**: Pie chart of 2xx/4xx/5xx responses
5. **Top Errors Table**: List of most frequent error messages
6. **Active Teams Panel**: Unique `team_id` count making requests
7. **Proof Throughput Panel**: Count of proofs queued/proving/proved per hour
8. **Storage Usage Panel**: Sum of `proof_size` over time

## Migration from Telegram to DataDog

Once DataDog monitors are configured and validated:

1. Test monitors in DataDog for 1 week alongside Telegram
2. Compare alert volume and accuracy
3. Remove Telegram code from `lib/middleware/with-telemetry.ts`:
   - Remove `sendReport()` function
   - Remove all `safeSend()` and `await sendReport()` calls
   - Remove Telegram dependencies from package.json
4. Keep structured logging and OpenTelemetry instrumentation intact

## Additional Notes

- All monitors should send to appropriate channels (e.g., #alerts-production)
- Consider PagerDuty integration for critical monitors during on-call hours
- Set up weekly summary reports for medium/low priority monitors
- Review and adjust thresholds after 2 weeks of production data
- Add runbooks to monitor descriptions with investigation steps
