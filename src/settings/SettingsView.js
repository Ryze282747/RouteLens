
export default class SettingsView {
  constructor({ settingsManager } = {}) {
    if (!settingsManager) {
      throw new Error(
        "SettingsView requires a SettingsManager."
      );
    }

    this.settingsManager = settingsManager;

    this.element = null;
    this.container = null;

    this.settings = null;
    this.destroyed = false;
    this.saving = false;
  }

  async mount(container) {
    this.ensureActive();

    if (!container || typeof container.appendChild !== "function") {
      throw new TypeError(
        "A valid container element is required."
      );
    }

    this.container = container;
    this.settings = this.settingsManager.getAll();

    this.element = document.createElement("section");
    this.element.className = "routelens-settings";

    this.container.appendChild(this.element);

    this.render();

    return this.element;
  }

  render() {
    this.ensureActive();

    if (!this.element) {
      return;
    }

    this.element.replaceChildren();

    const header = document.createElement("header");
    header.className = "routelens-settings-header";

    const title = document.createElement("h2");
    title.textContent = "RouteLens Settings";

    const description = document.createElement("p");
    description.textContent =
      "Customize route discovery, analysis, appearance, and exports.";

    header.append(title, description);

    this.element.appendChild(header);

    this.renderScanningSettings();
    this.renderAnalysisSettings();
    this.renderInterfaceSettings();
    this.renderExportSettings();
    this.renderActions();
  }

  renderScanningSettings() {
    const section = this.createSection(
      "Scanning",
      "Configure which frameworks and files RouteLens should inspect."
    );

    this.appendFrameworkOptions(section);

    this.appendCheckbox(
      section,
      "scanHiddenFiles",
      "Scan hidden files",
      this.settings.scanning.scanHiddenFiles
    );

    this.appendTextArea(
      section,
      "excludeDirectories",
      "Excluded directories",
      this.settings.scanning.excludeDirectories.join("\n"),
      "Enter one directory name per line."
    );

    this.appendNumberInput(
      section,
      "maxFileSize",
      "Maximum file size (bytes)",
      this.settings.scanning.maxFileSize
    );

    this.element.appendChild(section);
  }

  appendFrameworkOptions(section) {
    const group = document.createElement("div");
    group.className = "routelens-settings-field";

    const label = document.createElement("h4");
    label.textContent = "Enabled frameworks";

    const description = document.createElement("p");
    description.textContent =
      "Select the frameworks RouteLens should scan.";

    const options = document.createElement("div");
    options.className = "routelens-settings-options";

    const frameworks = [
      "flask",
      "express",
      "laravel",
      "fastapi",
      "django",
      "nest"
    ];

    for (const framework of frameworks) {
      const item = document.createElement("label");
      item.className = "routelens-settings-checkbox";

      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.value = framework;
      checkbox.checked =
        this.settings.scanning.enabledFrameworks.includes(
          framework
        );

      checkbox.addEventListener("change", () => {
        const enabled = new Set(
          this.settings.scanning.enabledFrameworks
        );

        if (checkbox.checked) {
          enabled.add(framework);
        } else {
          enabled.delete(framework);
        }

        this.settings.scanning.enabledFrameworks = [
          ...enabled
        ];

        this.saveSetting(
          "scanning.enabledFrameworks",
          this.settings.scanning.enabledFrameworks
        );
      });

      const text = document.createElement("span");
      text.textContent = framework.toUpperCase();

      item.append(checkbox, text);
      options.appendChild(item);
    }

    group.append(label, description, options);
    section.appendChild(group);
  }

  renderAnalysisSettings() {
    const section = this.createSection(
      "Analysis",
      "Choose which route analysis checks should run."
    );

    this.appendCheckbox(
      section,
      "detectDuplicates",
      "Detect duplicate routes",
      this.settings.analysis.detectDuplicates,
      "analysis"
    );

    this.appendCheckbox(
      section,
      "detectConflicts",
      "Detect potentially conflicting routes",
      this.settings.analysis.detectConflicts,
      "analysis"
    );

    this.appendCheckbox(
      section,
      "matchFrontendCalls",
      "Enable frontend API matching",
      this.settings.analysis.matchFrontendCalls,
      "analysis"
    );

    this.element.appendChild(section);
  }

  renderInterfaceSettings() {
    const section = this.createSection(
      "Appearance",
      "Customize how the RouteLens interface is displayed."
    );

    this.appendSelect(
      section,
      "theme",
      "Theme",
      [
        { value: "dark", label: "Dark" },
        { value: "light", label: "Light" },
        { value: "system", label: "System" }
      ],
      this.settings.interface.theme,
      "interface"
    );

    this.appendCheckbox(
      section,
      "showStatistics",
      "Show route statistics",
      this.settings.interface.showStatistics,
      "interface"
    );

    this.appendCheckbox(
      section,
      "showSourceLocations",
      "Show source locations",
      this.settings.interface.showSourceLocations,
      "interface"
    );

    this.appendCheckbox(
      section,
      "compactMode",
      "Use compact layout",
      this.settings.interface.compactMode,
      "interface"
    );

    this.element.appendChild(section);
  }

  renderExportSettings() {
    const section = this.createSection(
      "Export",
      "Configure the default API documentation export format."
    );

    this.appendSelect(
      section,
      "defaultFormat",
      "Default export format",
      [
        { value: "markdown", label: "Markdown" },
        { value: "json", label: "JSON" }
      ],
      this.settings.export.defaultFormat,
      "export"
    );

    this.appendCheckbox(
      section,
      "includeAnalysis",
      "Include route analysis in exports",
      this.settings.export.includeAnalysis,
      "export"
    );

    this.appendCheckbox(
      section,
      "prettyJson",
      "Format JSON with indentation",
      this.settings.export.prettyJson,
      "export"
    );

    this.element.appendChild(section);
  }

  appendCheckbox(
    section,
    key,
    labelText,
    checked,
    group = "scanning"
  ) {
    const label = document.createElement("label");
    label.className = "routelens-settings-checkbox";

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = Boolean(checked);

    checkbox.addEventListener("change", () => {
      this.settings[ group ][ key ] = checkbox.checked;

      this.saveSetting(
        `${group}.${key}`,
        checkbox.checked
      );
    });

    const text = document.createElement("span");
    text.textContent = labelText;

    label.append(checkbox, text);
    section.appendChild(label);
  }

  appendSelect(
    section,
    key,
    labelText,
    options,
    selectedValue,
    group
  ) {
    const field = document.createElement("div");
    field.className = "routelens-settings-field";

    const label = document.createElement("label");
    label.textContent = labelText;

    const select = document.createElement("select");
    select.className = "routelens-settings-input";

    for (const optionData of options) {
      const option = document.createElement("option");

      option.value = optionData.value;
      option.textContent = optionData.label;

      select.appendChild(option);
    }

    select.value = selectedValue;

    select.addEventListener("change", () => {
      this.settings[ group ][ key ] = select.value;

      this.saveSetting(
        `${group}.${key}`,
        select.value
      );
    });

    field.append(label, select);
    section.appendChild(field);
  }

  appendTextArea(
    section,
    key,
    labelText,
    value,
    description
  ) {
    const field = document.createElement("div");
    field.className = "routelens-settings-field";

    const label = document.createElement("label");
    label.textContent = labelText;

    const textarea = document.createElement("textarea");
    textarea.className = "routelens-settings-textarea";
    textarea.value = value;

    textarea.addEventListener("change", () => {
      const directories = textarea.value
        .split("\n")
        .map((directory) => directory.trim())
        .filter(Boolean);

      this.settings.scanning[ key ] = directories;

      this.saveSetting(
        `scanning.${key}`,
        directories
      );
    });

    const hint = document.createElement("small");
    hint.textContent = description;

    field.append(label, textarea, hint);
    section.appendChild(field);
  }

  appendNumberInput(
    section,
    key,
    labelText,
    value
  ) {
    const field = document.createElement("div");
    field.className = "routelens-settings-field";

    const label = document.createElement("label");
    label.textContent = labelText;

    const input = document.createElement("input");
    input.type = "number";
    input.min = "1";
    input.step = "1";
    input.className = "routelens-settings-input";
    input.value = String(value);

    input.addEventListener("change", () => {
      const number = Number(input.value);

      if (!Number.isFinite(number) || number <= 0) {
        input.value = String(
          this.settings.scanning[ key ]
        );
        return;
      }

      this.settings.scanning[ key ] = Math.floor(number);

      this.saveSetting(
        `scanning.${key}`,
        Math.floor(number)
      );
    });

    field.append(label, input);
    section.appendChild(field);
  }

  createSection(titleText, descriptionText) {
    const section = document.createElement("section");
    section.className = "routelens-settings-section";

    const heading = document.createElement("h3");
    heading.textContent = titleText;

    const description = document.createElement("p");
    description.textContent = descriptionText;

    section.append(heading, description);

    return section;
  }

  renderActions() {
    const actions = document.createElement("div");
    actions.className = "routelens-settings-actions";

    const resetButton = document.createElement("button");
    resetButton.type = "button";
    resetButton.className = "routelens-settings-reset";
    resetButton.textContent = "Reset to Defaults";

    resetButton.addEventListener("click", () => {
      this.reset();
    });

    const status = document.createElement("span");
    status.className = "routelens-settings-status";
    status.setAttribute("role", "status");
    status.setAttribute("aria-live", "polite");

    this.statusElement = status;

    actions.append(resetButton, status);
    this.element.appendChild(actions);
  }

  async saveSetting(key, value) {
    if (this.saving || this.destroyed) {
      return false;
    }

    this.saving = true;
    this.setStatus("Saving settings...");

    try {
      await this.settingsManager.set(key, value);

      this.setStatus("Settings saved.");
      return true;
    } catch (error) {
      console.error(
        "[RouteLens] Failed to save setting:",
        error
      );

      this.setStatus(
        error.message || "Unable to save settings."
      );

      return false;
    } finally {
      this.saving = false;
    }
  }

  async reset() {
    this.ensureActive();

    this.setStatus("Restoring defaults...");

    try {
      this.settings = await this.settingsManager.reset();

      this.render();
      this.setStatus("Settings restored to defaults.");

      return true;
    } catch (error) {
      console.error(
        "[RouteLens] Failed to reset settings:",
        error
      );

      this.setStatus(
        error.message || "Unable to reset settings."
      );

      return false;
    }
  }

  setStatus(message) {
    if (this.statusElement) {
      this.statusElement.textContent = String(message);
    }
  }

  ensureActive() {
    if (this.destroyed) {
      throw new Error("SettingsView has been destroyed.");
    }
  }

  destroy() {
    if (this.destroyed) {
      return;
    }

    this.element?.remove();

    this.element = null;
    this.container = null;
    this.settings = null;
    this.statusElement = null;

    this.settingsManager = null;
    this.destroyed = true;
  }
}
