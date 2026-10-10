import { isSpiderCommand, type SpiderStatus, type SpiderState } from '../shared';
import { measureLink, scanLinks, type LinkTarget, type Point } from './links';
import { createOverlay } from './overlay';
import { createLocomotion } from './locomotion';

if (!document.querySelector('web-spider-pet-overlay')) startSpider();

function startSpider() {
  const position: Point = { x: Math.min(100, innerWidth / 2), y: Math.min(120, innerHeight / 2) };
  const motion = createLocomotion(position);
  const overlay = createOverlay(motion);
  let state: SpiderState = 'IDLE';
  let targets: LinkTarget[] = [];
  let target: LinkTarget | null = null;
  let note = '等待探索指令';
  let visited = new WeakSet<HTMLAnchorElement>();
  let continuous = false;
  let arrivedLinks = 0;
  let movementFrame = 0;
  let nextTargetFrame = 0;
  let layoutFrame = 0;
  let previousTime = 0;
  const sessionLimit = 50;

  function draw() { overlay.draw(position, state, target); }

  function transition(next: SpiderState, reason: string) {
    state = next;
    note = reason;
    console.info(`[Web Spider Pet] ${next}`, { reason, visibleLinks: targets.length, target: target?.label ?? null, continuous, arrivedLinks });
    draw();
  }

  function scan() {
    const resumeState = state;
    const resumeNote = note;
    transition('SCANNING', '正在测量当前可见链接');
    targets = scanLinks();
    overlay.setLinks(targets);
    transition(resumeState, resumeNote);
  }

  function stop(reason: string) {
    cancelAnimationFrame(movementFrame);
    cancelAnimationFrame(nextTargetFrame);
    movementFrame = 0;
    nextTargetFrame = 0;
    continuous = false;
    motion.freeze();
    target = null;
    transition('IDLE', reason);
  }

  function chooseTarget() {
    target = null;
    scan();
    const unvisited = targets.filter((item) => !visited.has(item.element));
    const candidates = continuous ? unvisited : (unvisited.length ? unvisited : targets);
    target = candidates.reduce<LinkTarget | null>((closest, item) => {
      const distance = (link: LinkTarget) => Math.hypot(link.point.x - position.x, link.point.y - position.y);
      return !closest || distance(item) < distance(closest) ? item : closest;
    }, null);
    if (!target) {
      const reason = targets.length ? `当前可见链接已探索完，共到达 ${arrivedLinks} 个链接` : '当前视口没有可探索的链接';
      stop(reason);
      return;
    }
    transition('MOVING', continuous ? '连续探索中，正在走向真实链接' : '已选择真实 DOM 链接，正在移动');
    previousTime = performance.now();
    movementFrame = requestAnimationFrame(move);
  }

  function explore(keepExploring: boolean) {
    stop('准备探索');
    continuous = keepExploring;
    arrivedLinks = 0;
    if (continuous) visited = new WeakSet();
    chooseTarget();
  }

  function move(time: number) {
    if (!target) return;
    const updated = measureLink(target.element);
    if (!updated) { stop('目标已移除、被遮挡或离开视口，探索已停止'); return; }
    target = updated;
    const arrived = motion.advance(target.point, Math.min((time - previousTime) / 1000, 0.04));
    previousTime = time;
    if (arrived) {
      motion.freeze();
      visited.add(target.element);
      arrivedLinks += 1;
      movementFrame = 0;
      transition('ARRIVED', '已到达链接附近；没有点击或访问链接');
      if (continuous) {
        if (arrivedLinks >= sessionLimit) stop(`本轮已到达 ${sessionLimit} 个链接，探索结束`);
        else nextTargetFrame = requestAnimationFrame(() => {
          nextTargetFrame = 0;
          if (continuous) chooseTarget();
        });
      }
      return;
    }
    draw();
    movementFrame = requestAnimationFrame(move);
  }

  function onLayoutChange() {
    if (layoutFrame) return;
    layoutFrame = requestAnimationFrame(() => {
      layoutFrame = 0;
      scan();
      if (target) {
        const updated = measureLink(target.element);
        if (!updated) stop('目标已离开可见区域，探索已停止');
        else {
          target = updated;
          if (state === 'ARRIVED' && !continuous && Math.hypot(target.point.x - position.x, target.point.y - position.y) > 1) {
            stop('页面位置变化，等待下一次探索');
          }
        }
      }
      draw();
    });
  }

  function status(): SpiderStatus {
    return { state, visibleLinks: targets.length, target: target?.label ?? null, note, continuous, arrivedLinks };
  }

  chrome.runtime.onMessage.addListener((message: unknown, _sender, sendResponse) => {
    if (!isSpiderCommand(message)) return;
    if (message.type === 'SPIDER_START') explore(true);
    else if (message.type === 'SPIDER_EXPLORE') explore(false);
    else if (message.type === 'SPIDER_STOP') stop('用户停止探索');
    else if (message.type === 'SPIDER_SCAN') scan();
    sendResponse(status());
  });
  document.addEventListener('scroll', onLayoutChange, { passive: true, capture: true });
  window.addEventListener('resize', onLayoutChange, { passive: true });
  scan();
}
