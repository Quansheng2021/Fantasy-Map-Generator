// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import type { Layer } from "@/components/layers";
import { drawLakes } from "./draw-lakes";

const createLayer = (groups: string[]) => {
  document.body.innerHTML = /* html */ `<svg><defs><mask id="water"><rect fill="white" /></mask></defs><g id="lakes">${groups.map(id => `<g id="${id}"></g>`).join("")}</g></svg>`;
  return { getEl: () => document.getElementById("lakes") } as unknown as Layer;
};

beforeEach(() => {
  globalThis.pack = {
    features: [
      0,
      { i: 1, type: "lake", subtype: "salt", group: "salt" },
      { i: 2, type: "lake", subtype: "salt", group: "my_lakes" },
      { i: 3, type: "lake", subtype: "frozen", group: "removed_group" },
      { i: 5, type: "lake", subtype: "freshwater", group: "freshwater" },
      { i: 4, type: "island", subtype: "continent", group: "sea_island" }
    ]
  } as unknown as typeof globalThis.pack;
});

describe("drawLakes", () => {
  it("keeps sub-grid water visible without the marker layer and removes stale contours", () => {
    const layer = createLayer(["freshwater"]);
    pack.markers = [
      {
        i: 10,
        name: "Shallow lake",
        type: "water",
        cell: 0,
        icon: "data:image/svg+xml;base64,PHN2Zy8+",
        x: 20,
        y: 30,
        size: 8,
        mapScale: true,
        renderLayer: "lakes"
      },
      { i: 11, name: "Farm", type: "farm", cell: 0, icon: "♧", x: 10, y: 10 }
    ];
    drawLakes(layer);
    drawLakes(layer);
    expect(document.querySelectorAll("#lakeContours image")).toHaveLength(1);
    expect(document.querySelectorAll("#water > rect")).toHaveLength(1);
    expect(document.querySelectorAll("#lakeContourMask image")).toHaveLength(1);
    expect(document.querySelector("#lakeContours image")?.getAttribute("x")).toBe("16");
    expect(document.querySelector("#lakeContours image")?.getAttribute("y")).toBe("22");
    pack.markers[0].hidden = true;
    drawLakes(layer);
    expect(document.querySelector("#lakeContours")).toBeNull();
    expect(document.querySelector("#lakeContourMask")).toBeNull();
  });
  it("draws a lake in the group assigned to it, defaulting to freshwater", () => {
    const layer = createLayer(["freshwater", "salt", "frozen", "my_lakes"]);

    drawLakes(layer);

    const groupOf = (i: number) => document.querySelector(`use[data-f="${i}"]`)?.parentElement?.id;
    expect(groupOf(1)).toBe("salt");
    expect(groupOf(2)).toBe("my_lakes");
    expect(groupOf(3)).toBe("freshwater"); // the group is gone, the lake falls back instead of vanishing
    expect(groupOf(5)).toBe("freshwater");
    expect(groupOf(4)).toBeUndefined(); // not a lake
  });
});
