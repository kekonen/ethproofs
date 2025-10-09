# Telemetry Migration: Telegram → OpenTelemetry

## Current State

The `withTelemetry` middleware has been **upgraded** to use OpenTelemetry + structured logging while **keeping Telegram notifications** for backward compatibility.

### What Changed

**Before:**
- ❌ Console.log for all logs
- ❌ Telegram for critical errors
- ❌ No distributed tracing
- ❌ No trace correlation

**After:**
- ✅ **Structured JSON logging** with trace context
- ✅ **OpenTelemetry tracing** with spans for every request
- ✅ **Full HTTP metrics** (method, path, status, duration)
- ✅ **Error tracking** with stack traces in spans
- ✅ Telegram still works (for now)

## How It Works Now

### 1. Every Request Gets a Trace

```typescript
// Automatically wrapped by withTelemetry (via withAuth)
export const POST = withAuth(async ({ request, user }) => {
  // Your handler code
  // Everything is automatically traced!
})
```

**What happens:**
- OpenTelemetry span created: `POST /api/v0/proofs/proved`
- Attributes added: `http.method`, `http.url`, `http.status_code`
- Structured log: `"Request completed"` with duration
- Telegram notification (if 5xx or sampled 4xx)

### 2. All Logs Include Trace Context

```json
{
  "timestamp": "2025-10-08T12:34:56.789Z",
  "level": "info",
  "message": "Request completed",
  "trace_id": "4bf92f3577b34da6a3ce929d0e0e4736",
  "span_id": "00f067aa0ba902b7",
  "method": "POST",
  "path": "/api/v0/proofs/proved",
  "status_code": 200,
  "duration_ms": 1234.5
}
```

### 3. Errors Are Properly Tracked

**In OpenTelemetry:**
- Exception recorded in span
- Status set to ERROR
- Stack trace captured

**In Logs:**
- Structured error with context
- Error message and stack
- Request metadata

**In Telegram:**
- Still sends notifications (for now)

## Migration Path

### Phase 1: ✅ DONE - Dual Mode
- OpenTelemetry + Telegram both active
- Structured logging everywhere
- Full trace coverage

### Phase 2: Validate (Do This Next)
1. **Enable OpenTelemetry** in production:
   ```bash
   OTEL_EXPORTER_OTLP_ENDPOINT=https://api.datadoghq.com/v1/traces
   OTEL_EXPORTER_OTLP_ENDPOINT=https://api.honeycomb.io/v1/traces
   OTEL_EXPORTER_OTLP_HEADERS={"x-honeycomb-team":"YOUR_API_KEY"}
   ```

2. **Verify data in monitoring service:**
   - Check traces appear for all API calls
   - Verify logs show trace IDs
   - Confirm errors are tracked

3. **Compare Telegram vs. Monitoring:**
   - Are you getting better insights from monitoring?
   - Are alerts more actionable?
   - Is the data easier to query?

### Phase 3: Remove Telegram (When Ready)

**Once you're confident monitoring is working:**

1. **Remove from `withTelemetry`** (`lib/middleware/with-telemetry.ts`):
   - Delete `sendReport()` function
   - Delete `safeSend()` function
   - Delete all `sendReport(...)` calls (marked with `// Still send to Telegram for now`)
   - Delete `sample()` function (if not needed)
   - Remove `@vlad-yakovlev/telegram-md` import

2. **Remove from `package.json`:**
   ```bash
   pnpm remove @vlad-yakovlev/telegram-md
   ```

3. **Remove env vars:**
   - Delete `TELEGRAM_BOT_TOKEN` from .env
   - Delete `TELEGRAM_CHAT_ID` from .env
   - Remove from .env.example

**Estimated effort:** ~15 minutes of code deletion

## Benefits of New Approach

### Better Observability
- **Query your data:** Find slow requests, error patterns, team-specific issues
- **Distributed tracing:** See full request flow across services
- **Correlation:** Link logs to traces to errors to metrics

### Better Developer Experience
- **No Telegram spam:** All in one monitoring dashboard
- **Powerful queries:** Filter by any attribute (team_id, block_number, etc.)
- **Visualizations:** Heatmaps, P95 latency, error rates
- **Alerts:** Set up smart alerts based on thresholds

### Better Production Debugging
- **Trace full requests:** See exactly what happened
- **Error context:** Full stack traces with business context
- **Performance analysis:** Identify slow operations
- **SLO monitoring:** Track service health over time

## Example: Debugging an Error

### With Telegram (Old Way)
```
[unhandled error] POST /api/v0/proofs/proved 500 in 1234.5ms
{
  "date": "2025-10-08T12:34:56.789Z",
  "method": "POST",
  "path": "/api/v0/proofs/proved",
  "statusCode": 500,
  "errorMessage": "Database connection failed"
}
```

**Questions you can't answer:**
- Which team was affected?
- What block number?
- What was the full context?
- Did it happen before/after?

### With OpenTelemetry (New Way)

**In monitoring service:**
1. Search: `trace_id = "4bf92f3577b34da6a3ce929d0e0e4736"`
2. See full trace:
   - Request received
   - Auth validated (which team)
   - Block lookup (which block)
   - Database call failed ← **HERE**
   - Error logged

**In structured logs:**
```json
{
  "level": "error",
  "message": "Unhandled request error",
  "trace_id": "4bf92f3577b34da6a3ce929d0e0e4736",
  "team_id": "team-123",
  "block_number": 1000,
  "error_message": "Database connection failed",
  "error_stack": "...",
  "duration_ms": 1234.5
}
```

**Queries you can run:**
- Show me all errors for team-123
- Show me all failures on block 1000
- Show me P95 latency for this endpoint
- Alert me if error rate > 1% for 5 minutes

## Who Uses This?

Every API route that uses `withAuth()` automatically gets:
- OpenTelemetry tracing
- Structured logging
- Error tracking
- Telegram notifications (for now)

**Current routes:**
- `POST /api/v0/proofs/proved`
- `POST /api/v0/proofs/queued`
- `POST /api/v0/proofs/proving`
- `POST /api/v0/single-machine`
- `POST /api/v0/clusters`
- All other authenticated routes

## Next Steps

1. **Enable OpenTelemetry** in staging/production
2. **Monitor for 1-2 weeks** alongside Telegram
3. **Compare insights** - is monitoring better?
4. **Remove Telegram** when confident

## Questions?

See:
- [OpenTelemetry Setup Guide](./OPENTELEMETRY.md)
- [Implementation Summary](./IMPLEMENTATION_SUMMARY.md)
