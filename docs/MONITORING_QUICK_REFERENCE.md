# Monitoring Quick Reference

## Critical Endpoints Status

All critical endpoints are instrumented with:
- ✅ OpenTelemetry tracing (`traced()`)
- ✅ Structured logging (`logger` / `logger.child()`)
- ✅ Request middleware (`withTelemetry`)
- ✅ Authentication tracking (`withAuth`)
- ✅ Span attributes for filtering

## Endpoint Summary

| Endpoint | Auth | Traced | Context Logged | Telegram Alerts |
|----------|------|--------|----------------|-----------------|
| POST /api/v0/proofs/queued | ✅ | ✅ | team_id, block_number, cluster_id | ✅ 5xx, 4xx |
| POST /api/v0/proofs/proving | ✅ | ✅ | team_id, block_number, cluster_id | ✅ 5xx, 4xx |
| POST /api/v0/proofs/proved | ✅ | ✅ | team_id, block_number, cluster_id, proof_size | ✅ 5xx, 4xx |
| POST /api/v0/single-machine | ✅ | ✅ | team_id, nickname, cloud_instance | ✅ 5xx, 4xx |
| POST /api/v0/clusters | ✅ | ❌ | team_id | ✅ 5xx, 4xx |
| GET /api/v0/clusters | ✅ | ❌ | team_id | ✅ 5xx, 4xx |
| GET /api/v0/cloud-instances | ❌ | ❌ | provider | ✅ 5xx |
| GET /api/v0/blocks/{block} | ❌ | ❌ | block_number | ✅ 5xx |
| GET /api/v0/proofs | ❌ | ❌ | team, block, limit, offset | ✅ 5xx |
| GET /api/proofs/{teamId} | ❌ | ❌ | team_id, page_index, page_size | ✅ 5xx |
| GET /api/blocks | ❌ | ❌ | page_index, page_size, machine_type | ✅ 5xx |
| GET /api/revalidate | ❌ | ❌ | tag | ✅ 5xx |

**Legend:**
- ✅ = Fully instrumented
- ❌ = Basic instrumentation only (logger.error on failures)

## Key Metrics to Monitor

### 1. Error Rates
```
Metric: trace.http.request.hits (with http.status_code:5*)
Group by: resource_name
Alert: > 5% error rate over 5 minutes
```

### 2. Request Duration
```
Metric: trace.http.request.duration
Percentiles: P50, P95, P99
Alert: P95 > 5000ms over 10 minutes
```

### 3. Throughput
```
Metric: trace.http.request.hits
Group by: resource_name, http.status_code
Dashboard: Requests/min timeseries
```

### 4. Critical Error Logs
```
Log query: service:ethproofs-api @level:error
Group by: @message, @http.target
Alert: Individual errors on critical paths
```

### 5. Authentication Failures
```
Log query: service:ethproofs-api @http.status_code:401
Alert: > 50 failures over 5 minutes
```

## Common Investigation Queries

### Find all errors for a specific team
```
service:ethproofs-api @level:error @team_id:<team_id>
```

### Find all requests for a specific block
```
service:ethproofs-api @block_number:<block_number>
```

### Find slow proof submissions
```
service:ethproofs-api @http.target:"/api/v0/proofs/proved" @duration_ms:>5000
```

### Find storage quota warnings
```
service:ethproofs-api @level:warn @message:"Storage quota exceeded"
```

### Find cluster lookup failures
```
service:ethproofs-api @level:error @message:"Cluster not found"
```

### Find all traces for a request
```
Use trace_id from logs to view full request trace in APM
```

## Alert Priority Guide

**P0 - Critical (Immediate response required):**
- 5xx errors on proof submission endpoints
- Unhandled exceptions
- Function timeouts

**P1 - High (Response within 15 minutes):**
- High error rate (>5%)
- Authentication failure spike
- Proof storage failures

**P2 - Medium (Response within 1 hour):**
- Block processing failures
- Elevated P95 latency
- Registration/configuration errors

**P3 - Low (Daily review):**
- Storage quota warnings
- 4xx errors (sampled)

## Span Attributes Reference

### All Requests (from withTelemetry)
- `http.method` - GET, POST, etc.
- `http.url` - Full URL
- `http.target` - Path only
- `http.status_code` - Response status
- `duration_ms` - Request duration

### Proof Endpoints
- `team_id` - Team/user ID
- `block_number` - Block number
- `cluster_id` - Cluster identifier
- `proof_size` - Proof binary size (proved only)

### Machine Registration
- `team_id` - Team/user ID
- `nickname` - Machine/cluster nickname
- `cloud_instance` - Instance name
- `zkvm_version_id` - ZKVM version

### Errors
- `error_name` - Error class
- `error_message` - Error message
- `error_stack` - Stack trace

## DataDog Dashboard Widgets

**Recommended layout for "Critical Paths" dashboard:**

Row 1: Overview
- [Timeseries] Request Rate (all endpoints)
- [Query Value] Current Error Rate %
- [Query Value] Active Teams (unique team_id count)

Row 2: Performance
- [Timeseries] P95 Latency by Endpoint
- [Heatmap] Request Duration Distribution
- [Top List] Slowest Endpoints (avg duration)

Row 3: Errors
- [Timeseries] Error Rate % by Endpoint
- [Top List] Most Common Errors (group by @message)
- [Query Value] 5xx Count (last hour)

Row 4: Business Metrics
- [Timeseries] Proof Submissions (queued/proving/proved)
- [Query Value] Proofs Completed (last hour)
- [Timeseries] New Machine Registrations

Row 5: Infrastructure
- [Timeseries] Function Timeout Warnings
- [Timeseries] Storage Quota Exceeded
- [Top List] Teams by Request Volume

## Next Steps

1. ✅ OpenTelemetry instrumentation complete
2. ✅ Structured logging implemented
3. ✅ Child logger pattern for DRY code
4. ✅ Monitoring documentation created
5. ⏳ Configure OTLP exporter to DataDog
6. ⏳ Create DataDog monitors (see DATADOG_MONITORING_SETUP.md)
7. ⏳ Build DataDog dashboard
8. ⏳ Test monitors for 1 week
9. ⏳ Remove Telegram code from withTelemetry

## Contact

For questions about monitoring setup, see:
- `docs/DATADOG_MONITORING_SETUP.md` - Detailed monitor configuration
- `docs/OPENTELEMETRY.md` - OpenTelemetry setup guide
- `docs/CHILD_LOGGER_EXAMPLE.md` - Logger usage examples
