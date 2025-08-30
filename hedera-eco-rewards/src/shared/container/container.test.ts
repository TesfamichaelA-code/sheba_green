import { describe, it, expect, beforeEach } from 'vitest';
import { DIContainer } from './container';
import { injectable } from 'inversify';

// Test service for dependency injection testing
@injectable()
class TestService {
  public getValue(): string {
    return 'test-value';
  }
}

describe('DIContainer', () => {
  beforeEach(() => {
    DIContainer.reset();
  });

  it('should return a singleton container instance', () => {
    const container1 = DIContainer.getInstance();
    const container2 = DIContainer.getInstance();

    expect(container1).toBe(container2);
  });

  it('should allow binding and resolving services', () => {
    const container = DIContainer.getInstance();
    const testSymbol = Symbol.for('TestService');

    container.bind<TestService>(testSymbol).to(TestService);
    const service = container.get<TestService>(testSymbol);

    expect(service).toBeInstanceOf(TestService);
    expect(service.getValue()).toBe('test-value');
  });

  it('should reset container and clear all bindings', () => {
    const container = DIContainer.getInstance();
    const testSymbol = Symbol.for('TestService');

    container.bind<TestService>(testSymbol).to(TestService);
    expect(container.isBound(testSymbol)).toBe(true);

    DIContainer.reset();
    const newContainer = DIContainer.getInstance();
    expect(newContainer.isBound(testSymbol)).toBe(false);
  });

  it('should use singleton scope by default', () => {
    const container = DIContainer.getInstance();
    const testSymbol = Symbol.for('TestService');

    container.bind<TestService>(testSymbol).to(TestService);

    const service1 = container.get<TestService>(testSymbol);
    const service2 = container.get<TestService>(testSymbol);

    expect(service1).toBe(service2);
  });
});
