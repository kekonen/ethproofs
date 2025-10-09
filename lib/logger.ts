import { context,SpanStatusCode, trace } from "@opentelemetry/api"

type LogLevel = "debug" | "info" | "warn" | "error"

interface LogContext {
  [key: string]: unknown
}

class Logger {
  private serviceName: string

  constructor(serviceName: string = "ethproofs") {
    this.serviceName = serviceName
  }

  private getTraceContext() {
    const span = trace.getActiveSpan()
    if (!span) return {}

    const spanContext = span.spanContext()
    return {
      trace_id: spanContext.traceId,
      span_id: spanContext.spanId,
    }
  }

  private log(level: LogLevel, message: string, ctx?: LogContext) {
    const timestamp = new Date().toISOString()
    const traceContext = this.getTraceContext()

    const logEntry = {
      timestamp,
      level,
      service: this.serviceName,
      message,
      ...traceContext,
      ...(ctx || {}),
    }

    // Format for structured logging
    const logString = JSON.stringify(logEntry)

    // Output to appropriate stream
    if (level === "error") {
      console.error(logString)
    } else if (level === "warn") {
      console.warn(logString)
    } else {
      console.log(logString)
    }
  }

  debug(message: string, ctx?: LogContext) {
    this.log("debug", message, ctx)
  }

  info(message: string, ctx?: LogContext) {
    this.log("info", message, ctx)
  }

  warn(message: string, ctx?: LogContext) {
    this.log("warn", message, ctx)
  }

  error(message: string, error?: Error | unknown, ctx?: LogContext) {
    const errorContext: LogContext = {
      ...ctx,
    }

    if (error instanceof Error) {
      errorContext.error_message = error.message
      errorContext.error_stack = error.stack
      errorContext.error_name = error.name
    } else if (error) {
      errorContext.error = error
    }

    this.log("error", message, errorContext)

    // Also record error in active span if available
    const span = trace.getActiveSpan()
    if (span && error instanceof Error) {
      span.recordException(error)
      span.setStatus({ code: SpanStatusCode.ERROR, message: error.message })
    }
  }
}

// Export singleton instance
export const logger = new Logger()

// Helper function to create traced operations
export async function traced<T>(
  operationName: string,
  fn: () => Promise<T>,
  attributes?: Record<string, string | number | boolean>
): Promise<T> {
  const tracer = trace.getTracer("ethproofs")

  return tracer.startActiveSpan(operationName, async (span) => {
    try {
      // Add custom attributes to span
      if (attributes) {
        Object.entries(attributes).forEach(([key, value]) => {
          span.setAttribute(key, value)
        })
      }

      const result = await fn()
      span.setStatus({ code: SpanStatusCode.OK })
      return result
    } catch (error) {
      if (error instanceof Error) {
        span.recordException(error)
        span.setStatus({ code: SpanStatusCode.ERROR, message: error.message })
      }
      throw error
    } finally {
      span.end()
    }
  })
}

// Helper to get current trace ID for correlation
export function getCurrentTraceId(): string | undefined {
  const span = trace.getActiveSpan()
  return span?.spanContext().traceId
}
