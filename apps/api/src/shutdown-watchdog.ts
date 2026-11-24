export const SHUTDOWN_DEADLINE_MS = 5000;
export type ShutdownRuntime = Pick<
  NodeJS.Process,
  'prependOnceListener' | 'once' | 'removeListener' | 'exit'
>;

/** Observe signals before Nest hooks; leave graceful cleanup/re-signalling to Nest. */
export function installShutdownWatchdog(
  runtime: ShutdownRuntime = process,
): () => void {
  let stopping = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const dispose = () => {
    clearTimeout(timer);
    runtime.removeListener('SIGTERM', begin);
    runtime.removeListener('SIGINT', begin);
    runtime.removeListener('exit', dispose);
  };
  const begin = () => {
    if (stopping) return;
    stopping = true;
    timer = setTimeout(() => {
      dispose();
      console.error(
        `SHUTDOWN_DEADLINE: штатное завершение API не завершилось за ${SHUTDOWN_DEADLINE_MS} мс; принудительная остановка.`,
      );
      runtime.exit(1);
    }, SHUTDOWN_DEADLINE_MS);
    // Must not keep an otherwise gracefully closed process alive.
    timer.unref();
  };
  // Once is essential: Nest re-sends the original signal after cleanup; our
  // listener must already be gone so that normal signal termination still works.
  runtime.prependOnceListener('SIGTERM', begin);
  runtime.prependOnceListener('SIGINT', begin);
  runtime.once('exit', dispose);
  return dispose;
}
