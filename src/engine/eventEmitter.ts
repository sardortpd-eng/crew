import { EventEmitter } from "node:events";

/**
 * Minimal typed wrapper around Node's EventEmitter. Event names map to tuples
 * of listener argument types, giving compile-time safety on emit/on.
 */
export class TypedEmitter<Events extends Record<string, unknown[]>> {
  private readonly emitter = new EventEmitter();

  on<E extends keyof Events>(event: E, listener: (...args: Events[E]) => void): this {
    this.emitter.on(event as string, listener as (...args: unknown[]) => void);
    return this;
  }

  off<E extends keyof Events>(event: E, listener: (...args: Events[E]) => void): this {
    this.emitter.off(event as string, listener as (...args: unknown[]) => void);
    return this;
  }

  protected emit<E extends keyof Events>(event: E, ...args: Events[E]): boolean {
    return this.emitter.emit(event as string, ...args);
  }

  removeAllListeners(): void {
    this.emitter.removeAllListeners();
  }
}
