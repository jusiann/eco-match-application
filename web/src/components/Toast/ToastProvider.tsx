"use client";

import React, { createContext, useCallback, useContext, useRef, useState } from "react";
import styles from "./Toast.module.css";

export type ToastType = "success" | "error" | "info";

interface ToastItem {
  id: string;
  message: string;
  type: ToastType;
}

interface ToastContextValue {
  showToast: (message: string, type?: ToastType) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

// alert()/confirm() taşıyıcıları uygulamanın kendi görsel diline (glass-panel,
// yuvarlatılmış köşeler, accent renkleri) uymuyor ve tarayıcı native popup'ı
// akışı tamamen kesiyor -- bu, tüm alert() çağrılarının yerini alan tek ortak
// mekanizma. Context olarak kurulu çünkü AuthModal (giriş yapılmadan önce) ve
// AdminView gibi derin bileşenler de kendi başına toast göstermek zorunda,
// prop drilling'e gerek kalmadan.
export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast, ToastProvider dışında çağrıldı.");
  return ctx;
}

const ICONS: Record<ToastType, string> = {
  success: "check_circle",
  error: "error",
  info: "info",
};

const DURATIONS: Record<ToastType, number> = {
  success: 4000,
  info: 4500,
  error: 6500,
};

export default function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const timers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
  }, []);

  const showToast = useCallback(
    (message: string, type: ToastType = "info") => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      setToasts((prev) => [...prev, { id, message, type }]);
      const timer = setTimeout(() => dismiss(id), DURATIONS[type]);
      timers.current.set(id, timer);
    },
    [dismiss]
  );

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <div className={styles.stack} role="status" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`${styles.toast} ${styles[t.type]} glass-panel`}>
            <span className={`material-symbols-outlined text-[18px] ${styles.icon}`}>{ICONS[t.type]}</span>
            <p className={styles.message}>{t.message}</p>
            <button onClick={() => dismiss(t.id)} className={styles.close} aria-label="Kapat">
              <span className="material-symbols-outlined text-[16px]">close</span>
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
