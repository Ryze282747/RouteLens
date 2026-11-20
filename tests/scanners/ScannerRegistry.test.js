
import { describe, it, expect, vi } from "vitest";
import ScannerRegistry from "../../src/scanners/ScannerRegistry.js";

function createScanner(overrides = {}) {
  return {
    id: "test-scanner",
    framework: "test",
    detect: vi.fn().mockResolvedValue(true),
    scan: vi.fn().mockResolvedValue([]),
    destroy: vi.fn(),
    ...overrides
  };
}

function createDeferred() {
  let resolve;
  let reject;

  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });

  return { promise, resolve, reject };
}

describe("ScannerRegistry", () => {
  describe("constructor", () => {
    it("should initialize with an empty registry", () => {
      const registry = new ScannerRegistry();

      expect(registry.count()).toBe(0);
      expect(registry.getAll()).toEqual([]);
      expect(registry.destroyed).toBe(false);
    });
  });

  describe("register()", () => {
    it("should register a valid scanner", () => {
      const registry = new ScannerRegistry();
      const scanner = createScanner();

      expect(registry.register(scanner)).toBe(scanner);
      expect(registry.count()).toBe(1);
      expect(registry.get(scanner.id)).toBe(scanner);
    });

    it("should reject a null scanner", () => {
      const registry = new ScannerRegistry();

      expect(() => registry.register(null)).toThrow(
        "A valid scanner instance is required."
      );
    });

    it("should reject a scanner without an ID", () => {
      const registry = new ScannerRegistry();

      expect(() =>
        registry.register(createScanner({ id: "" }))
      ).toThrow("A scanner must have a valid ID.");
    });

    it("should reject a scanner with a non-string ID", () => {
      const registry = new ScannerRegistry();

      expect(() =>
        registry.register(createScanner({ id: 123 }))
      ).toThrow("A scanner must have a valid ID.");
    });

    it("should reject a scanner without scan()", () => {
      const registry = new ScannerRegistry();

      expect(() =>
        registry.register(createScanner({ scan: null }))
      ).toThrow('Scanner "test-scanner" must implement scan().');
    });

    it("should reject a scanner without detect()", () => {
      const registry = new ScannerRegistry();

      expect(() =>
        registry.register(createScanner({ detect: null }))
      ).toThrow('Scanner "test-scanner" must implement detect().');
    });

    it("should reject duplicate scanner IDs", () => {
      const registry = new ScannerRegistry();

      registry.register(createScanner());

      expect(() =>
        registry.register(createScanner())
      ).toThrow('Scanner "test-scanner" is already registered.');
    });

    it("should allow different scanner IDs", () => {
      const registry = new ScannerRegistry();

      registry.register(createScanner({ id: "flask" }));
      registry.register(createScanner({ id: "express" }));

      expect(registry.count()).toBe(2);
    });
  });

  describe("unregister()", () => {
    it("should unregister an existing scanner", async () => {
      const registry = new ScannerRegistry();
      const scanner = createScanner();

      registry.register(scanner);

      await expect(
        registry.unregister(scanner.id)
      ).resolves.toBe(true);

      expect(registry.get(scanner.id)).toBeNull();
      expect(registry.count()).toBe(0);
      expect(scanner.destroy).toHaveBeenCalledOnce();
    });

    it("should return false for an unknown scanner", async () => {
      const registry = new ScannerRegistry();

      await expect(
        registry.unregister("missing")
      ).resolves.toBe(false);
    });

    it("should await asynchronous scanner cleanup", async () => {
      const registry = new ScannerRegistry();
      const deferred = createDeferred();

      const scanner = createScanner({
        destroy: vi.fn(() => deferred.promise)
      });

      registry.register(scanner);

      let completed = false;

      const unregisterPromise = registry.unregister(scanner.id).then(() => {
        completed = true;
      });

      await Promise.resolve();

      expect(completed).toBe(false);

      deferred.resolve();
      await unregisterPromise;

      expect(completed).toBe(true);
    });

    it("should propagate scanner cleanup errors", async () => {
      const registry = new ScannerRegistry();

      const scanner = createScanner({
        destroy: vi.fn().mockRejectedValue(
          new Error("Cleanup failed")
        )
      });

      registry.register(scanner);

      await expect(
        registry.unregister(scanner.id)
      ).rejects.toThrow("Cleanup failed");

      expect(registry.count()).toBe(0);
    });

    it("should reject unregister after destruction", async () => {
      const registry = new ScannerRegistry();

      await registry.destroy();

      await expect(
        registry.unregister("test-scanner")
      ).rejects.toThrow("ScannerRegistry has been destroyed.");
    });
  });

  describe("getters", () => {
    it("should return a scanner by ID", () => {
      const registry = new ScannerRegistry();
      const scanner = createScanner();

      registry.register(scanner);

      expect(registry.get(scanner.id)).toBe(scanner);
    });

    it("should return null for an unknown ID", () => {
      const registry = new ScannerRegistry();

      expect(registry.get("missing")).toBeNull();
    });

    it("should return all registered scanners", () => {
      const registry = new ScannerRegistry();
      const flask = createScanner({ id: "flask" });
      const express = createScanner({ id: "express" });

      registry.register(flask);
      registry.register(express);

      expect(registry.getAll()).toEqual([ flask, express ]);
    });

    it("should return the correct scanner count", () => {
      const registry = new ScannerRegistry();

      registry.register(createScanner({ id: "flask" }));
      registry.register(createScanner({ id: "express" }));

      expect(registry.count()).toBe(2);
    });
  });

  describe("detect()", () => {
    it("should return scanners that detect a matching workspace", async () => {
      const registry = new ScannerRegistry();
      const scanner = createScanner();

      registry.register(scanner);

      const workspace = { root: "/project" };

      await expect(
        registry.detect(workspace)
      ).resolves.toEqual([ scanner ]);

      expect(scanner.detect).toHaveBeenCalledWith(workspace, {});
    });

    it("should exclude scanners that do not match", async () => {
      const registry = new ScannerRegistry();

      const matching = createScanner({
        id: "matching",
        detect: vi.fn().mockResolvedValue(true)
      });

      const nonMatching = createScanner({
        id: "non-matching",
        detect: vi.fn().mockResolvedValue(false)
      });

      registry.register(matching);
      registry.register(nonMatching);

      await expect(
        registry.detect({ root: "/project" })
      ).resolves.toEqual([ matching ]);
    });

    it("should continue when a scanner detection fails", async () => {
      const registry = new ScannerRegistry();
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => { });

      const failing = createScanner({
        id: "failing",
        detect: vi.fn().mockRejectedValue(
          new Error("Detection failed")
        )
      });

      const working = createScanner({
        id: "working"
      });

      registry.register(failing);
      registry.register(working);

      await expect(
        registry.detect({ root: "/project" })
      ).resolves.toEqual([ working ]);

      expect(errorSpy).toHaveBeenCalled();

      errorSpy.mockRestore();
    });

    it("should reject an invalid workspace", async () => {
      const registry = new ScannerRegistry();

      await expect(
        registry.detect(null)
      ).rejects.toThrow("A valid workspace is required.");
    });

    it("should pass scan options to scanner detection", async () => {
      const registry = new ScannerRegistry();
      const scanner = createScanner();
      const options = { extensions: [ ".py" ] };

      registry.register(scanner);

      await registry.detect({ root: "/project" }, options);

      expect(scanner.detect).toHaveBeenCalledWith(
        { root: "/project" },
        options
      );
    });

    it("should reject when destroyed during detection", async () => {
      const registry = new ScannerRegistry();
      const deferred = createDeferred();

      const scanner = createScanner({
        detect: vi.fn(() => deferred.promise)
      });

      registry.register(scanner);

      const detection = registry.detect({ root: "/project" });

      await Promise.resolve();

      await registry.destroy();

      deferred.resolve(true);

      await expect(detection).rejects.toThrow(
        "ScannerRegistry has been destroyed."
      );
    });
  });

  describe("destroy()", () => {
    it("should destroy all registered scanners", async () => {
      const registry = new ScannerRegistry();

      const flask = createScanner({ id: "flask" });
      const express = createScanner({ id: "express" });

      registry.register(flask);
      registry.register(express);

      await registry.destroy();

      expect(flask.destroy).toHaveBeenCalledOnce();
      expect(express.destroy).toHaveBeenCalledOnce();
      expect(registry.scanners.size).toBe(0);
      expect(registry.destroyed).toBe(true);
    });

    it("should be idempotent", async () => {
      const registry = new ScannerRegistry();
      const scanner = createScanner();

      registry.register(scanner);

      await registry.destroy();
      await registry.destroy();

      expect(scanner.destroy).toHaveBeenCalledOnce();
    });

    it("should continue cleanup when a scanner destroy fails", async () => {
      const registry = new ScannerRegistry();
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => { });

      const failing = createScanner({
        id: "failing",
        destroy: vi.fn().mockRejectedValue(
          new Error("Cleanup failed")
        )
      });

      const working = createScanner({
        id: "working"
      });

      registry.register(failing);
      registry.register(working);

      await expect(registry.destroy()).resolves.toBeUndefined();

      expect(failing.destroy).toHaveBeenCalledOnce();
      expect(working.destroy).toHaveBeenCalledOnce();
      expect(registry.destroyed).toBe(true);

      errorSpy.mockRestore();
    });

    it("should reject registry operations after destruction", async () => {
      const registry = new ScannerRegistry();

      await registry.destroy();

      expect(() => registry.getAll()).toThrow(
        "ScannerRegistry has been destroyed."
      );

      expect(() => registry.count()).toThrow(
        "ScannerRegistry has been destroyed."
      );

      expect(() => registry.register(createScanner())).toThrow(
        "ScannerRegistry has been destroyed."
      );
    });

    it("should wait for cleanup already started by unregister()", async () => {
      const registry = new ScannerRegistry();
      const deferred = createDeferred();

      const scanner = createScanner({
        destroy: vi.fn(() => deferred.promise)
      });

      registry.register(scanner);

      const unregisterPromise = registry.unregister(scanner.id);

      await Promise.resolve();

      let destroyCompleted = false;

      const destroyPromise = registry.destroy().then(() => {
        destroyCompleted = true;
      });

      await Promise.resolve();

      expect(destroyCompleted).toBe(false);

      deferred.resolve();

      await Promise.all([ unregisterPromise, destroyPromise ]);

      expect(destroyCompleted).toBe(true);
      expect(scanner.destroy).toHaveBeenCalledOnce();
    });
  });
});
