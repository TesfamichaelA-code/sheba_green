import { ITracer, Span, SpanContext, TraceConfig, TAGS } from './tracing.interface.js';

/**
 * Mock tracer implementation for testing and development
 */
export class MockTracer implements ITracer {
  private spans: MockSpan[] = [];

  startSpan(operationName: string, parentSpan?: Span): Span {
    const span = new MockSpan(operationName, parentSpan?.getContext());
    this.spans.push(span);
    return span;
  }

  createChildSpan(operationName: string): Span {
    return this.startSpan(operationName);
  }

  getCurrentSpan(): Span | null {
    return this.spans.length > 0 ? this.spans[this.spans.length - 1] : null;
  }

  inject(span: Span, carrier: any): void {
    const context = span.getContext();
    carrier['x-trace-id'] = context.traceId;
    carrier['x-span-id'] = context.spanId;
  }

  extract(carrier: any): SpanContext | null {
    if (carrier['x-trace-id'] && carrier['x-span-id']) {
      return {
        traceId: carrier['x-trace-id'],
        spanId: carrier['x-span-id']
      };
    }
    return null;
  }

  async flush(): Promise<void> {
    // Mock implementation - no-op
  }

  getSpans(): MockSpan[] {
    return [...this.spans];
  }

  clear(): void {
    this.spans = [];
  }
}

class MockSpan implements Span {
  private traceId: string;
  private spanId: string;
  private operationName: string;
  private tags: { [key: string]: any } = {};
  private logs: Array<{ [key: string]: any }> = [];
  private finished = false;
  private parentContext?: SpanContext;

  constructor(operationName: string, parentContext?: SpanContext) {
    this.operationName = operationName;
    this.traceId = parentContext?.traceId || this.generateId();
    this.spanId = this.generateId();
    this.parentContext = parentContext;
  }

  getTraceId(): string {
    return this.traceId;
  }

  getSpanId(): string {
    return this.spanId;
  }

  setOperationName(name: string): Span {
    this.operationName = name;
    return this;
  }

  setTag(key: string, value: any): Span {
    this.tags[key] = value;
    return this;
  }

  setTags(tags: { [key: string]: any }): Span {
    Object.assign(this.tags, tags);
    return this;
  }

  log(fields: { [key: string]: any }): Span {
    this.logs.push({ ...fields, timestamp: Date.now() });
    return this;
  }

  finish(finishTime?: number): void {
    this.finished = true;
    this.tags.finishTime = finishTime || Date.now();
  }

  createChild(operationName: string): Span {
    return new MockSpan(operationName, this.getContext());
  }

  getContext(): SpanContext {
    return {
      traceId: this.traceId,
      spanId: this.spanId,
      parentSpanId: this.parentContext?.spanId
    };
  }

  // Test helpers
  getTags(): { [key: string]: any } {
    return { ...this.tags };
  }

  getLogs(): Array<{ [key: string]: any }> {
    return [...this.logs];
  }

  isFinished(): boolean {
    return this.finished;
  }

  getOperationName(): string {
    return this.operationName;
  }

  private generateId(): string {
    return Math.random().toString(36).substring(2, 15);
  }
}

// Create mock tracer instance
export const createMockTracer = (config?: TraceConfig): ITracer => {
  return new MockTracer();
};

// Default mock tracer instance
export const mockTracer = createMockTracer();