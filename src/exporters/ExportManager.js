import MarkdownExporter from "./MarkdownExporter.js";
import JSONExporter from "./JSONExporter.js";

export default class ExportManager {
  constructor({
    markdownExporter,
    jsonExporter
  } = {}) {
    const ownsMarkdownExporter =
      markdownExporter === undefined;

    const ownsJSONExporter =
      jsonExporter === undefined;

    markdownExporter ??= new MarkdownExporter();
    jsonExporter ??= new JSONExporter();

    this.exporters = new Map([
      [ "markdown", markdownExporter ],
      [ "md", markdownExporter ],
      [ "json", jsonExporter ]
    ]);

    this.ownedExporters = new Set();

    if (ownsMarkdownExporter) {
      this.ownedExporters.add(markdownExporter);
    }

    if (ownsJSONExporter) {
      this.ownedExporters.add(jsonExporter);
    }

    this.callerOwnedExporters = new Set();

    if (!ownsMarkdownExporter) {
      this.callerOwnedExporters.add(markdownExporter);
    }

    if (!ownsJSONExporter) {
      this.callerOwnedExporters.add(jsonExporter);
    }

    this.destroyed = false;
  }

  register(format, exporter) {
    this.ensureActive();

    const normalizedFormat = this.normalizeFormat(format);

    if (!normalizedFormat) {
      throw new TypeError(
        "An export format must be provided."
      );
    }

    if (
      !exporter ||
      typeof exporter.export !== "function"
    ) {
      throw new TypeError(
        "Exporter must implement export()."
      );
    }

    this.exporters.set(normalizedFormat, exporter);

    if (!this.callerOwnedExporters.has(exporter)) {
      this.ownedExporters.add(exporter);
    }

    return exporter;
  }

  unregister(format) {
    this.ensureActive();

    const normalizedFormat = this.normalizeFormat(format);

    if (!normalizedFormat) {
      return false;
    }

    return this.exporters.delete(normalizedFormat);
  }

  getExporter(format) {
    this.ensureActive();

    const normalizedFormat = this.normalizeFormat(format);

    if (!normalizedFormat) {
      return null;
    }

    return this.exporters.get(normalizedFormat) || null;
  }

  async export(data, format, options = {}) {
    this.ensureActive();

    const normalizedFormat = this.normalizeFormat(format);

    if (!normalizedFormat) {
      throw new TypeError(
        "An export format must be provided."
      );
    }

    if (
      !options ||
      typeof options !== "object" ||
      Array.isArray(options)
    ) {
      throw new TypeError(
        "Export options must be an object."
      );
    }

    const exporter = this.exporters.get(normalizedFormat);

    if (!exporter) {
      throw new Error(
        `Unsupported export format: ${format}`
      );
    }

    const content = await exporter.export(data, options);

    this.ensureActive();

    if (typeof content !== "string") {
      throw new Error(
        `Exporter "${normalizedFormat}" must return a string.`
      );
    }

    return {
      format: normalizedFormat,
      filename: this.createFilename(
        options.filename,
        normalizedFormat
      ),
      mimeType: this.getMimeType(normalizedFormat),
      content
    };
  }

  normalizeFormat(format) {
    if (
      typeof format !== "string" ||
      !format.trim()
    ) {
      return null;
    }

    return format
      .trim()
      .toLowerCase()
      .replace(/^\./, "");
  }

  createFilename(filename, format) {
    const fallback = `routelens-export.${format}`;

    if (
      typeof filename !== "string" ||
      !filename.trim()
    ) {
      return fallback;
    }

    const sanitized = filename
      .trim()
      .replace(/[\\/:*?"<>|]/g, "-")
      .replace(/\.[^.]+$/, "");

    if (!sanitized.trim()) {
      return fallback;
    }

    return `${sanitized}.${format}`;
  }

  getMimeType(format) {
    const mimeTypes = {
      markdown: "text/markdown",
      md: "text/markdown",
      json: "application/json"
    };

    return mimeTypes[ format ] || "text/plain";
  }

  getSupportedFormats() {
    this.ensureActive();

    return [
      ...new Set(this.exporters.keys())
    ];
  }

  ensureActive() {
    if (this.destroyed) {
      throw new Error(
        "ExportManager has been destroyed."
      );
    }
  }

  destroy() {
    if (this.destroyed) {
      return;
    }

    this.destroyed = true;

    for (const exporter of this.ownedExporters) {
      if (
        exporter &&
        typeof exporter.destroy === "function"
      ) {
        try {
          const result = exporter.destroy();

          if (
            result &&
            typeof result.then === "function"
          ) {
            result.catch(error => {
              console.error(
                "[RouteLens] Exporter cleanup failed:",
                error
              );
            });
          }
        } catch (error) {
          console.error(
            "[RouteLens] Exporter cleanup failed:",
            error
          );
        }
      }
    }

    this.exporters.clear();
    this.ownedExporters.clear();
    this.callerOwnedExporters.clear();
  }
}
