"use client";

import { useEffect } from "react";

/**
 * Registers the app-shell service worker. Kept out of the root layout body so
 * the layout itself can stay a server component.
 */
export function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;

    const register = () => {
      navigator.serviceWorker.register("/sw.js").catch((error) => {
        // A failed registration costs installability, not function — never
        // surface it to the user mid-task.
        console.error("Service worker registration failed", error);
      });
    };

    window.addEventListener("load", register);
    return () => window.removeEventListener("load", register);
  }, []);

  return null;
}
