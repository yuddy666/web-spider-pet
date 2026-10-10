export interface Point { x: number; y: number }
export interface LinkTarget {
  element: HTMLAnchorElement;
  point: Point;
  bounds: { x: number; y: number; width: number; height: number };
  label: string;
}

export function measureLink(element: HTMLAnchorElement): LinkTarget | null {
  if (!element.isConnected || !element.getAttribute('href')?.trim()) return null;
  try {
    if (!['http:', 'https:'].includes(new URL(element.href).protocol)) return null;
  } catch { return null; }

  const rect = element.getBoundingClientRect();
  const style = getComputedStyle(element);
  if (rect.width <= 0 || rect.height <= 0 || style.visibility !== 'visible' || style.display === 'none') return null;
  // Ancestor opacity does not inherit; check it explicitly.
  for (let ancestor: Element | null = element; ancestor; ancestor = ancestor.parentElement) {
    if (Number(getComputedStyle(ancestor).opacity) === 0) return null;
  }
  const left = Math.max(0, rect.left);
  const right = Math.min(innerWidth, rect.right);
  const top = Math.max(0, rect.top);
  const bottom = Math.min(innerHeight, rect.bottom);
  if (right <= left || bottom <= top) return null;

  const center = { x: (left + right) / 2, y: (top + bottom) / 2 };
  const hit = document.elementFromPoint(center.x, center.y);
  if (!hit || (hit !== element && !element.contains(hit))) return null;
  return {
    element,
    bounds: { x: left, y: top, width: right - left, height: bottom - top },
    point: {
      x: Math.max(32, Math.min(innerWidth - 32, center.x)),
      y: Math.max(32, Math.min(innerHeight - 32, top - 30)),
    },
    label: element.textContent?.trim().replace(/\s+/g, ' ').slice(0, 80) || element.hostname,
  };
}

export function scanLinks(): LinkTarget[] {
  return Array.from(document.querySelectorAll<HTMLAnchorElement>('a[href]'))
    .map(measureLink)
    .filter((target): target is LinkTarget => target !== null);
}
