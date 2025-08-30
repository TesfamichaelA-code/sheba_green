import { ITracer, Span, SpanContext, TraceConfig, TAGS } from './tracing.interface.js';
import { createMockTracer } from './mock-tracer.js';

// Try to import jaeger-client, fall back to mock if not available
let initTracer: any;
let JaegerTracer: any;

try {
  const jaegerClient = require('jaeger-client');
  initTracer = jaegerClient.initTracer;
  JaegerTracer = jaegerClient.JaegerTracer;
} catch (error) {
  console.warn('Jaeger client not available, using mock tracer');
}

/**
 * Jaeger-based distributed tracing implementation
 */
export class JaegerTracerImpl implements ITracer {
  private tracer: JaegerTracer;
  private activeSpans = new Map<string, JaegerSpan>();

  constructor(config: TraceConfig) {
    const jaegerConfig = {
      serviceName: config.serviceName,
      sampler: {
        type: 'const',
        param: config.sampleRate || 1.0
      },
      reporter: {
        logSpans: process.env.NODE_ENV === 'development',
        agentHost: process.env.JAEGER_AGENT_HOST || 'localhost',
        agentPort: parseInt(process.env.JAEGER_AGENT_PORT || '6832'),
        collectorEndpoint: config.endpoint
      }
    };

    this.tracer = initTracer(jaegerConfig, {
      tags: {
        'hedera-eco-rewards.version': process.env.npm_package_version || '1.0.0',
        ...config.tags
      }
    });
  }

  startSpan(operationName: string, parentSpan?: Span): Span {
    const parentContext = parentSpan?.getContext();
    const jaegerSpan = this.tracer.startSpan(operationName, {
      childOf: parentContext ? this.createJaegerSpanContext(parentContext) : undefined
    });

    const span = new JaegerSpan(jaegerSpan);
    this.activeSpans.set(span.getSpanId(), span);
    
    return span;
  }

  createChildSpan(operationName: string): Span {
    const currentSpan = this.getCurrentSpan();
    return this.startSpan(operationName, currentSpan);
  }

  getCurrentSpan(): Span | null {
    // In a real implementation, this would use context propagation
    // For now, return the most recently created span
    const spans = Array.from(this.activeSpans.values());
    return spans.length > 0 ? spans[spans.length - 1] : null;
  }

  inject(span: Span, carrier: any): void {
    const jaegerSpan = this.getJaegerSpan(span);
    if (jaegerSpan) {
      this.tracer.inject(jaegerSpan, 'http_headers', carrier);
    }
  }

  extract(carrier: any): SpanContext | null {
    try {
      const spanContext = this.tracer.extract('http_headers', carrier);
      if (spanContext) {
        return {
          traceId: spanContext.traceId,
          spanId: spanContext.spanId,
          parentSpanId: spanContext.parentId
        };
      }
    } catch (error) {
      // Ignore extraction errors
    }
    return null;
  }

  async flush(): Promise<void> {
    return new Promise((resolve) => {
      this.tracer.close(resolve);
    });
  }

  private getJaegerSpan(span: Span): any {
    if (span instanceof JaegerSpan) {
      return span.getJaegerSpan();
    }
    return null;
  }

  private createJaegerSpanContext(context: SpanContext): any {
    return {
      traceId: context.traceId,
      spanId: context.spanId,
      parentId: context.parentSpanId
    };
  }
}

/**
 * Wrapper for Jaeger span implementation
 */
class JaegerSpan implements Span {
  private jaegerSpan: any;
  private spanId: string;
  private traceId: string;

  constructor(jaegerSpan: any) {
    this.jaegerSpan = jaegerSpan;
    this.spanId = jaegerSpan.context().spanId;
    this.traceId = jaegerSpan.context().traceId;
  }

  getTraceId(): string {
    return this.traceId;
  }

  getSpanId(): string {
    return this.spanId;
  }

  setOperationName(name: string): Span {
    this.jaegerSpan.setOperationName(name);
    return this;
  }

  setTag(key: string, value: any): Span {
    this.jaegerSpan.setTag(key, value);
    return this;
  }

  setTags(tags: { [key: string]: any }): Span {
    Object.entries(tags).forEach(([key, value]) => {
      this.jaegerSpan.setTag(key, value);
    });
    return this;
  }

  log(fields: { [key: string]: any }): Span {
    this.jaegerSpan.log(fields);
    return this;
  }

  finish(finishTime?: number): void {
    this.jaegerSpan.finish(finishTime);
  }

  createChild(operationName: string): Span {
    const childSpan = this.jaegerSpan.tracer().startSpan(operationName, {
      childOf: this.jaegerSpan
    });
    return new JaegerSpan(childSpan);
  }

  getContext(): SpanContext {
    const context = this.jaegerSpan.context();
    return {
      traceId: context.traceId,
      spanId: context.spanId,
      parentSpanId: context.parentId
    };
  }

  getJaegerSpan(): any {
    return this.jaegerSpan;
  }
}

// Create tracer instance
export const createTracer = (config: TraceConfig): ITracer => {
  if (!initTracer || !JaegerTracer) {
    console.warn('Using mock tracer instead of Jaeger');
    return createMockTracer(config);
  }
  return new JaegerTracerImpl(config);
};

// Default tracer instance
export const tracer = createTracer({
  serviceName: 'hedera-eco-rewards',
  sampleRate: parseFloat(process.env.TRACE_SAMPLE_RATE || '1.0')
});