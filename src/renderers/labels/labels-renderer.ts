import { Layers } from "@/components/layers";
import type { LabelGroup, LabelType } from "@/generators/labels-generator";
import type { LabelData } from "@/renderers/labels/labels";
import { Scene, ViewportLayers, type ViewportRenderContext } from "@/renderers/viewport/viewport-renderer";
import { getLabelsData } from "./label-data";
import { renderLabelGroups } from "./label-groups";
import { createLabelElements } from "./label-markup";

const scene = new Scene<LabelData>();
const layer = ViewportLayers.register({ id: "labels", render: reconcileLabels });
const labelsByGroup = new Map<string, LabelData[]>();

export function drawLabels(): void {
  if (!Layers.isOn("labels")) return void removeLabels();

  TIME && console.time("drawLabels");
  renderLabelGroups();
  document.getElementById("textPaths")?.replaceChildren();
  scene.replace(getLabelsData());
  indexLabelsByGroup();
  layer.render();
  TIME && console.timeEnd("drawLabels");
}

export function removeLabels(): void {
  scene.invalidate();
  labelsByGroup.clear();
  const labels = findElement(document, "labels");
  if (labels) labels.replaceChildren();
  const textPaths = findElement(document, "textPaths");
  if (textPaths) textPaths.replaceChildren();
}

// Re-materialize a single edited label, leaving the rest of the layer untouched
export function redrawLabel(label: LabelData): void {
  if (!scene.valid || !Layers.isOn("labels")) return;

  const previous = scene.get(label.id);
  if (previous) unindexLabel(previous);
  removeMaterialized(label.id, document);

  const stored = { ...label };
  scene.set(stored);
  indexLabel(stored);
  materializeLabel(stored, ViewportLayers.getContext());
  declutterLabels(document);
}

export function getSceneLabel(type: LabelType, id: number): LabelData | undefined {
  return scene.get(`${type}Label${id}`);
}

export function getVisibleLabels(): LabelData[] {
  if (!scene.valid || !Layers.isOn("labels")) return [];
  const bounds = ViewportLayers.getVisibleBounds();
  const visibleGroups = new Set(
    options.map.labels.groups.filter(group => isGroupVisible({ group, bounds })).map(({ name }) => name)
  );
  return [...scene.values()].filter(label => visibleGroups.has(label.group) && isLabelVisible(bounds, label));
}

function materializeLabel(label: LabelData, context: ViewportRenderContext): void {
  const groupOptions = options.map.labels.groups.find(({ name }) => name === label.group);
  if (!groupOptions || !isGroupVisible({ group: groupOptions, bounds: context.bounds })) return;
  if (!isLabelVisible(context.bounds, label)) return;

  const group = findElement(context.root, `labels-${label.group}`);
  const textPaths = findElement(context.root, "textPaths");
  if (!group || !textPaths) return;

  materialize(label, group, textPaths);
}

function materialize(label: LabelData, group: Element, textPaths: Element): void {
  const { text, path } = createLabelElements(label, group.ownerDocument);
  if (path) textPaths.appendChild(path);
  group.appendChild(text);
}

function reconcileLabels(context: ViewportRenderContext): void {
  if (!scene.valid || !Layers.isOn("labels")) return;
  const labels = findElement(context.root, "labels");
  const textPaths = findElement(context.root, "textPaths");
  if (!labels || !textPaths) return;

  for (const group of options.map.labels.groups) reconcileGroup(labels, textPaths, group.name, context);
  declutterLabels(context.root);
}

type ScreenBox = Pick<DOMRect, "left" | "top" | "right" | "bottom">;
/** Hide overlapping labels without removing their map data. */
function declutterLabels(root: ParentNode): void {
  const layer = findElement(root, "labels");
  if (!(layer instanceof SVGGElement)) return;
  const texts = [...layer.querySelectorAll<SVGTextElement>("text[data-label-shape]")];
  for (const text of texts) text.style.display = "";
  if (root !== document || layer.dataset.declutter !== "priority" || options.app.labels.showAll) return;

  const ranked = texts
    .map(text => ({ text, boxes: getLabelScreenBoxes(text), priority: labelPriority(text.dataset.labelType) }))
    .filter(({ text, boxes }) => {
      const group = text.parentElement;
      return boxes.length && group && Number(getComputedStyle(group).opacity) > 0;
    })
    .sort((a, b) => b.priority - a.priority || a.text.id.localeCompare(b.text.id));
  // A screen-space grid keeps pan and zoom responsive when a region has many labels.
  // Each glyph of a curved name occupies only the cells it actually touches.
  const occupied = new Map<string, ScreenBox[]>();
  const cellSize = 48;
  const gap = 5;
  for (const { text, boxes } of ranked) {
    if (boxes.some(box => hasOccupiedNeighbor(box, occupied, cellSize, gap))) {
      text.style.display = "none";
    } else for (const box of boxes) occupyCells(box, occupied, cellSize, gap);
  }
}

function cellRange(box: ScreenBox, cellSize: number, gap: number): [number, number, number, number] {
  return [
    Math.floor((box.left - gap) / cellSize),
    Math.floor((box.top - gap) / cellSize),
    Math.floor((box.right + gap) / cellSize),
    Math.floor((box.bottom + gap) / cellSize)
  ];
}

function hasOccupiedNeighbor(box: ScreenBox, cells: Map<string, ScreenBox[]>, cellSize: number, gap: number): boolean {
  const [x0, y0, x1, y1] = cellRange(box, cellSize, gap);
  const checked = new Set<ScreenBox>();
  for (let x = x0; x <= x1; x++) {
    for (let y = y0; y <= y1; y++) {
      for (const other of cells.get(`${x},${y}`) || []) {
        if (checked.has(other)) continue;
        checked.add(other);
        if (boxesOverlap(box, other, gap)) return true;
      }
    }
  }
  return false;
}

function occupyCells(box: ScreenBox, cells: Map<string, ScreenBox[]>, cellSize: number, gap: number): void {
  const [x0, y0, x1, y1] = cellRange(box, cellSize, gap);
  for (let x = x0; x <= x1; x++) {
    for (let y = y0; y <= y1; y++) {
      const key = `${x},${y}`;
      const occupied = cells.get(key) || [];
      occupied.push(box);
      cells.set(key, occupied);
    }
  }
}

function boxesOverlap(a: ScreenBox, b: ScreenBox, gap: number): boolean {
  return a.left < b.right + gap && a.right > b.left - gap && a.top < b.bottom + gap && a.bottom > b.top - gap;
}

function getLabelScreenBoxes(text: SVGTextElement): ScreenBox[] {
  if (text.dataset.labelShape !== "path") {
    const box = text.getBoundingClientRect();
    return box.width > 0 && box.height > 0 ? [box] : [];
  }
  const matrix = text.getScreenCTM();
  if (!matrix) return [];
  const boxes: ScreenBox[] = [];
  for (let index = 0; index < text.getNumberOfChars(); index++) {
    try {
      const glyph = text.getExtentOfChar(index);
      const corners = [
        new DOMPoint(glyph.x, glyph.y),
        new DOMPoint(glyph.x + glyph.width, glyph.y),
        new DOMPoint(glyph.x, glyph.y + glyph.height),
        new DOMPoint(glyph.x + glyph.width, glyph.y + glyph.height)
      ].map(point => point.matrixTransform(matrix));
      boxes.push({
        left: Math.min(...corners.map(point => point.x)),
        top: Math.min(...corners.map(point => point.y)),
        right: Math.max(...corners.map(point => point.x)),
        bottom: Math.max(...corners.map(point => point.y))
      });
    } catch {
      return [];
    }
  }
  return boxes;
}

function labelPriority(type: string | undefined): number {
  if (type === "state") return 100;
  if (type === "province") return 90;
  if (type === "burg") return 80;
  if (type === "added") return 50;
  if (type === "river") return 25;
  if (type === "route") return 15;
  return 20;
}

function reconcileGroup(labels: Element, textPaths: Element, groupName: string, context: ViewportRenderContext): void {
  const group = labels.querySelector<SVGGElement>(`#${CSS.escape(`labels-${groupName}`)}`);
  const groupOptions = options.map.labels.groups.find(group => group.name === groupName);
  if (!group || !groupOptions) return;

  const isVisible = isGroupVisible({ group: groupOptions, bounds: context.bounds });
  const visibleLabels = isVisible
    ? (labelsByGroup.get(groupName) || []).filter(label => isLabelVisible(context.bounds, label))
    : [];
  const visibleIds = new Set(visibleLabels.map(label => label.id));

  for (const child of Array.from(group.children)) {
    if (visibleIds.has(child.id)) continue;
    removeMaterialized(child.id, context.root);
  }

  for (const label of visibleLabels) {
    const isMaterialized = group.querySelector<SVGTextElement>(`#${label.id}`);
    if (!isMaterialized) materialize(label, group, textPaths);
  }
}

function isGroupVisible({ group, bounds }: { group: LabelGroup; bounds: ViewportRenderContext["bounds"] }): boolean {
  if (group.active === false) return false;
  if (!options.app.labels.showAll) {
    if (group.zoom.min !== null && bounds.scale < group.zoom.min) return false;
    if (group.zoom.max !== null && bounds.scale > group.zoom.max) return false;
  }
  const dependency = group.layerDependency;
  return !dependency || !Layers.has(dependency) || Layers.isOn(dependency);
}

function isLabelVisible(bounds: ViewportRenderContext["bounds"], label: LabelData): boolean {
  if (label.hidden) return false;
  const x = label.anchor[0] + (label.dx || 0);
  const y = label.anchor[1] + (label.dy || 0);
  return x >= bounds.x0 && x <= bounds.x1 && y >= bounds.y0 && y <= bounds.y1;
}

function removeMaterialized(id: string, root: ParentNode): void {
  findElement(root, id)?.remove();
  findElement(root, `textPath_${id}`)?.remove();
}

function findElement(root: ParentNode, id: string): Element | null {
  if (root instanceof Element && root.id === id) return root;
  return root.querySelector(`#${CSS.escape(id)}`);
}

function indexLabelsByGroup(): void {
  labelsByGroup.clear();
  for (const label of scene.values()) indexLabel(label);
}

function indexLabel(label: LabelData): void {
  const groupLabels = labelsByGroup.get(label.group) || [];
  groupLabels.push(label);
  labelsByGroup.set(label.group, groupLabels);
}

function unindexLabel(label: LabelData): void {
  const groupLabels = labelsByGroup.get(label.group);
  if (!groupLabels) return;
  const index = groupLabels.findIndex(({ id }) => id === label.id);
  if (index !== -1) groupLabels.splice(index, 1);
}
