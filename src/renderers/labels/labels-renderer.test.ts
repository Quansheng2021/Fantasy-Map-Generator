// @vitest-environment jsdom
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { setViewportSize, setViewportTransform } from "@/components/viewport";
import type { LabelData } from "@/renderers/labels/labels";
import { ViewportLayers } from "@/renderers/viewport/viewport-renderer";

vi.mock("@/components/layers", () => ({ Layers: { isOn: () => true } }));
vi.mock("./label-data", () => ({ getLabelsData: vi.fn() }));

import "@/generators/styles";
import { getLabelsData } from "./label-data";
import { drawLabels } from "./labels-renderer";

beforeEach(() => {
  vi.stubGlobal("CSS", { escape: (value: string) => value });
  document.body.innerHTML = '<svg id="map"><defs id="textPaths"></defs><g id="labels"></g></svg>';
  options.app.labels.showAll = false;
  options.map.labels.groups = [{ name: "customNames", type: "added", zoom: { min: null, max: null } }];
  setViewportSize(200, 200);
  setViewportTransform(1, 0, 0);
  const labels: LabelData[] = [
    { id: "addedLabel1", entityId: 1, type: "added", text: "Ruins", group: "customNames", anchor: [50, 50] },
    { id: "stateLabel2", entityId: 2, type: "state", text: "Kingdom", group: "customNames", anchor: [50, 50] }
  ];
  vi.mocked(getLabelsData).mockReturnValue(labels);
  vi.spyOn(SVGElement.prototype, "getBoundingClientRect").mockReturnValue(new DOMRect(10, 10, 30, 10));
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function enableDecluttering(): void {
  document.getElementById("labels")!.dataset.declutter = "priority";
  drawLabels();
  // jsdom does not resolve SVG presentation attributes into computed opacity.
  document.getElementById("labels-customNames")!.style.opacity = "1";
  ViewportLayers.renderNow();
}

test("prioritizes entity types even when labels share a custom group", () => {
  enableDecluttering();
  expect(document.getElementById("stateLabel2")!.style.display).toBe("");
  expect(document.getElementById("addedLabel1")!.style.display).toBe("none");
});

test("restores overlapping labels when show-all is enabled or decluttering is disabled", () => {
  enableDecluttering();
  options.app.labels.showAll = true;
  ViewportLayers.renderNow();
  expect(document.getElementById("addedLabel1")!.style.display).toBe("");
  options.app.labels.showAll = false;
  ViewportLayers.renderNow();
  expect(document.getElementById("addedLabel1")!.style.display).toBe("none");
  delete document.getElementById("labels")!.dataset.declutter;
  ViewportLayers.renderNow();
  expect(document.getElementById("addedLabel1")!.style.display).toBe("");
});

test("retains labels that do not overlap", () => {
  enableDecluttering();
  vi.mocked(SVGElement.prototype.getBoundingClientRect).mockImplementation(function (this: SVGElement) {
    return new DOMRect(this.id === "addedLabel1" ? 100 : 10, 10, 30, 10);
  });
  ViewportLayers.renderNow();
  expect(document.getElementById("addedLabel1")!.style.display).toBe("");
});

test("full-map rendering clears viewport decluttering without changing the live view", () => {
  enableDecluttering();
  const clone = document.getElementById("map")!.cloneNode(true) as SVGSVGElement;
  ViewportLayers.renderTo(clone);
  expect(clone.querySelector<SVGTextElement>("#addedLabel1")!.style.display).toBe("");
  expect(document.getElementById("addedLabel1")!.style.display).toBe("none");
});
