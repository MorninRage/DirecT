import { useEffect, useState } from "react";
import type { AccountProfile } from "../types/account";

/** PBR background scene: off when user requests reduced motion (setting or OS). */
export function useHud3dEnabled(profile: AccountProfile | null | undefined): boolean {
  const [prefersReduced, setPrefersReduced] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setPrefersReduced(mq.matches);
    const fn = () => setPrefersReduced(mq.matches);
    mq.addEventListener("change", fn);
    return () => mq.removeEventListener("change", fn);
  }, []);

  if (profile?.settings.reduceMotion) return false;
  return !prefersReduced;
}
