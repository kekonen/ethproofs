# Add OpenTelemetry instrumentation for monitoring and observability

## What's changed

Added OpenTelemetry tracing and structured logging across the backend to replace (eventually) and improve upon the current Telegram-based error alerting.

### Main changes:
- Instrumented all critical API endpoints (proof submissions, machine registration, etc.) with distributed tracing
- Replaced `console.log`/`console.error` with structured JSON logging that includes trace context
- Added a child logger pattern to keep logging code DRY without losing context
- Set up OTLP exporter that works with DataDog, Honeycomb, and other monitoring services
- Kept existing Telegram alerts in place (marked for future removal once monitoring is validated)

### Why OpenTelemetry?

Right now we get Telegram messages when things break, which works but has limitations:
- Every error = separate message (gets noisy fast)
- No way to see trends or build dashboards
- Hard to correlate related errors
- Limited historical analysis

With a proper monitoring service you get all of that plus:
- Grouped/deduplicated alerts based on error type
- Customizable alert thresholds (don't alert on every 4xx, but definitely alert if error rate spikes)
- Dashboards showing proof throughput, latency trends, error rates over time
- Full request traces to debug issues faster
- SLA tracking

The Telegram integration stays active for now - this just adds better observability alongside it.

## Monitoring service options

I'd recommend **DataDog** for production since it has:
- Built-in alerting that can replace Telegram
- Good APM with request traces
- Log aggregation
- Custom dashboards
- PagerDuty/Slack integrations

Other options (in order of usefulness):
- **Honeycomb** - Great for debugging specific requests, generous free tier, good for dev
- **Axiom** - Logs + traces in one place, simpler than DataDog
- **Grafana Cloud** - Full observability stack if you want more control
- **Local collector** - For testing/development

All of them use the same OpenTelemetry standard, so switching between them is just changing an environment variable.

## Setup

To enable (disabled by default):

```bash
# In .env
OTEL_EXPORTER_OTLP_ENDPOINT=https://api.datadoghq.com/v1/traces
OTEL_EXPORTER_OTLP_HEADERS={"dd-api-key":"your-key"}
```

Leave `OTEL_EXPORTER_OTLP_ENDPOINT` empty to disable.

## What's instrumented

Right now:
- All proof submission endpoints (queued, proving, proved)
- Machine registration (single-machine, clusters)
- Block processing and RPC calls
- Storage operations (proof binaries, verification keys)
- Authentication failures

Every log entry includes:
- Trace ID (links logs to requests)
- Team ID, block number, cluster ID, etc.
- Error details with stack traces
- Request duration

## Documentation

Added comprehensive docs:
- `docs/OPENTELEMETRY.md` - Setup guide for different services
- `docs/DATADOG_MONITORING_SETUP.md` - 10 production-ready monitors to replace Telegram alerts
- `docs/MONITORING_QUICK_REFERENCE.md` - Quick reference for common queries
- `docs/TELEGRAM_TO_DATADOG_MIGRATION.md` - Migration plan with testing checklist

## Next steps

This PR adds the instrumentation but doesn't change any alerts yet. To actually use this:

1. Pick a monitoring service (DataDog recommended)
2. Set up the OTLP endpoint
3. Create monitors based on `docs/DATADOG_MONITORING_SETUP.md`
4. Run both Telegram + monitors in parallel for a week or two
5. Once validated, remove Telegram code from `lib/middleware/with-telemetry.ts`

Could also instrument more parts of the backend later (database queries, external API calls, etc.) to get even deeper visibility into what's happening.

## Testing

- TypeScript compiles clean
- No runtime changes when monitoring is disabled (default)
- Existing Telegram alerts still work
- All backend routes have structured logging

Let me know if you want me to adjust anything or if you have questions about the monitoring setup.
