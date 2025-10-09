# Metrics and Logs via OTLP

## What's Configured

The application now exports **three signals** via OTLP gRPC:

1. **Traces** - Request flows, spans, distributed tracing
2. **Metrics** - Performance counters, request rates, latency percentiles
3. **Logs** - Structured JSON logs with trace correlation (via dd-agent collection)

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
- Written to console as structured JSON
- Include `trace_id` and `span_id` for correlation
- Collected by dd-agent from container stdout
- Automatically correlated with traces in DataDog

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

### Logs (once dd-agent log collection is configured)
- JSON structured logs with all context
- Linked to traces via `trace_id`
- Searchable by any field (`@team_id`, `@block_number`, etc.)

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

## Custom Metrics (Future)

You can add custom metrics later:

```typescript
import { metrics } from "@opentelemetry/api"

const meter = metrics.getMeter("ethproofs")
const proofCounter = meter.createCounter("proofs.submitted", {
  description: "Number of proofs submitted",
})

// In your handler
proofCounter.add(1, { team_id: teamId, status: "proved" })
```

This will automatically export to DataDog via the configured OTLP exporter.

## Troubleshooting

**Metrics not appearing:**
- Wait 60 seconds (metrics are batched)
- Check dd-agent logs for metric processing
- Verify `http.server.*` metrics in DataDog Metrics Explorer

**Logs not correlated with traces:**
- Configure dd-agent to collect container logs
- Ensure JSON parsing is enabled
- Check that `trace_id` field is present in logs

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
