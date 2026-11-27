import { useCallback, useEffect, useRef, useState } from "react";
import { registerServiceWorker } from "./registerSW";

export function useServiceWorkerUpdate() {
  const [needUpdate, setNeedUpdate] = useState(false);
  const applyRef = useRef<(() => Promise<void>) | null>(null);

  useEffect(() => {
    return registerServiceWorker((applyUpdate) => {
      applyRef.current = applyUpdate;
      setNeedUpdate(true);
    });
  }, []);

  const reloadToUpdate = useCallback(async () => {
    if (applyRef.current) {
      await applyRef.current();
    } else if (typeof window !== "undefined") {
      window.location.reload();
    }
  }, []);

  return { needUpdate, reloadToUpdate };
}
