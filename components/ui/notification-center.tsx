"use client";

import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from "react";

type NoticeTone = "success" | "error" | "info";
type Notice = { id: number; title: string; detail?: string; tone: NoticeTone };
type NotificationValue = { notify: (notice: Omit<Notice, "id">) => void };

const NotificationContext = createContext<NotificationValue>({ notify: () => undefined });

export function NotificationCenter({ children }: { children: ReactNode }) {
  const [notices, setNotices] = useState<Notice[]>([]);
  const notify = useCallback((notice: Omit<Notice, "id">) => {
    const id = Date.now() + Math.floor(Math.random() * 10_000);
    setNotices((current) => [...current.slice(-2), { ...notice, id }]);
  }, []);

  useEffect(() => {
    if (!notices.length) return;
    const timers = notices.map((notice) => window.setTimeout(() => setNotices((current) => current.filter((item) => item.id !== notice.id)), notice.tone === "error" ? 7000 : 4400));
    return () => timers.forEach(window.clearTimeout);
  }, [notices]);

  const value = useMemo(() => ({ notify }), [notify]);
  return <NotificationContext.Provider value={value}>{children}<div className="notification-stack" aria-live="polite" aria-relevant="additions">{notices.map((notice) => <div key={notice.id} className={`app-notification app-notification-${notice.tone}`} role="status"><span className="notification-mark" aria-hidden="true">{notice.tone === "success" ? "✓" : notice.tone === "error" ? "!" : "i"}</span><span><strong>{notice.title}</strong>{notice.detail && <small>{notice.detail}</small>}</span><button type="button" onClick={() => setNotices((current) => current.filter((item) => item.id !== notice.id))} aria-label="Dismiss notification">×</button></div>)}</div></NotificationContext.Provider>;
}

export function useNotifications() { return useContext(NotificationContext); }
