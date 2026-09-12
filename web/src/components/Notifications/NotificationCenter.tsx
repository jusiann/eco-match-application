"use client";

import React, { useEffect, useRef, useState } from "react";
import styles from "./NotificationCenter.module.css";
import { AppNotification } from "../../types";

interface NotificationCenterProps {
  notifications: AppNotification[];
  onMarkRead: (id: string) => void;
  onMarkAllRead: () => void;
}

const ICONS: Record<string, string> = {
  match_accepted: "handshake",
  match_rejected: "cancel",
  match_expired: "schedule",
  review_required: "pending_actions",
  facility_verified: "verified",
  classification_approved: "check_circle",
  classification_rejected: "cancel",
};
const DEFAULT_ICON = "notifications";

export default function NotificationCenter({ notifications, onMarkRead, onMarkAllRead }: NotificationCenterProps) {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const unreadCount = notifications.filter((n) => !n.read).length;

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div className={styles.wrapper} ref={wrapperRef}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-9 h-9 rounded-lg flex items-center justify-center text-on-surface-variant hover:bg-surface-light hover:text-on-surface transition-colors relative cursor-pointer"
      >
        <span className="material-symbols-outlined text-[20px]">notifications</span>
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full bg-accent-mint text-[9px] font-bold text-white flex items-center justify-center">
            {unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className={`${styles.panel} glass-panel rounded-2xl overflow-hidden`}>
          <div className="flex justify-between items-center px-4 py-3 border-b border-border-color">
            <h4 className="text-xs font-bold text-on-surface uppercase tracking-wider">Bildirimler</h4>
            {unreadCount > 0 && (
              <button
                onClick={onMarkAllRead}
                className="text-[10px] font-semibold text-accent-mint hover:underline cursor-pointer"
              >
                Tümünü okundu işaretle
              </button>
            )}
          </div>
          <div className={styles.list}>
            {notifications.length === 0 && (
              <p className="text-xs text-on-surface-variant text-center py-8">Henüz bildirim yok.</p>
            )}
            {notifications.map((n) => (
              <button
                key={n.id}
                onClick={() => onMarkRead(n.id)}
                className={`${styles.item} ${!n.read ? styles.itemUnread : ""}`}
              >
                <span className="material-symbols-outlined text-accent-mint text-[18px] shrink-0 mt-0.5">
                  {ICONS[n.type] ?? DEFAULT_ICON}
                </span>
                <div className="flex flex-col gap-0.5 min-w-0 text-left">
                  <span className="text-xs font-semibold text-on-surface truncate">{n.title}</span>
                  <span className="text-[11px] text-on-surface-variant leading-snug">{n.body}</span>
                  <span className="text-[9px] text-on-surface-variant/70 mt-1">{n.createdAt}</span>
                </div>
                {!n.read && <span className="w-2 h-2 rounded-full bg-accent-mint shrink-0 ml-auto mt-1"></span>}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
