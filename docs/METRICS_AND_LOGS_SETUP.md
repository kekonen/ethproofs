# Metrics and Logs via OTLP

## What's Configured

The application now exports **three signals** via OTLP gRPC:

1. **Traces** - Request flows, spans, distributed tracing
2. **Metrics** - Performance counters, request rates, latency percentiles
3. **Logs** - Structured logs with trace correlation (via OTLP export)

## How It Works

### Traces
- Created by `traced()` function and `withTelemetry` middleware
- Sent directly via OTLP gRPC to port 4317
- ✅ Working - you see them in DataDog APM

### Metrics
- Auto-generated from instrumentation (HTTP requests, durations, etc.)
- Exported every 60 seconds via OTLP gRPC to port 4317
- Includes:
  - `http.server.request.duration` - Request latency histogram
  - `http.server.request.count` - Request counter
  - `http.server.response.size` - Response size
  - And more from auto-instrumentation

### Logs
- Emitted via OpenTelemetry Logs API using `logger.info()`, `logger.error()`, etc.
- Sent directly via OTLP gRPC to port 4317 (same as traces and metrics)
- Batched and exported automatically by `BatchLogRecordProcessor`
- Include `trace_id` and `span_id` for automatic correlation with traces
- Also written to console for local development visibility
- Automatically correlated with traces in DataDog - click a log to see its trace, and vice versa

## Configuration

No changes needed from trace-only setup:

```bash
# .env.local
OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4317
OTEL_EXPORTER_OTLP_HEADERS={}
```

## What You'll See in DataDog

### APM / Traces
- Request spans with full context
- Error tracking
- Latency distribution

### Metrics
**Automatic metrics from HTTP instrumentation:**
- `http.server.request.duration` (P50, P95, P99)
- `http.server.request.count` (requests/sec)
- `http.server.active_requests` (concurrent requests)

**Can be used for:**
- Latency alerts (`P95 > 5000ms`)
- Throughput alerts (`requests/min < 1`)
- Error rate calculations (`errors / total requests`)

### Logs
- Structured logs with all context (team_id, block_number, etc.)
- Automatically linked to traces via `trace_id`
- Searchable by any field in DataDog Logs Explorer
- Click a log → jump to its trace
- Click a trace → see all related logs

## Using Metrics in Monitors

### Example: Alert on High P95 Latency
```
Metric: http.server.request.duration
Aggregation: p95
Filter: service:ethproofs-api AND resource:POST /api/v0/proofs/proved
Alert when: > 5000ms over 10 minutes
```

### Example: Alert on Low Throughput
```
Metric: http.server.request.count
Aggregation: sum.as_rate()
Filter: service:ethproofs-api
Alert when: < 0.1 req/sec over 5 minutes
(Means service is down or not receiving traffic)
```

### Example: Alert on High Error Rate
```
Formula:
  errors = sum:http.server.request.count{status_code:5*}
  total = sum:http.server.request.count{}
  error_rate = errors / total
Alert when: error_rate > 0.05 (5%)
```

## Metrics vs Logs vs Traces

| Signal | Best For | Example Use |
|--------|----------|-------------|
| **Traces** | Debugging specific requests | "Why did this proof submission fail?" |
| **Logs** | Searching for specific events | "Find all storage quota warnings for team X" |
| **Metrics** | Aggregated monitoring | "Is P95 latency increasing?" |

## Custom Business Metrics

The application now tracks custom business metrics defined in `lib/metrics.ts`:

### Business Metrics

**`proofs.submitted`** (Counter)
- Tracks proof submissions by status
- Labels: `status` (queued, proving, proved), `team_id`
- Instrumented in: `/api/v0/proofs/{queued,proving,proved}/route.ts`

**`proofs.size_bytes`** (Histogram)
- Distribution of proof binary sizes
- Labels: `team_id`, `status`
- Instrumented in: `/api/v0/proofs/proved/route.ts`

**`blocks.processed`** (Counter)
- Blocks created or updated
- Labels: `operation` (created, updated)
- Instrumented in: `lib/api/blocks.ts`

**`storage.quota_exceeded`** (Counter)
- Number of storage quota violations
- Labels: `team_id`
- Instrumented in: `/api/v0/proofs/proved/route.ts`

**`clusters.registered`** (Counter)
- Cluster registrations
- Labels: `team_id`, `is_multi_machine` (true, false)
- Instrumented in: `/api/v0/single-machine/route.ts`

### Performance Metrics

**`blocks.rpc_fetch_duration`** (Histogram)
- Duration of RPC calls to fetch block data
- Labels: `rpc` (primary, fallback), `success` (true, false)
- Instrumented in: `lib/api/blocks.ts`

**`proofs.upload_duration`** (Histogram)
- Time to upload proof binaries to storage
- Labels: `success` (true, false)
- Instrumented in: `lib/api/proof-binaries.ts`

**`auth.failures`** (Counter)
- Authentication failures
- No labels (security - don't expose team_id)
- Instrumented in: `lib/middleware/with-auth.ts`

**`database.errors`** (Counter)
- Database operation errors
- Labels: `operation`, `table`
- Available for future use

### Using Custom Metrics in DataDog

Example queries:

**Proof submission rate by status:**
```
sum:proofs.submitted{*} by {status}.as_rate()
```

**P95 proof size:**
```
p95:proofs.size_bytes{*}
```

**RPC latency by success/failure:**
```
avg:blocks.rpc_fetch_duration{*} by {success}
```

**Storage upload failures:**
```
sum:proofs.upload_duration{success:false}.as_count()
```

## Troubleshooting

**Metrics not appearing:**
- Wait 60 seconds (metrics are batched)
- Check dd-agent logs for metric processing
- Verify `http.server.*` metrics in DataDog Metrics Explorer

**Logs not correlated with traces:**
- Check that logs are being exported (should see in dd-agent logs)
- Verify `trace_id` is present in log attributes
- Check DataDog Logs Explorer for service:ethproofs-api

**High cardinality warning:**
- Don't add high-cardinality labels to metrics (like `block_number`)
- Use logs for high-cardinality data
- Metrics should have < 100 unique label combinations

## Next Steps

1. **Verify metrics in DataDog:**
   - Go to Metrics Explorer
   - Search for `http.server.request`
   - Should see metrics after 60 seconds

2. **Create metric-based monitors:**
   - Use pre-built queries from `DATADOG_MONITORING_SETUP.md`
   - Set up P95 latency alert
   - Set up error rate alert

3. **Add custom business metrics:**
   - Track proofs/hour per team
   - Track average proof size
   - Track block processing time
