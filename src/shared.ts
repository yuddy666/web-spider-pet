export type SpiderState = 'IDLE' | 'SCANNING' | 'MOVING' | 'ARRIVED';
export type SpiderCommand = { type: 'SPIDER_STATUS' | 'SPIDER_SCAN' | 'SPIDER_EXPLORE' | 'SPIDER_START' | 'SPIDER_STOP' };
export interface SpiderStatus {
  state: SpiderState;
  visibleLinks: number;
  target: string | null;
  note: string;
  continuous: boolean;
  arrivedLinks: number;
}

export function isSpiderCommand(value: unknown): value is SpiderCommand {
  if (!value || typeof value !== 'object' || !('type' in value)) return false;
  return ['SPIDER_STATUS', 'SPIDER_SCAN', 'SPIDER_EXPLORE', 'SPIDER_START', 'SPIDER_STOP'].includes(String(value.type));
}
