import {
  describe,
  it,
  expect,
  beforeEach,
  vi
} from "vitest";

import ExportManager from "../../src/exporters/ExportManager.js";
import MarkdownExporter from "../../src/exporters/MarkdownExporter.js";
import JSONExporter from "../../src/exporters/JSONExporter.js";

describe("ExportManager", () => {
  let manager;
  let markdownExporter;
  let jsonExporter;

  const createExporter = (content = "exported content") => ({
    export: vi.fn().mockResolvedValue(content),
    destroy: vi.fn()
  });

  const createData = () => ({
    routes: []
  });

  beforeEach(() => {
    markdownExporter = createExporter("# Documentation");
    jsonExporter = createExporter('{"routes":[]}');

    manager = new ExportManager({
      markdownExporter,
      jsonExporter
    });
  });

  describe("Initialization", () => {
    it("should initialize as active", () => {
      expect(manager.destroyed).toBe(false);
    });

    it("should register the Markdown exporter", () => {
      expect(manager.getExporter("markdown")).toBe(
        markdownExporter
      );
    });

    it("should register the md alias", () => {
      expect(manager.getExporter("md")).toBe(
        markdownExporter
      );
    });

    it("should register the JSON exporter", () => {
      expect(manager.getExporter("json")).toBe(
        jsonExporter
      );
    });

    it("should support default exporters when none are injected", () => {
      const defaultManager = new ExportManager();

      expect(
        defaultManager.getExporter("markdown")
      ).toBeInstanceOf(MarkdownExporter);

      expect(
        defaultManager.getExporter("json")
      ).toBeInstanceOf(JSONExporter);

      defaultManager.destroy();
    });

    it("should initialize with the expected supported formats", () => {
      expect(manager.getSupportedFormats()).toEqual([
        "markdown",
        "md",
        "json"
      ]);
    });
  });

  describe("Format normalization", () => {
    it("should normalize uppercase formats", () => {
      expect(manager.getExporter("JSON")).toBe(
        jsonExporter
      );
    });

    it("should normalize whitespace around formats", () => {
      expect(manager.getExporter(" markdown ")).toBe(
        markdownExporter
      );
    });

    it("should remove a leading period from formats", () => {
      expect(manager.getExporter(".json")).toBe(
        jsonExporter
      );
    });

    it("should return null for an empty format", () => {
      expect(manager.getExporter("")).toBeNull();
    });

    it("should return null for whitespace-only formats", () => {
      expect(manager.getExporter("   ")).toBeNull();
    });

    it("should return null for non-string formats", () => {
      expect(manager.getExporter(123)).toBeNull();
      expect(manager.getExporter(null)).toBeNull();
      expect(manager.getExporter(undefined)).toBeNull();
    });

    it("should return null for unsupported formats", () => {
      expect(manager.getExporter("xml")).toBeNull();
    });
  });

  describe("Exporter registration", () => {
    it("should register a custom exporter", () => {
      const customExporter = createExporter();

      const result = manager.register(
        "xml",
        customExporter
      );

      expect(result).toBe(customExporter);
      expect(manager.getExporter("xml")).toBe(
        customExporter
      );
    });

    it("should normalize a custom format during registration", () => {
      const customExporter = createExporter();

      manager.register(".XML", customExporter);

      expect(manager.getExporter("xml")).toBe(
        customExporter
      );
    });

    it("should replace an existing exporter", () => {
      const replacement = createExporter();

      manager.register("json", replacement);

      expect(manager.getExporter("json")).toBe(
        replacement
      );
    });

    it("should allow registration of exporters without destroy", () => {
      const customExporter = {
        export: vi.fn().mockResolvedValue("content")
      };

      manager.register("custom", customExporter);

      expect(manager.getExporter("custom")).toBe(
        customExporter
      );
    });

    it("should reject an empty format", () => {
      expect(() => {
        manager.register("", createExporter());
      }).toThrow(
        "An export format must be provided."
      );
    });

    it("should reject a non-string format", () => {
      expect(() => {
        manager.register(123, createExporter());
      }).toThrow(
        "An export format must be provided."
      );
    });

    it("should reject a missing exporter", () => {
      expect(() => {
        manager.register("custom", null);
      }).toThrow(
        "Exporter must implement export()."
      );
    });

    it("should reject an exporter without an export method", () => {
      expect(() => {
        manager.register("custom", {
          destroy: vi.fn()
        });
      }).toThrow(
        "Exporter must implement export()."
      );
    });

    it("should reject a non-function export property", () => {
      expect(() => {
        manager.register("custom", {
          export: "invalid"
        });
      }).toThrow(
        "Exporter must implement export()."
      );
    });
  });

  describe("Exporter removal", () => {
    it("should unregister an exporter", () => {
      expect(manager.unregister("json")).toBe(true);
      expect(manager.getExporter("json")).toBeNull();
    });

    it("should unregister only the requested alias", () => {
      expect(manager.unregister("md")).toBe(true);

      expect(manager.getExporter("md")).toBeNull();
      expect(manager.getExporter("markdown")).toBe(
        markdownExporter
      );
    });

    it("should normalize formats when unregistering", () => {
      expect(manager.unregister(".JSON")).toBe(true);
      expect(manager.getExporter("json")).toBeNull();
    });

    it("should return false for an unsupported format", () => {
      expect(manager.unregister("xml")).toBe(false);
    });

    it("should return false for an empty format", () => {
      expect(manager.unregister("")).toBe(false);
    });

    it("should return false for a non-string format", () => {
      expect(manager.unregister(null)).toBe(false);
    });
  });

  describe("Export execution", () => {
    it("should export using the requested format", async () => {
      const data = createData();

      const result = await manager.export(
        data,
        "markdown"
      );

      expect(markdownExporter.export).toHaveBeenCalledWith(
        data,
        {}
      );

      expect(result.content).toBe("# Documentation");
    });

    it("should export using the md alias", async () => {
      const result = await manager.export(
        createData(),
        "md"
      );

      expect(result.format).toBe("md");
      expect(markdownExporter.export).toHaveBeenCalled();
    });

    it("should export using JSON", async () => {
      const result = await manager.export(
        createData(),
        "json"
      );

      expect(result.content).toBe('{"routes":[]}');
      expect(jsonExporter.export).toHaveBeenCalled();
    });

    it("should normalize the requested format", async () => {
      const result = await manager.export(
        createData(),
        " JSON "
      );

      expect(result.format).toBe("json");
    });

    it("should pass export options to the exporter", async () => {
      const data = createData();

      const options = {
        pretty: false,
        includeAnalysis: false
      };

      await manager.export(data, "json", options);

      expect(jsonExporter.export).toHaveBeenCalledWith(
        data,
        options
      );
    });

    it("should return the normalized format", async () => {
      const result = await manager.export(
        createData(),
        ".JSON"
      );

      expect(result.format).toBe("json");
    });

    it("should return the export content", async () => {
      const result = await manager.export(
        createData(),
        "markdown"
      );

      expect(result.content).toBe("# Documentation");
    });

    it("should reject an empty format", async () => {
      await expect(
        manager.export(createData(), "")
      ).rejects.toThrow(
        "An export format must be provided."
      );
    });

    it("should reject a missing format", async () => {
      await expect(
        manager.export(createData())
      ).rejects.toThrow(
        "An export format must be provided."
      );
    });

    it("should reject unsupported formats", async () => {
      await expect(
        manager.export(createData(), "xml")
      ).rejects.toThrow(
        "Unsupported export format: xml"
      );
    });

    it("should reject null export options", async () => {
      await expect(
        manager.export(createData(), "json", null)
      ).rejects.toThrow(
        "Export options must be an object."
      );
    });

    it("should reject array export options", async () => {
      await expect(
        manager.export(createData(), "json", [])
      ).rejects.toThrow(
        "Export options must be an object."
      );
    });

    it("should reject non-object export options", async () => {
      await expect(
        manager.export(createData(), "json", "invalid")
      ).rejects.toThrow(
        "Export options must be an object."
      );
    });

    it("should propagate exporter errors", async () => {
      const error = new Error("Export failed");

      markdownExporter.export.mockRejectedValueOnce(error);

      await expect(
        manager.export(createData(), "markdown")
      ).rejects.toThrow("Export failed");
    });

    it("should reject exporters that return non-string content", async () => {
      const invalidExporter = {
        export: vi.fn().mockResolvedValue({
          content: "not a string"
        })
      };

      manager.register("invalid", invalidExporter);

      await expect(
        manager.export(createData(), "invalid")
      ).rejects.toThrow(
        'Exporter "invalid" must return a string.'
      );
    });

    it("should reject an export if the manager is destroyed while exporting", async () => {
      let resolveExport;

      const pendingExporter = {
        export: vi.fn(() => new Promise(resolve => {
          resolveExport = resolve;
        }))
      };

      manager.register("pending", pendingExporter);

      const exportPromise = manager.export(
        createData(),
        "pending"
      );

      manager.destroy();
      resolveExport("completed");

      await expect(exportPromise).rejects.toThrow(
        "ExportManager has been destroyed."
      );
    });
  });

  describe("Filename generation", () => {
    it("should generate the default Markdown filename", async () => {
      const result = await manager.export(
        createData(),
        "markdown"
      );

      expect(result.filename).toBe(
        "routelens-export.markdown"
      );
    });

    it("should generate the default JSON filename", async () => {
      const result = await manager.export(
        createData(),
        "json"
      );

      expect(result.filename).toBe(
        "routelens-export.json"
      );
    });

    it("should use a custom filename", async () => {
      const result = await manager.export(
        createData(),
        "json",
        { filename: "api-docs" }
      );

      expect(result.filename).toBe("api-docs.json");
    });

    it("should remove an existing extension", async () => {
      const result = await manager.export(
        createData(),
        "json",
        { filename: "api-docs.md" }
      );

      expect(result.filename).toBe("api-docs.json");
    });

    it("should trim custom filenames", async () => {
      const result = await manager.export(
        createData(),
        "json",
        { filename: "  api-docs  " }
      );

      expect(result.filename).toBe("api-docs.json");
    });

    it("should replace invalid filename characters", async () => {
      const result = await manager.export(
        createData(),
        "json",
        { filename: 'api/docs:*?"<>|test' }
      );

      expect(result.filename).toBe(
        "api-docs-------test.json"
      );
    });

    it("should use the default filename for empty custom names", async () => {
      const result = await manager.export(
        createData(),
        "json",
        { filename: "   " }
      );

      expect(result.filename).toBe(
        "routelens-export.json"
      );
    });

    it("should use the default filename for non-string names", async () => {
      const result = await manager.export(
        createData(),
        "json",
        { filename: 123 }
      );

      expect(result.filename).toBe(
        "routelens-export.json"
      );
    });

    it("should use the default filename when sanitization empties the name", async () => {
      const result = await manager.export(
        createData(),
        "json",
        { filename: ".abc" }
      );

      expect(result.filename).toBe(
        "routelens-export.json"
      );
    });
  });

  describe("MIME types", () => {
    it("should return the Markdown MIME type", async () => {
      const result = await manager.export(
        createData(),
        "markdown"
      );

      expect(result.mimeType).toBe("text/markdown");
    });

    it("should return the Markdown MIME type for md", async () => {
      const result = await manager.export(
        createData(),
        "md"
      );

      expect(result.mimeType).toBe("text/markdown");
    });

    it("should return the JSON MIME type", async () => {
      const result = await manager.export(
        createData(),
        "json"
      );

      expect(result.mimeType).toBe("application/json");
    });

    it("should return text/plain for custom formats", async () => {
      manager.register("xml", createExporter("<routes />"));

      const result = await manager.export(
        createData(),
        "xml"
      );

      expect(result.mimeType).toBe("text/plain");
    });
  });

  describe("Supported formats", () => {
    it("should return all registered formats", () => {
      expect(manager.getSupportedFormats()).toEqual([
        "markdown",
        "md",
        "json"
      ]);
    });

    it("should include custom formats", () => {
      manager.register("xml", createExporter());

      expect(manager.getSupportedFormats()).toContain("xml");
    });

    it("should exclude unregistered formats", () => {
      manager.unregister("json");

      expect(manager.getSupportedFormats()).not.toContain("json");
    });

    it("should not return duplicate format names", () => {
      manager.register("markdown", createExporter());

      expect(manager.getSupportedFormats()).toEqual([
        "markdown",
        "md",
        "json"
      ]);
    });
  });

  describe("Lifecycle", () => {
    it("should not destroy constructor-injected exporters", () => {
      manager.destroy();

      expect(markdownExporter.destroy).not.toHaveBeenCalled();
      expect(jsonExporter.destroy).not.toHaveBeenCalled();
    });

    it("should destroy an exporter registered under multiple aliases only once", () => {
      const sharedExporter = createExporter();

      manager.register("custom", sharedExporter);
      manager.register("custom-alias", sharedExporter);

      manager.destroy();

      expect(sharedExporter.destroy).toHaveBeenCalledOnce();
    });

    it("should clear registered exporters after destruction", () => {
      manager.destroy();

      expect(manager.exporters.size).toBe(0);
    });

    it("should mark the manager as destroyed", () => {
      manager.destroy();

      expect(manager.destroyed).toBe(true);
    });

    it("should allow repeated destruction", () => {
      manager.destroy();
      manager.destroy();

      expect(manager.destroyed).toBe(true);
      expect(markdownExporter.destroy).not.toHaveBeenCalled();
      expect(jsonExporter.destroy).not.toHaveBeenCalled();
    });

    it("should destroy internally-created default exporters", () => {
      const defaultManager = new ExportManager();

      const markdown = defaultManager.getExporter("markdown");
      const json = defaultManager.getExporter("json");

      const markdownDestroy = vi.spyOn(markdown, "destroy");
      const jsonDestroy = vi.spyOn(json, "destroy");

      defaultManager.destroy();

      expect(markdownDestroy).toHaveBeenCalledOnce();
      expect(jsonDestroy).toHaveBeenCalledOnce();
    });

    it("should handle exporters without a destroy method", () => {
      manager.register("custom", {
        export: vi.fn().mockResolvedValue("content")
      });

      expect(() => manager.destroy()).not.toThrow();
    });

    it("should continue destroying exporters when one cleanup fails", () => {
      const failingExporter = {
        export: vi.fn(),
        destroy: vi.fn(() => {
          throw new Error("Cleanup failed");
        })
      };

      manager.register("failing", failingExporter);

      const consoleError = vi
        .spyOn(console, "error")
        .mockImplementation(() => { });

      expect(() => manager.destroy()).not.toThrow();

      expect(failingExporter.destroy).toHaveBeenCalledOnce();
      expect(markdownExporter.destroy).not.toHaveBeenCalled();
      expect(jsonExporter.destroy).not.toHaveBeenCalled();
      expect(consoleError).toHaveBeenCalled();

      consoleError.mockRestore();
    });

    it("should reject registration after destruction", () => {
      manager.destroy();

      expect(() => {
        manager.register("custom", createExporter());
      }).toThrow(
        "ExportManager has been destroyed."
      );
    });

    it("should reject unregistration after destruction", () => {
      manager.destroy();

      expect(() => {
        manager.unregister("json");
      }).toThrow(
        "ExportManager has been destroyed."
      );
    });

    it("should reject exporter lookup after destruction", () => {
      manager.destroy();

      expect(() => {
        manager.getExporter("json");
      }).toThrow(
        "ExportManager has been destroyed."
      );
    });

    it("should reject supported format lookup after destruction", () => {
      manager.destroy();

      expect(() => {
        manager.getSupportedFormats();
      }).toThrow(
        "ExportManager has been destroyed."
      );
    });

    it("should reject export after destruction", async () => {
      manager.destroy();

      await expect(
        manager.export(createData(), "json")
      ).rejects.toThrow(
        "ExportManager has been destroyed."
      );
    });
  });
});
