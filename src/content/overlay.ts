import { measureLink, type LinkTarget, type Point } from './links';
import type { SpiderState } from '../shared';
import { createLocomotion } from './locomotion';

const SVG_NS = 'http://www.w3.org/2000/svg';

function svgElement<K extends keyof SVGElementTagNameMap>(tag: K, attributes: Record<string, string>) {
  const element = document.createElementNS(SVG_NS, tag);
  for (const [key, value] of Object.entries(attributes)) element.setAttribute(key, value);
  return element;
}

export function createOverlay(motion: ReturnType<typeof createLocomotion>) {
  const host = document.createElement('web-spider-pet-overlay');
  host.setAttribute('aria-hidden', 'true');
  host.style.cssText = 'all:initial!important;position:fixed!important;inset:0!important;width:100%!important;height:100%!important;z-index:2147483647!important;pointer-events:none!important;display:block!important;';
  const shadow = host.attachShadow({ mode: 'closed' });
  shadow.innerHTML = `<style>
    :host, * { pointer-events: none !important; }
    svg { position: absolute; inset: 0; width: 100%; height: 100%; overflow: hidden; }
    .badge { position: absolute; top: 0; left: 0; color: #92e9ff; background: #0b1423de; border: 1px solid #58ccee55; border-radius: 4px; padding: 2px 6px; font: 10px/1.4 monospace; white-space: nowrap; }
  </style><svg xmlns="${SVG_NS}"><g id="links"></g><g id="pet"></g></svg><span class="badge">IDLE</span>`;
  document.documentElement.append(host);
  const pet = shadow.querySelector<SVGGElement>('#pet')!;
  const linkLayer = shadow.querySelector<SVGGElement>('#links')!;
  const badge = shadow.querySelector<HTMLSpanElement>('.badge')!;
  const connector = svgElement('path', { fill: 'none', stroke: '#62dbff', 'stroke-width': '1', 'stroke-dasharray': '3 5', opacity: '0.5' });
  linkLayer.append(connector);
  const boxes = Array.from({ length: 8 }, () => {
    const rectangle = svgElement('rect', { fill: 'none', stroke: '#8c88ff', 'stroke-width': '1', rx: '2', opacity: '0.45' });
    linkLayer.append(rectangle);
    return rectangle;
  });
  const targetBox = svgElement('rect', { fill: '#58dfff14', stroke: '#63dfff', 'stroke-width': '1.5', rx: '2' });
  linkLayer.append(targetBox);

  const legs = [-1, 1].flatMap((side) => Array.from({ length: 4 }, (_, pair) => {
    const path = svgElement('path', { fill: 'none', stroke: side === -1 ? '#75d9ff' : '#a19aff', 'stroke-width': '1.5', 'stroke-linejoin': 'round', 'stroke-linecap': 'round' });
    const kneeDot = svgElement('circle', { r: '2', fill: '#84dfff' });
    const footDot = svgElement('circle', { r: '2.3', fill: '#ff95ba' });
    pet.append(path, kneeDot, footDot);
    return { side, pair, path, kneeDot, footDot };
  }));
  const body = svgElement('g', {});
  body.innerHTML = `<path d="M0 -19 8 -9 6 3 11 15 0 24 -11 15 -6 3 -8 -9Z" fill="#0b1525b8" stroke="#86ddff" stroke-width="1.5"/>
    <path d="M0 -19V24M-8 -9 6 3M8 -9 -6 3M-11 15 6 3M11 15 -6 3" fill="none" stroke="#9b9cff" stroke-width="1"/>
    <circle cx="0" cy="-11" r="3" fill="#ffc880"/><circle cx="0" cy="4" r="2" fill="#78e5ff"/>`;
  pet.append(body);
  let hints: LinkTarget[] = [];

  function rectangle(element: SVGRectElement, link: LinkTarget | null) {
    element.style.display = link ? '' : 'none';
    if (!link) return;
    for (const [key, value] of Object.entries(link.bounds)) element.setAttribute(key, String(value));
  }

  return {
    setLinks(links: LinkTarget[]) { hints = links; },
    draw(position: Point, state: SpiderState, target: LinkTarget | null) {
      for (let index = 0; index < legs.length; index++) {
        const drawing = legs[index];
        const { hip, knee, foot, progress } = motion.legs[index];
        drawing.path.setAttribute('d', `M${hip.x},${hip.y} L${knee.x},${knee.y} L${foot.x},${foot.y}`);
        drawing.kneeDot.setAttribute('cx', String(knee.x));
        drawing.kneeDot.setAttribute('cy', String(knee.y));
        drawing.footDot.setAttribute('cx', String(foot.x));
        drawing.footDot.setAttribute('cy', String(foot.y));
        drawing.footDot.setAttribute('r', progress < 1 ? '1.7' : '2.3');
      }
      body.setAttribute('transform', `translate(${motion.center.x} ${motion.center.y}) rotate(${motion.heading * 180 / Math.PI})`);
      const nearby = hints.filter((link) => link.element !== target?.element && Math.hypot(link.point.x - position.x, link.point.y - position.y) < 260)
        .sort((a, b) => Math.hypot(a.point.x - position.x, a.point.y - position.y) - Math.hypot(b.point.x - position.x, b.point.y - position.y))
        .slice(0, boxes.length)
        .map((link) => measureLink(link.element))
        .filter((link): link is LinkTarget => link !== null);
      boxes.forEach((box, index) => rectangle(box, nearby[index] ?? null));
      rectangle(targetBox, target);
      connector.style.display = target ? '' : 'none';
      if (target) connector.setAttribute('d', `M${position.x},${position.y} L${target.bounds.x + target.bounds.width / 2},${target.bounds.y + target.bounds.height / 2}`);
      badge.style.transform = `translate(${position.x + 20}px, ${position.y + 26}px)`;
      badge.textContent = state;
      host.dataset.state = state;
      host.dataset.x = String(position.x);
      host.dataset.y = String(position.y);
    },
  };
}
