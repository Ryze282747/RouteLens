import {
  describe,
  expect,
  it,
  vi
} from "vitest";

import RouteLensPanel from "../../src/ui/RouteLensPanel.js";

function createRoute(overrides = {}) {
  return {
    id: "route-1",
    path: "/users",
    methods: [ "GET" ],
    framework: "express",
    handler: "getUsers",
    ...overrides
  };
}

function initializePanelComponents(panel) {
  panel.routeSearch = {
    getValue: vi.fn(() => "")
  };

  panel.routeFilters = {
    getValue: vi.fn(() => ({}))
  };

  panel.routeList = {
    setRoutes: vi.fn(),
    setSelected: vi.fn()
  };

  panel.routeStatistics = {
    setData: vi.fn()
  };

  panel.routeDetails = {
    setRoute: vi.fn()
  };

  return panel;
}

function createController() {
  const workspace = {
    root: "content://example/old-project",
    name: "old-project",
    source: "file-browser"
  };

  return {
    workspace,

    setWorkspace: vi.fn((selectedWorkspace) => {
      workspace.root = selectedWorkspace.root;
      workspace.name = selectedWorkspace.name;
      workspace.source = selectedWorkspace.source;

      return { ...workspace };
    }),

    getWorkspace: vi.fn(() => ({ ...workspace })),

    scanWorkspace: vi.fn().mockResolvedValue({
      routes: [ createRoute() ]
    })
  };
}

function createSelection(name, url) {
  return {
    type: "folder",
    name,
    url
  };
}

describe("RouteLensPanel folder picker workflow", () => {
  let controller;
  let acode;
  let panel;

  function createPanel() {
    controller = createController();

    acode = {
      fileBrowser: vi.fn()
    };

    panel = new RouteLensPanel({
      controller,
      acode
    });

    initializePanelComponents(panel);

    return panel;
  }

  describe("selectProjectFolder", () => {
    it("opens Acode's folder picker", async () => {
      createPanel();

      acode.fileBrowser.mockResolvedValue(
        createSelection(
          "my-project",
          "content://example/my-project"
        )
      );

      const workspace = await panel.selectProjectFolder();

      expect(acode.fileBrowser).toHaveBeenCalledOnce();

      expect(acode.fileBrowser).toHaveBeenCalledWith(
        "folder",
        "Select your project folder",
        true
      );

      expect(workspace).toEqual({
        root: "content://example/my-project",
        name: "my-project",
        uri: "content://example/my-project",
        source: "file-browser"
      });
    });

    it("returns null when folder selection is cancelled", async () => {
      createPanel();

      acode.fileBrowser.mockResolvedValue(null);

      const workspace = await panel.selectProjectFolder();

      expect(workspace).toBeNull();
    });

    it("supports a string folder selection", async () => {
      createPanel();

      acode.fileBrowser.mockResolvedValue(
        "content://example/my-project"
      );

      const workspace = await panel.selectProjectFolder();

      expect(workspace).toEqual({
        root: "content://example/my-project",
        name: "my-project",
        uri: "content://example/my-project",
        source: "file-browser"
      });
    });

    it("rejects an invalid folder selection", async () => {
      createPanel();

      acode.fileBrowser.mockResolvedValue({
        type: "folder",
        name: "invalid"
      });

      await expect(
        panel.selectProjectFolder()
      ).rejects.toThrow(
        "The selected folder does not contain a valid URL."
      );
    });

    it("reports when Acode's folder picker is unavailable", async () => {
      createPanel();

      panel.acode.fileBrowser = undefined;

      await expect(
        panel.selectProjectFolder()
      ).rejects.toThrow(
        "Acode folder picker is unavailable. Make sure the Acode fileBrowser API is supported."
      );
    });
  });

  describe("scan workflow", () => {
    it("configures the selected workspace before scanning", async () => {
      createPanel();

      acode.fileBrowser.mockResolvedValue(
        createSelection(
          "project-a",
          "content://example/project-a"
        )
      );

      const result = await panel.scan();

      expect(controller.setWorkspace).toHaveBeenCalledOnce();

      expect(controller.setWorkspace).toHaveBeenCalledWith({
        root: "content://example/project-a",
        name: "project-a",
        uri: "content://example/project-a",
        source: "file-browser"
      });

      expect(controller.scanWorkspace).toHaveBeenCalledOnce();

      expect(
        controller.setWorkspace.mock.invocationCallOrder[ 0 ]
      ).toBeLessThan(
        controller.scanWorkspace.mock.invocationCallOrder[ 0 ]
      );

      expect(result.routes).toHaveLength(1);
      expect(panel.routes).toHaveLength(1);
    });

    it("does not scan when folder selection is cancelled", async () => {
      createPanel();

      acode.fileBrowser.mockResolvedValue(null);

      const result = await panel.scan();

      expect(result).toBeNull();
      expect(controller.setWorkspace).not.toHaveBeenCalled();
      expect(controller.scanWorkspace).not.toHaveBeenCalled();
    });

    it("preserves previous routes when folder selection is cancelled", async () => {
      createPanel();

      const previousRoutes = [
        createRoute({
          id: "previous-route",
          path: "/previous"
        })
      ];

      panel.routes = previousRoutes;
      panel.filteredRoutes = previousRoutes;

      acode.fileBrowser.mockResolvedValue(null);

      await panel.scan();

      expect(panel.routes).toBe(previousRoutes);
      expect(panel.filteredRoutes).toBe(previousRoutes);

      expect(controller.scanWorkspace).not.toHaveBeenCalled();
    });

    it("allows selecting a different project on subsequent scans", async () => {
      createPanel();

      acode.fileBrowser
        .mockResolvedValueOnce(
          createSelection(
            "project-a",
            "content://example/project-a"
          )
        )
        .mockResolvedValueOnce(
          createSelection(
            "project-b",
            "content://example/project-b"
          )
        );

      await panel.scan();
      await panel.scan();

      expect(acode.fileBrowser).toHaveBeenCalledTimes(2);

      expect(controller.setWorkspace).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({
          root: "content://example/project-a",
          name: "project-a"
        })
      );

      expect(controller.setWorkspace).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          root: "content://example/project-b",
          name: "project-b"
        })
      );

      expect(controller.scanWorkspace).toHaveBeenCalledTimes(2);

      expect(panel.workspace.root).toBe(
        "content://example/project-b"
      );
    });

    it("does not scan when workspace configuration fails", async () => {
      createPanel();

      acode.fileBrowser.mockResolvedValue(
        createSelection(
          "project-a",
          "content://example/project-a"
        )
      );

      controller.setWorkspace.mockImplementation(() => {
        throw new Error("Workspace configuration failed");
      });

      const result = await panel.scan();

      expect(result).toBeNull();
      expect(controller.scanWorkspace).not.toHaveBeenCalled();
    });

    it("does not replace existing routes when scanning fails", async () => {
      createPanel();

      const previousRoutes = [
        createRoute({
          id: "previous-route",
          path: "/previous"
        })
      ];

      panel.routes = previousRoutes;
      panel.filteredRoutes = previousRoutes;

      acode.fileBrowser.mockResolvedValue(
        createSelection(
          "project-a",
          "content://example/project-a"
        )
      );

      controller.scanWorkspace.mockRejectedValue(
        new Error("Project scan failed")
      );

      const consoleError = vi
        .spyOn(console, "error")
        .mockImplementation(() => { });

      const result = await panel.scan();

      expect(result).toBeNull();
      expect(panel.routes).toBe(previousRoutes);
      expect(panel.filteredRoutes).toBe(previousRoutes);

      consoleError.mockRestore();
    });

    it("does not configure or scan after the panel is destroyed during folder selection", async () => {
      createPanel();

      let resolveSelection;

      acode.fileBrowser.mockReturnValue(
        new Promise((resolve) => {
          resolveSelection = resolve;
        })
      );

      const scanPromise = panel.scan();

      panel.destroy();

      resolveSelection(
        createSelection(
          "project-a",
          "content://example/project-a"
        )
      );

      const result = await scanPromise;

      expect(result).toBeNull();
      expect(controller.setWorkspace).not.toHaveBeenCalled();
      expect(controller.scanWorkspace).not.toHaveBeenCalled();
    });
  });
});
