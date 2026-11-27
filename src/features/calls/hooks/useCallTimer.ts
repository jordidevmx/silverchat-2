import { useEffect, useState } from "react";

/** Elapsed seconds since answeredAt, ticked once per second. */
export function useCallTimer(answeredAt: string | null): number {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!answeredAt) {
      setElapsed(0);
      return;
    }
    const start = new Date(answeredAt).getTime();
    const tick = () => setElapsed(Math.max(0, Math.floor((Date.now() - start) / 1000)));
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [answeredAt]);

  return elapsed;
}
