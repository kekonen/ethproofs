# OpenTelemetry Integration Guide

This application uses OpenTelemetry for distributed tracing and structured logging to monitor critical backend operations.

## Overview

**What's implemented:**
- ✅ Automatic instrumentation of Next.js API routes
- ✅ Auto-instrumentation of HTTP requests, database queries, and external API calls
- ✅ Structured JSON logging with trace correlation
- ✅ Manual tracing for critical operations
- ✅ Export to any OTLP-compatible monitoring service

## Configuration

### Environment Variables

Add these to your `.env` file:

```bash
# Enable OpenTelemetry (required)
OTEL_ENABLED=true

# Service name (optional, default: ethproofs-api)
OTEL_SERVICE_NAME=ethproofs-api

# OTLP endpoint - where to send traces
OTEL_EXPORTER_OTLP_ENDPOINT=https://api.honeycomb.io/v1/traces

# Headers for authentication (as JSON string)
OTEL_EXPORTER_OTLP_HEADERS={"x-honeycomb-team":"your-api-key"}
```

### Supported Monitoring Services

#### 1. **Honeycomb** (Recommended for developers)
```bash
OTEL_ENABLED=true
OTEL_EXPORTER_OTLP_ENDPOINT=https://api.honeycomb.io/v1/traces
OTEL_EXPORTER_OTLP_HEADERS={"x-honeycomb-team":"YOUR_API_KEY"}
```
- Sign up: https://honeycomb.io
- Great UX, generous free tier

#### 2. **Axiom**
```bash
OTEL_ENABLED=true
OTEL_EXPORTER_OTLP_ENDPOINT=https://api.axiom.co/v1/traces
OTEL_EXPORTER_OTLP_HEADERS={"Authorization":"Bearer YOUR_AXIOM_TOKEN","X-Axiom-Dataset":"YOUR_DATASET"}
```
- Sign up: https://axiom.co
- Logs + traces in one platform

#### 3. **Grafana Cloud**
```bash
OTEL_ENABLED=true
OTEL_EXPORTER_OTLP_ENDPOINT=https://otlp-gateway-prod-us-central-0.grafana.net/otlp/v1/traces
OTEL_EXPORTER_OTLP_HEADERS={"Authorization":"Basic BASE64_ENCODED_CREDENTIALS"}
```
- Sign up: https://grafana.com/products/cloud/
- Full observability stack

#### 4. **Local Development** (OpenTelemetry Collector)
```bash
OTEL_ENABLED=true
OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318/v1/traces
OTEL_EXPORTER_OTLP_HEADERS={}
```

## Architecture

### 1. Instrumentation (`instrumentation.ts`)
- Initializes OpenTelemetry SDK on server startup
- Auto-instruments Next.js routes and Node.js modules
- Only runs in Node.js runtime (not Edge)

### 2. Structured Logger (`lib/logger.ts`)
- Exports: `logger`, `traced()`, `getCurrentTraceId()`
- Automatically includes trace context in logs
- JSON formatted for easy parsing by monitoring tools

### 3. Critical Paths Instrumented

The following critical API routes are fully instrumented:

- **`POST /api/v0/proofs/proved`** - Proof submission
  - Tracks: validation, cluster lookup, block updates, binary uploads
  - Attributes: `team_id`, `block_number`, `cluster_id`, `proof_size`

- **`POST /api/v0/single-machine`** - Machine registration
  - Tracks: validation, cloud instance lookup, cluster creation
  - Attributes: `team_id`, `cloud_instance`, `nickname`

- **Block operations** (`lib/api/blocks.ts`)
  - `findOrCreateBlock()` - Block creation
  - `updateBlock()` - RPC fetching and DB updates

## Usage Examples

### Using the Structured Logger

```typescript
import { logger } from "@/lib/logger"

// Info logging
logger.info("Processing proof request", {
  team_id: "123",
  block_number: 1000
})

// Error logging with exception
try {
  await dangerousOperation()
} catch (error) {
  logger.error("Operation failed", error, {
    operation: "proof_upload",
    block: 1000
  })
}

// Warning
logger.warn("Storage quota exceeded", {
  team_id: "123",
  quota_mb: 100
})
```

### Manual Tracing

```typescript
import { traced } from "@/lib/logger"

export async function myFunction(blockNumber: number) {
  return traced(
    "myFunction",
    async () => {
      // Your async operation here
      const result = await heavyOperation()
      return result
    },
    {
      // Custom attributes (optional)
      block_number: blockNumber,
      operation_type: "heavy"
    }
  )
}
```

### Getting Current Trace ID

```typescript
import { getCurrentTraceId } from "@/lib/logger"

const traceId = getCurrentTraceId()
// Use for correlation in external systems
```

## Log Format

All logs are structured JSON:

```json
{
  "timestamp": "2025-10-08T12:34:56.789Z",
  "level": "info",
  "service": "ethproofs",
  "message": "Processing proof submission",
  "trace_id": "4bf92f3577b34da6a3ce929d0e0e4736",
  "span_id": "00f067aa0ba902b7",
  "team_id": "123",
  "block_number": 1000,
  "cluster_id": 42
}
```

## Monitoring Critical Operations

### Key Metrics to Monitor

1. **Proof Submission Latency**
   - Span: `POST /api/v0/proofs/proved`
   - Watch for: P95 > 2s

2. **Block Update Failures**
   - Filter: `error_message` contains "RPC error"
   - Alert on: Multiple failures in 5min

3. **Storage Quota Issues**
   - Filter: `message` = "Storage quota exceeded"
   - Track: Affected `team_id`s

4. **Database Transaction Errors**
   - Filter: `error_message` contains "DB"
   - Alert on: Any occurrence

### Example Queries (Honeycomb)

**Find slow proof submissions:**
```
HEATMAP(duration_ms)
WHERE name = "POST /api/v0/proofs/proved"
GROUP BY team_id
```

**Track errors by endpoint:**
```
COUNT
WHERE level = "error"
GROUP BY message
```

## Deployment Notes

### Vercel/Netlify
- OpenTelemetry works in serverless functions (Node.js runtime)
- Each function invocation = new trace
- Make sure `OTEL_ENABLED=true` in production environment variables

### Edge Runtime
- OpenTelemetry is NOT supported on Edge runtime
- Use Node.js runtime for instrumented routes

### Performance Impact
- Minimal overhead (~1-5ms per request)
- OTLP export is fire-and-forget (doesn't block responses)
- Graceful degradation on export failures

## Troubleshooting

### Traces not appearing

1. Check `OTEL_ENABLED=true` in your environment
2. Verify endpoint and headers are correct
3. Check server logs for `[OpenTelemetry]` messages
4. Test with local collector first

### High memory usage

- Reduce sampling rate (not implemented yet, but can be added)
- Check for trace export failures causing buildup

### Missing trace context in logs

- Ensure you're using the `logger` from `@/lib/logger`
- Make sure operation is inside a `traced()` block or auto-instrumented route

## Next Steps

Consider adding:
- Custom metrics (gauges, counters)
- Sampling for high-traffic endpoints
- Trace context propagation to external services
- Custom span events for business logic milestones

## Resources

- [OpenTelemetry Docs](https://opentelemetry.io/docs/)
- [Next.js Instrumentation](https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation)
- [OTLP Specification](https://opentelemetry.io/docs/specs/otlp/)
