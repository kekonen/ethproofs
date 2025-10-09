// Initialize OpenTelemetry SDK only on server
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    // Dynamic import to prevent bundling in client
    const { NodeSDK } = await import("@opentelemetry/sdk-node")
    const { getNodeAutoInstrumentations } = await import(
      "@opentelemetry/auto-instrumentations-node"
    )
    // Use either @opentelemetry/exporter-trace-otlp-grpc or @opentelemetry/exporter-trace-otlp-http, configure
    // exporter URL accordingly. 4317 is default for gRPC, 4318 is for HTTP
    const { OTLPTraceExporter } = await import(
      "@opentelemetry/exporter-trace-otlp-grpc"
    )
    const { OTLPMetricExporter } = await import(
      "@opentelemetry/exporter-metrics-otlp-grpc"
    )
    const { PeriodicExportingMetricReader } = await import(
      "@opentelemetry/sdk-metrics"
    )

    const serviceName = process.env.OTEL_SERVICE_NAME || "ethproofs-api"
    const serviceVersion = process.env.npm_package_version || "0.2.0"
    const otlpEndpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT

    // Only initialize if OTLP endpoint is configured
    if (!otlpEndpoint) {
      console.log(
        "[OpenTelemetry] Disabled. Set OTEL_EXPORTER_OTLP_ENDPOINT to enable observability."
      )
      return
    }

    const headers = process.env.OTEL_EXPORTER_OTLP_HEADERS
      ? JSON.parse(process.env.OTEL_EXPORTER_OTLP_HEADERS)
      : {}

    const sdk = new NodeSDK({
      serviceName,
      traceExporter: new OTLPTraceExporter({
        url: otlpEndpoint,
        headers,
      }),
      metricReader: new PeriodicExportingMetricReader({
        exporter: new OTLPMetricExporter({
          url: otlpEndpoint,
          headers,
        }),
        exportIntervalMillis: 60000, // Export metrics every 60 seconds
      }),
      instrumentations: [
        getNodeAutoInstrumentations({
          // Auto-instrument fetch, http, https, and other Node.js modules
          "@opentelemetry/instrumentation-fs": {
            enabled: false, // Disable filesystem instrumentation (too noisy)
          },
          "@opentelemetry/instrumentation-net": {
            enabled: false, // Disable net instrumentation
          },
        }),
      ],
    })

    try {
      sdk.start()
      console.log(
        `[OpenTelemetry] Observability initialized for ${serviceName}`
      )
      console.log(`  - Traces:  exporting to ${otlpEndpoint}`)
      console.log(`  - Metrics: exporting to ${otlpEndpoint} (every 60s)`)

      // Graceful shutdown
      process.on("SIGTERM", () => {
        sdk
          .shutdown()
          .then(() => console.log("[OpenTelemetry] Observability terminated"))
          .catch((error) =>
            console.error("[OpenTelemetry] Error terminating observability", error)
          )
      })
    } catch (error) {
      console.error("[OpenTelemetry] Failed to initialize observability:", error)
    }
  }
}
