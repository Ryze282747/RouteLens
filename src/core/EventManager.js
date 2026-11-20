export default class EventManager {
  constructor() {
    this.events = new Map();
    this.destroyed = false;
  }

  on(event, callback) {
    this.ensureActive();
    this.validate(event, callback);

    if (!this.events.has(event)) {
      this.events.set(event, new Set());
    }

    const listeners = this.events.get(event);
    listeners.add(callback);

    return () => this.off(event, callback);
  }

  once(event, callback) {
    this.ensureActive();
    this.validate(event, callback);

    const unsubscribe = this.on(event, (data) => {
      unsubscribe();
      callback(data);
    });

    return unsubscribe;
  }

  off(event, callback) {
    this.ensureActive();

    const listeners = this.events.get(event);

    if (!listeners) {
      return false;
    }

    const removed = listeners.delete(callback);

    if (listeners.size === 0) {
      this.events.delete(event);
    }

    return removed;
  }

  emit(event, data = null) {
    this.ensureActive();

    const listeners = this.events.get(event);

    if (!listeners) {
      return 0;
    }

    let executed = 0;

    for (const callback of [ ...listeners ]) {
      try {
        callback(data);
        executed++;
      } catch (error) {
        console.error(
          `[RouteLens] Event "${event}" listener failed:`,
          error
        );
      }
    }

    return executed;
  }

  removeAllListeners(event = null) {
    this.ensureActive();

    if (event !== null) {
      return this.events.delete(event);
    }

    const count = this.events.size;
    this.events.clear();

    return count;
  }

  listenerCount(event) {
    this.ensureActive();
    return this.events.get(event)?.size || 0;
  }

  validate(event, callback) {
    if (typeof event !== "string" || !event.trim()) {
      throw new TypeError("Event name must be a non-empty string.");
    }

    if (typeof callback !== "function") {
      throw new TypeError("Event callback must be a function.");
    }
  }

  ensureActive() {
    if (this.destroyed) {
      throw new Error("EventManager has been destroyed.");
    }
  }

  destroy() {
    if (this.destroyed) {
      return;
    }

    this.events.clear();
    this.destroyed = true;
  }
}
