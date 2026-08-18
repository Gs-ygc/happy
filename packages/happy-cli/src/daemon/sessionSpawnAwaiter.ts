import type { SpawnSessionResult } from '@/modules/common/registerCommonHandlers';

export type SpawnAwaiter = (result: SpawnSessionResult) => void;

export function settleSpawnAwaiter(
  awaiters: Map<number, SpawnAwaiter>,
  pid: number,
  result: SpawnSessionResult,
): boolean {
  const awaiter = awaiters.get(pid);
  if (!awaiter) return false;
  awaiters.delete(pid);
  awaiter(result);
  return true;
}

export function registerSpawnAwaiter(
  awaiters: Map<number, SpawnAwaiter>,
  pid: number,
  awaiter: SpawnAwaiter,
  currentSessionId: string | undefined,
  processIsTracked: boolean,
): void {
  awaiters.set(pid, awaiter);

  if (currentSessionId) {
    settleSpawnAwaiter(awaiters, pid, { type: 'success', sessionId: currentSessionId });
  } else if (!processIsTracked) {
    settleSpawnAwaiter(awaiters, pid, {
      type: 'error',
      errorMessage: `Happy process PID ${pid} exited before reporting its session`,
    });
  }
}
