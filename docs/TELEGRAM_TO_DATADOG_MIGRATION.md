# Telegram to DataDog Alert Migration Guide

This document maps existing Telegram notifications to their DataDog monitor equivalents.

## Current Telegram Alert Logic

From `lib/middleware/with-telemetry.ts`:

```typescript
// 1. Function Timeout Warning
if (duration approaching timeout) {
  → Send to Telegram: "[timeout warning] {method} {path} 500 in {duration}ms"
}

// 2. 5xx Server Errors (Always alert)
if (status >= 500) {
  await sendReport(`{method} {path} {status} in {duration}ms`)
}

// 3. 4xx Client Errors (10% sample rate)
else if (status >= 400) {
  if (sample(max(sampleRate, 0.1))) {
    safeSend(sendReport(`{method} {path} {status} in {duration}ms`))
  }
}

// 4. Success Responses (Configurable sample rate, default 0%)
else {
  if (sample(sampleRate)) {
    safeSend(sendReport(`{method} {path} {status} in {duration}ms`))
  }
}

// 5. Unhandled Exceptions (Always alert)
catch (error) {
  await sendReport(`[unhandled error] {method} {path} 500 in {duration}ms`)
}
```

## Migration Mapping

### 1. Function Timeout Warning

**Current Telegram:**
```
[timeout warning] POST /api/v0/proofs/proved 500 in 28000.0ms 2025-01-15T10:30:00Z
{
  "date": "2025-01-15T10:30:00Z",
  "method": "POST",
  "path": "/api/v0/proofs/proved",
  "statusCode": 500,
  "durationMs": 28000,
  "errorMessage": "nodejs function timeout imminent"
}
```

**DataDog Monitor:** Monitor #4 in DATADOG_MONITORING_SETUP.md
- Type: Log Monitor
- Query: `service:ethproofs-api @level:warn @message:"Function timeout imminent"`
- Threshold: count > 0 over 1 minute
- Grouping: `@path`, `@method`

**Notification Template:**
```
Function Timeout Warning
Path: {{@path}}
Duration: {{@duration_ms}}ms
This requires immediate investigation.
```

---

### 2. 5xx Server Errors

**Current Telegram:**
```
POST /api/v0/proofs/proved 500 in 1234.5ms 2025-01-15T10:30:00Z
{
  "date": "2025-01-15T10:30:00Z",
  "method": "POST",
  "path": "/api/v0/proofs/proved",
  "statusCode": 500,
  "durationMs": 1234.5
}
```

**DataDog Monitors:**
- **Monitor #1**: High error rate (aggregated)
- **Monitor #2**: Individual 5xx errors (every occurrence)

**Replaces:** 100% of 5xx alerts
- Monitor #1 detects elevated error rates (e.g., >5% over 5 min)
- Monitor #2 alerts on each individual 5xx for critical paths

---

### 3. 4xx Client Errors

**Current Telegram:**
```
POST /api/v0/proofs/proved 400 in 234.5ms 2025-01-15T10:30:00Z
{
  "date": "2025-01-15T10:30:00Z",
  "method": "POST",
  "path": "/api/v0/proofs/proved",
  "statusCode": 400,
  "durationMs": 234.5
}
```

**DataDog Monitor:** Monitor #3 (Authentication Failures)
- Type: Log Monitor
- Query: `service:ethproofs-api @http.status_code:401`
- Threshold: count > 50 over 5 minutes

**Note:** Other 4xx errors (400, 404, 422) are logged but not actively alerted unless they spike significantly. Consider adding monitors if patterns emerge.

**Replaces:** 10% sampled 4xx alerts become 100% logged, threshold-based alerts

---

### 4. Unhandled Exceptions

**Current Telegram:**
```
[unhandled error] POST /api/v0/proofs/proved 500 in 123.4ms 2025-01-15T10:30:00Z
{
  "date": "2025-01-15T10:30:00Z",
  "method": "POST",
  "path": "/api/v0/proofs/proved",
  "statusCode": 500,
  "durationMs": 123.4,
  "errorMessage": "Cannot read property 'id' of undefined"
}
```

**DataDog Monitor:** Monitor #10 in DATADOG_MONITORING_SETUP.md
- Type: Log Monitor
- Query: `service:ethproofs-api @level:error @message:"Unhandled request error"`
- Threshold: count > 0 over 1 minute
- Grouping: `@http.target`, `@error_name`

**Notification Template:**
```
Unhandled Exception: {{@error_name}}
Path: {{@path}}
Message: {{@error_message}}
Stack: {{@error_stack}}
Trace: {{trace_id}}
```

**Replaces:** 100% of unhandled exception alerts

---

## Additional DataDog Monitors (Not in Telegram)

These monitors provide insights that Telegram alerts don't capture:

### Monitor #5: Proof Storage Failures
- Detects systematic storage issues
- Telegram only reports individual errors

### Monitor #6: Block Processing Failures
- Aggregates RPC failures
- Telegram only reports individual timeouts/errors

### Monitor #7: Registration Failures
- Detects prover configuration issues
- Telegram shows symptoms, not root cause

### Monitor #8: P95 Latency Degradation
- Proactive performance monitoring
- Telegram only alerts on timeouts (reactive)

### Monitor #9: Storage Quota Warnings
- Prevents future failures
- Telegram doesn't track quota issues

---

## Alert Volume Comparison

### Current Telegram Volume (estimated)

| Alert Type | Daily Volume (avg) | Notes |
|------------|-------------------|-------|
| 5xx errors | 5-20 | All sent, blocks response |
| 4xx errors | 10-50 | 10% sampled, async |
| Timeout warnings | 0-5 | Rare, immediate action needed |
| Unhandled exceptions | 0-2 | Critical bugs |
| **Total** | **15-77/day** | High variance |

### Expected DataDog Volume

| Monitor | Daily Alerts | Reduction Strategy |
|---------|-------------|-------------------|
| Individual 5xx | 5-20 | Same as Telegram |
| High error rate | 0-3 | Aggregated threshold |
| Auth failures | 0-5 | Spike detection only |
| Timeout warnings | 0-5 | Same as Telegram |
| Unhandled exceptions | 0-2 | Same as Telegram |
| Storage failures | 0-2 | Threshold-based |
| Block failures | 0-2 | Threshold-based |
| Registration issues | 0-3 | Threshold-based |
| P95 latency | 0-2 | Proactive warning |
| **Total** | **5-44/day** | ~40% reduction |

**Key Improvements:**
- Fewer redundant alerts (aggregation)
- Better signal-to-noise ratio
- Proactive warnings before failures
- Grouped by root cause, not symptoms

---

## Migration Checklist

### Phase 1: Setup (Week 1)
- [ ] Configure OTLP exporter in `.env`:
  ```bash
  OTEL_EXPORTER_OTLP_ENDPOINT=https://api.datadoghq.com/v1/traces
  OTEL_EXPORTER_OTLP_HEADERS={"dd-api-key":"<your-key>"}
  OTEL_SERVICE_NAME=ethproofs-api
  ```
- [ ] Deploy with DataDog exporter enabled
- [ ] Verify traces appearing in DataDog APM
- [ ] Verify logs appearing in DataDog Logs

### Phase 2: Monitor Creation (Week 1-2)
- [ ] Create Monitor #1: High Error Rate
- [ ] Create Monitor #2: Individual 5xx Errors
- [ ] Create Monitor #3: Auth Failures
- [ ] Create Monitor #4: Timeout Warnings
- [ ] Create Monitor #5: Storage Failures
- [ ] Create Monitor #6: Block Failures
- [ ] Create Monitor #7: Registration Issues
- [ ] Create Monitor #8: P95 Latency
- [ ] Create Monitor #9: Storage Quota
- [ ] Create Monitor #10: Unhandled Exceptions

### Phase 3: Dashboard Creation (Week 2)
- [ ] Create "Critical Paths" dashboard
- [ ] Add request rate timeseries
- [ ] Add error rate timeseries
- [ ] Add latency percentiles
- [ ] Add business metrics (proofs/hour)
- [ ] Add infrastructure metrics

### Phase 4: Validation (Week 2-3)
- [ ] Run both systems in parallel
- [ ] Compare alert counts (Telegram vs DataDog)
- [ ] Verify no missed critical alerts
- [ ] Tune thresholds based on false positive rate
- [ ] Document any gaps

### Phase 5: Migration (Week 4)
- [ ] Route critical alerts to primary channel
- [ ] Route non-critical alerts to secondary channel
- [ ] Keep Telegram as backup for 1 week
- [ ] Monitor for any issues

### Phase 6: Cleanup (Week 5)
- [ ] Remove Telegram code from `withTelemetry.ts`:
  ```typescript
  // DELETE these functions:
  - sendReport()
  - safeSend()

  // DELETE these calls:
  - await sendReport(...)
  - safeSend(sendReport(...))
  ```
- [ ] Remove Telegram dependencies:
  ```bash
  pnpm remove @vlad-yakovlev/telegram-md
  ```
- [ ] Remove environment variables:
  ```bash
  # Remove from .env:
  - TELEGRAM_BOT_TOKEN
  - TELEGRAM_CHAT_ID
  ```
- [ ] Update documentation
- [ ] Archive Telegram bot

---

## Rollback Plan

If DataDog monitors are not working as expected:

1. **Keep Telegram Active**: Don't remove code until DataDog is validated
2. **Compare Side-by-Side**: Log both systems for 2 weeks minimum
3. **Gradual Cutover**: Route non-critical alerts first, then critical
4. **Emergency Fallback**: Keep Telegram env vars for quick re-enable

---

## Testing DataDog Monitors

### Test Individual 5xx Monitor

```bash
# Trigger a 5xx error
curl -X POST https://your-api.com/api/v0/proofs/proved \
  -H "Authorization: Bearer invalid-key-will-fail-validation" \
  -H "Content-Type: application/json" \
  -d '{"invalid": "payload"}'
```

**Expected:**
- Log appears in DataDog within 1 minute
- Monitor triggers within 2 minutes
- Alert sent to configured channel

### Test High Error Rate Monitor

```bash
# Trigger 10 errors rapidly
for i in {1..10}; do
  curl -X POST https://your-api.com/api/v0/proofs/proved \
    -H "Authorization: Bearer test-key" \
    -d '{"invalid": "payload"}' &
done
```

**Expected:**
- Error rate calculated over 5-minute window
- Alert triggers if rate exceeds threshold
- Alert includes resource_name grouping

### Test Timeout Warning

```bash
# Trigger a slow operation (if you have a test endpoint)
curl -X POST https://your-api.com/api/v0/test/slow \
  -H "Authorization: Bearer test-key"
```

**Expected:**
- Warning log appears before timeout
- Monitor triggers on warning log
- Alert includes duration and path

---

## Benefits of DataDog Over Telegram

| Feature | Telegram | DataDog |
|---------|----------|---------|
| **Alert Aggregation** | ❌ Every error = 1 message | ✅ Threshold-based grouping |
| **Alert Deduplication** | ❌ Duplicate alerts | ✅ Smart grouping by error type |
| **Historical Analysis** | ❌ Chat history only | ✅ Dashboards + query language |
| **Alert Routing** | ❌ One chat for all | ✅ Route by severity/team |
| **On-Call Integration** | ❌ Manual | ✅ PagerDuty/OpsGenie |
| **Runbook Links** | ❌ Manual paste | ✅ Embedded in monitor |
| **Metric Correlation** | ❌ No metrics | ✅ Traces + logs + metrics |
| **SLO Tracking** | ❌ Not possible | ✅ Built-in SLO monitors |
| **Alert Muting** | ❌ Manual | ✅ Downtimes/mute rules |
| **Root Cause Analysis** | ❌ Limited context | ✅ Full trace + logs + APM |

---

## Cost Considerations

**Telegram:**
- Free messaging
- Manual monitoring required
- No analytics or insights

**DataDog:**
- Paid service (estimate $15-50/host/month)
- Automated monitoring and alerting
- Full observability stack
- Reduced on-call burden (fewer false alerts)

**ROI:** Time saved on alert triage and incident response typically justifies cost within first month.

---

## Support

For questions during migration:
- Phase 1-2: Reference `docs/OPENTELEMETRY.md`
- Phase 3: Reference `docs/DATADOG_MONITORING_SETUP.md`
- Phase 4-5: Reference this document
- Phase 6: Reference `docs/MONITORING_QUICK_REFERENCE.md`
