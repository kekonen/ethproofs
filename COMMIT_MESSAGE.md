# Commit Message

```
feat: add OpenTelemetry instrumentation for monitoring

Added distributed tracing and structured logging across backend API routes
to improve observability and enable production monitoring.

Changes:
- Instrument critical endpoints with OpenTelemetry tracing
- Replace console.log with structured JSON logging
- Add child logger pattern for DRY code
- Support DataDog, Honeycomb, Axiom, Grafana Cloud via OTLP
- Document 10 production monitors to replace Telegram alerts
- Keep existing Telegram alerts (marked for future removal)

Monitoring is disabled by default. Enable by setting:
  OTEL_EXPORTER_OTLP_ENDPOINT=https://api.datadoghq.com/v1/traces

See docs/OPENTELEMETRY.md for setup details.
```
