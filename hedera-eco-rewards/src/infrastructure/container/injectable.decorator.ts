// Simple injectable decorator for dependency injection
export function Injectable() {
  return function <T extends { new (...args: any[]): {} }>(constructor: T) {
    return constructor;
  };
}