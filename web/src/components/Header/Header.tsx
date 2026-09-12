"use client";

import React from "react";
import styles from "./Header.module.css";
import NotificationCenter from "../Notifications/NotificationCenter";
import { AppNotification } from "../../types";

interface HeaderProps {
  userRole: "user" | "osb" | "admin" | "none";
  currentPage: "landing" | "dashboard" | "materials" | "matchmaker" | "reports" | "chatbot" | "osb" | "admin" | "settings";
  setSidebarOpen: (open: boolean) => void;
  notifications: AppNotification[];
  onMarkRead: (id: string) => void;
  onMarkAllRead: () => void;
  // /v1/notifications/stream (Socket.IO) bağlantısının GERÇEK durumu.
  socketConnected: boolean;
}

export default function Header({
  userRole,
  currentPage,
  setSidebarOpen,
  notifications,
  onMarkRead,
  onMarkAllRead,
  socketConnected,
}: HeaderProps) {
  const getPageTitle = () => {
    switch (currentPage) {
      case "dashboard":
        return "Kontrol Paneli";
      case "materials":
        return "Malzeme Yönetimi";
      case "matchmaker":
        return "AI Eşleştirme Paneli";
      case "reports":
        return "Raporlama Merkezi";
      case "chatbot":
        return "EcoMatch AI Asistanı";
      case "osb":
        return "OSB Yönetici Paneli";
      case "admin":
        return "Sistem Admin Paneli";
      case "settings":
        return "Hesap Ayarları";
      default:
        return "";
    }
  };

  const roleColor = userRole === "osb" ? "text-teal-700" : userRole === "admin" ? "text-amber-700" : "text-accent-mint";
  const roleText = userRole === "osb" ? "OSB" : userRole === "admin" ? "ADMIN" : "TESİS";

  return (
    <header className={styles.header}>
      <div className="flex items-center gap-2 md:gap-4 min-w-0">
        {/* Renkli/dolgu arka planlı "ikon kutusu" yerine düz ikon -- yalnızca hover'da
            zemin beliriyor, kalıcı bir tint kutusu yok. */}
        <button
          onClick={() => setSidebarOpen(true)}
          className="lg:hidden w-9 h-9 rounded-lg flex items-center justify-center text-on-surface-variant hover:bg-surface-light hover:text-on-surface mr-1 shrink-0 cursor-pointer transition-colors"
        >
          <span className="material-symbols-outlined text-[20px]">menu</span>
        </button>
        <h2 className="font-title text-base md:text-xl font-bold text-on-surface truncate">
          {getPageTitle()}
        </h2>
        {/* Rol etiketi -- kutu/kenarlık olmadan sadece kalın, renkli, harf aralıklı metin. */}
        <span className={`status-label ${roleColor} shrink-0`}>{roleText}</span>
      </div>

      <div className="flex items-center gap-3 md:gap-4 shrink-0">
        <NotificationCenter notifications={notifications} onMarkRead={onMarkRead} onMarkAllRead={onMarkAllRead} />
        {/* Canlı bildirim akışının durumu -- yazı/kutu yok, sadece bir nokta. Anlamı
            title tooltip'inde ve rengin kendisinde (yeşil/kırmızı). */}
        <span
          className={`hidden sm:inline-block w-2 h-2 rounded-full shrink-0 ${
            socketConnected ? "bg-accent-mint animate-pulse" : "bg-rose-500"
          }`}
          title={
            socketConnected
              ? "Canlı bildirim akışı bağlı (/v1/notifications/stream)"
              : "Canlı bildirim akışı kopuk — bildirimler yalnızca sayfa yenilendiğinde güncellenir"
          }
        ></span>
      </div>
    </header>
  );
}
