import type { Layer } from "@/components/layers";
import { isImageIcon } from "@/utils/fileUtils";
import { escapeHtml } from "@/utils/stringUtils";

export function drawLakes(layer: Layer): void {
  const groups = Array.from(layer.getEl().children);
  const groupIds = new Set(groups.map(group => group.id));
  const uses: Record<string, string[]> = {};

  for (const feature of pack.features) {
    if (feature?.type !== "lake") continue;
    const group = groupIds.has(feature.group) ? feature.group : "freshwater"; // the group may have been removed

    if (!uses[group]) uses[group] = [];
    uses[group].push(`<use href="#feature_${feature.i}" data-f="${feature.i}"></use>`);
  }

  for (const group of groups) group.innerHTML = uses[group.id]?.join("") || "";
  drawLakeContours();
}

// Sub-grid water contours share lake visibility while retaining editable marker data.
export function drawLakeContours(): void {
  const lakes = document.getElementById("lakes");
  if (!lakes) return;
  const freshwater = lakes.querySelector<SVGGElement>("#freshwater");
  if (!freshwater) return;
  let contours = lakes.querySelector<SVGGElement>("#lakeContours");
  const waters = (pack.markers ?? []).filter(
    marker => marker.renderLayer === "lakes" && marker.mapScale && !marker.hidden && isImageIcon(marker.icon)
  );
  if (!waters.length) {
    contours?.remove();
    document.getElementById("lakeContourMask")?.remove();
    return;
  }
  if (!contours) {
    contours = document.createElementNS("http://www.w3.org/2000/svg", "g");
    contours.id = "lakeContours";
    contours.setAttribute("pointer-events", "none");
    freshwater.append(contours);
  }
  contours.innerHTML = waters
    .map(marker => {
      const size = marker.size ?? 30;
      return `<image data-marker="${marker.i}" x="${marker.x - size / 2}" y="${marker.y - size}" width="${size}" height="${size}" href="${escapeHtml(marker.icon)}" />`;
    })
    .join("");
  const waterMask = document.getElementById("water");
  if (!waterMask) return;
  let mask = waterMask.querySelector<SVGGElement>("#lakeContourMask");
  if (!mask) {
    mask = document.createElementNS("http://www.w3.org/2000/svg", "g");
    mask.id = "lakeContourMask";
    waterMask.append(mask);
  }
  mask.innerHTML = `<filter id="lakeContourWhite" color-interpolation-filters="sRGB"><feColorMatrix type="matrix" values="0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 0 0 0 1 0"/></filter><g filter="url(#lakeContourWhite)">${contours.innerHTML}</g>`;
}
