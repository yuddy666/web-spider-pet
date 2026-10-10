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
  let scrollFrame = 0;
  let previousScrollTime = 0;
  let lastScrollScan = 0;
  let scrollRemainder = 0;
  let blockedScrollTime = 0;
  let previousTime = 0;
  const scrollSpeed = 90;
  const sessionLimit = 50;

  function draw() { overlay.draw(position, state, target); }

  function transition(next: SpiderState, reason: string) {
    state = next;
    note = reason;
    console.info(`[Web Spider Pet] ${next}`, { reason, visibleLinks: targets.length, target: target?.label ?? null, continuous, arrivedLinks });
    draw();
  }

  function scan(report = true) {
    const resumeState = state;
    const resumeNote = note;
    if (report) transition('SCANNING', '正在测量当前可见链接');
    targets = scanLinks();
    overlay.setLinks(targets);
    if (report) { state = resumeState; note = resumeNote; }
    draw();
  }

  function stop(reason: string) {
    cancelAnimationFrame(movementFrame);
    cancelAnimationFrame(nextTargetFrame);
    cancelAnimationFrame(scrollFrame);
    movementFrame = 0;
    nextTargetFrame = 0;
    scrollFrame = 0;
    continuous = false;
    motion.freeze();
    target = null;
    transition('IDLE', reason);
  }

  function remainingPage() {
    const root = document.scrollingElement;
    return root ? Math.max(0, root.scrollHeight - root.clientHeight - root.scrollTop) : 0;
  }

  function beginScroll() {
    motion.freeze();
    target = null;
    previousScrollTime = performance.now();
    lastScrollScan = previousScrollTime;
    scrollRemainder = 0;
    blockedScrollTime = 0;
    transition('SCROLLING', '当前区域已探索，正在缓慢向下寻找新链接');
    scrollFrame = requestAnimationFrame(scrollDown);
  }

  function scrollDown(time: number) {
    scrollFrame = 0;
    if (!continuous || state !== 'SCROLLING') return;
    const dt = Math.min((time - previousScrollTime) / 1000, 0.04);
    previousScrollTime = time;
    // Re-scan while the document moves, including pages with no links at all.
    if (time - lastScrollScan >= 80 || remainingPage() <= 1) {
      scan(false);
      lastScrollScan = time;
      if (targets.some(item => !visited.has(item.element))) { chooseTarget(true); return; }
      if (remainingPage() <= 1) { stop(`已到达页面底部，共到达 ${arrivedLinks} 个链接`); return; }
    }
    const budget = scrollSpeed * dt + scrollRemainder;
    const pixels = Math.floor(budget);
    scrollRemainder = budget - pixels;
    const before = window.scrollY;
    if (pixels > 0) {
      // Explicit instant behavior avoids a site's CSS smooth-scroll queue.
      // Each frame moves only a few pixels; rAF supplies the smooth motion.
      window.scrollBy({ left: 0, top: Math.min(pixels, remainingPage()), behavior: 'instant' });
    }
    blockedScrollTime = window.scrollY > before ? 0 : blockedScrollTime + dt;
    if (blockedScrollTime >= 0.75) { stop('页面阻止了向下滚动，探索已停止'); return; }
    scrollFrame = requestAnimationFrame(scrollDown);
  }

  function chooseTarget(measured = false) {
    // Layout changes can arrive between ARRIVED and the next target's rAF.
    // Retargeting must replace both pending callbacks, never create two loops.
    cancelAnimationFrame(movementFrame);
    cancelAnimationFrame(nextTargetFrame);
    movementFrame = 0;
    nextTargetFrame = 0;
    cancelAnimationFrame(scrollFrame);
    scrollFrame = 0;
    target = null;
    if (!measured) scan();
    const unvisited = targets.filter((item) => !visited.has(item.element));
    const candidates = continuous ? unvisited : (unvisited.length ? unvisited : targets);
    target = candidates.reduce<LinkTarget | null>((closest, item) => {
      const distance = (link: LinkTarget) => Math.hypot(link.point.x - position.x, link.point.y - position.y);
      return !closest || distance(item) < distance(closest) ? item : closest;
    }, null);
    if (!target) {
      if (continuous && remainingPage() > 1) { beginScroll(); return; }
      if (continuous) { stop(`已到达页面底部，共到达 ${arrivedLinks} 个链接`); return; }
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
    if (!updated) {
      motion.freeze();
      if (continuous) chooseTarget();
      else stop('目标已移除、被遮挡或离开视口，探索已停止');
      return;
    }
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
      // The scrolling loop owns its 80 ms scans; avoid scanning all anchors
      // separately for every scroll event. The spider's viewport pose is fixed.
      if (state !== 'SCROLLING') scan(false);
      if (target) {
        const updated = measureLink(target.element);
        if (!updated) {
          if (continuous) {
            cancelAnimationFrame(movementFrame);
            motion.freeze();
            chooseTarget();
          } else stop('目标已离开可见区域，探索已停止');
        }
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
