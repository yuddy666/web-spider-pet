import './style.css';
import type { SpiderCommand, SpiderStatus } from '../shared';

const state = document.querySelector<HTMLElement>('#state')!;
const count = document.querySelector<HTMLElement>('#count')!;
const note = document.querySelector<HTMLElement>('#note')!;
const target = document.querySelector<HTMLElement>('#target')!;
const explore = document.querySelector<HTMLButtonElement>('#explore')!;
const start = document.querySelector<HTMLButtonElement>('#start')!;
const stop = document.querySelector<HTMLButtonElement>('#stop')!;
let tabId: number | undefined;
let busy = false;

async function send(type: SpiderCommand['type']) {
  if (tabId === undefined || busy) return;
  busy = true;
  try {
    const result: SpiderStatus = await chrome.tabs.sendMessage(tabId, { type } satisfies SpiderCommand, { frameId: 0 });
    state.textContent = result.state;
    count.textContent = `${result.visibleLinks} 个可见链接`;
    note.textContent = result.note;
    target.textContent = `已到达 ${result.arrivedLinks} 个链接${result.target ? ` · 目标：${result.target}` : ''}`;
    explore.disabled = result.state === 'MOVING' || result.continuous;
    start.disabled = result.state === 'MOVING' || result.continuous;
    stop.disabled = result.state !== 'MOVING' && !result.continuous;
  } catch {
    state.textContent = '无法连接';
    count.textContent = '—';
    note.textContent = '请打开普通 HTTP/HTTPS 网页并刷新。Chrome 内部页面、扩展商店等受保护页面无法使用。';
    target.textContent = '';
    explore.disabled = true;
    start.disabled = true;
    stop.disabled = true;
  } finally { busy = false; }
}

explore.addEventListener('click', () => { void send('SPIDER_EXPLORE'); });
start.addEventListener('click', () => { void send('SPIDER_START'); });
stop.addEventListener('click', () => { void send('SPIDER_STOP'); });
void chrome.tabs.query({ active: true, currentWindow: true }).then(([tab]) => {
  tabId = tab?.id;
  return send('SPIDER_SCAN');
});
// Poll only while this small popup is open; this reads actual content-script state.
const timer = window.setInterval(() => { void send('SPIDER_STATUS'); }, 750);
window.addEventListener('pagehide', () => clearInterval(timer), { once: true });
