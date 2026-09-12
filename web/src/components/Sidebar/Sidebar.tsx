"use client";

import React from "react";
import styles from "./Sidebar.module.css";

interface SidebarProps {
  userRole: "user" | "osb" | "admin" | "none";
  currentPage: "landing" | "dashboard" | "materials" | "matchmaker" | "reports" | "chatbot" | "osb" | "admin" | "settings";
  setCurrentPage: (
    page: "landing" | "dashboard" | "materials" | "matchmaker" | "reports" | "chatbot" | "osb" | "admin" | "settings"
  ) => void;
  sidebarOpen: boolean;
  setSidebarOpen: (open: boolean) => void;
  onLogout: () => void;
  // GET /v1/facilities/me -> name. Henüz yüklenmediyse null.
  facilityName: string | null;
}

export default function Sidebar({
  userRole,
  currentPage,
  setCurrentPage,
  sidebarOpen,
  setSidebarOpen,
  onLogout,
  facilityName,
}: SidebarProps) {
  const handleNavClick = (
    page: "dashboard" | "materials" | "matchmaker" | "reports" | "chatbot" | "osb" | "admin" | "settings"
  ) => {
    setCurrentPage(page);
    setSidebarOpen(false);
  };

  return (
    <aside className={`${styles.sidebar} ${sidebarOpen ? styles.open : styles.closed}`}>
      <div>
        {/* Sidebar Logo / Close Button */}
        <div className={styles.logoArea}>
          <div className="flex items-center gap-3">
            <span className="material-symbols-outlined text-accent-mint text-3xl filled">recycling</span>
            <span className="font-title text-xl font-bold tracking-tight text-on-surface">
              Eco<span className="text-accent-mint">Match</span>
            </span>
          </div>
          <button
            onClick={() => setSidebarOpen(false)}
            className="lg:hidden w-8 h-8 rounded-lg flex items-center justify-center text-on-surface-variant hover:bg-surface-light hover:text-on-surface transition-colors cursor-pointer"
          >
            <span className="material-symbols-outlined text-[18px]">close</span>
          </button>
        </div>

        {/* Navigation Links */}
        <nav className={styles.navContainer}>
          {userRole === "user" && (
            <>
              <button
                onClick={() => handleNavClick("dashboard")}
                className={`${styles.link} ${currentPage === "dashboard" ? styles.linkActive : styles.linkInactive}`}
              >
                <span className="material-symbols-outlined text-[20px]">dashboard</span>
                Kontrol Paneli
              </button>
              <button
                onClick={() => handleNavClick("materials")}
                className={`${styles.link} ${currentPage === "materials" ? styles.linkActive : styles.linkInactive}`}
              >
                <span className="material-symbols-outlined text-[20px]">inventory_2</span>
                Malzeme Yönetimi
              </button>
              <button
                onClick={() => handleNavClick("matchmaker")}
                className={`${styles.link} ${currentPage === "matchmaker" ? styles.linkActive : styles.linkInactive}`}
              >
                <span className="material-symbols-outlined text-[20px]">hub</span>
                AI Eşleştirme Paneli
              </button>
              <button
                onClick={() => handleNavClick("reports")}
                className={`${styles.link} ${currentPage === "reports" ? styles.linkActive : styles.linkInactive}`}
              >
                <span className="material-symbols-outlined text-[20px]">description</span>
                Raporlama Merkezi
              </button>
              <button
                onClick={() => handleNavClick("chatbot")}
                className={`${styles.link} ${currentPage === "chatbot" ? styles.linkActive : styles.linkInactive}`}
              >
                <span className="material-symbols-outlined text-[20px]">forum</span>
                EcoMatch AI Asistanı
              </button>
            </>
          )}
          {userRole === "osb" && (
            <button
              onClick={() => handleNavClick("osb")}
              className={`${styles.link} ${currentPage === "osb" ? styles.linkActive : styles.linkInactive}`}
            >
              <span className="material-symbols-outlined text-[20px]">domain</span>
              OSB Yönetici Paneli
            </button>
          )}
          {userRole === "admin" && (
            <button
              onClick={() => handleNavClick("admin")}
              className={`${styles.link} ${currentPage === "admin" ? styles.linkActive : styles.linkInactive}`}
            >
              <span className="material-symbols-outlined text-[20px]">admin_panel_settings</span>
              Sistem Admin Paneli
            </button>
          )}
        </nav>
      </div>

      {/* Profile and Logout */}
      <div className={styles.profileArea}>
        <button
          onClick={() => handleNavClick("settings")}
          className={`glass-panel ${styles.profileButton} ${currentPage === "settings" ? styles.profileButtonActive : ""}`}
        >
          {/* Tinted daire arka planı kaldırıldı -- sadece role göre renklenen düz ikon. */}
          <span
            className={`material-symbols-outlined text-[26px] shrink-0 ${
              userRole === "osb" ? "text-teal-700" : userRole === "admin" ? "text-amber-700" : "text-accent-mint"
            }`}
          >
            {userRole === "osb" ? "domain" : userRole === "admin" ? "admin_panel_settings" : "factory"}
          </span>
          <div className="overflow-hidden flex-1 text-left">
            <h4 className="text-xs font-bold text-on-surface truncate">
              {facilityName ??
                (userRole === "osb" ? "OSB Müdürlüğü" : userRole === "admin" ? "EcoMatch Sistem Admini" : "Tesis")}
            </h4>
            <p className="text-[10px] text-on-surface-variant">
              {userRole === "osb" ? "Bölge Yöneticisi" : userRole === "admin" ? "Sistem Yöneticisi" : "Tesis Temsilcisi"}
            </p>
          </div>
          <span className={`material-symbols-outlined text-[18px] shrink-0 ${styles.profileChevron}`}>settings</span>
        </button>
        <button
          onClick={onLogout}
          className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-xs font-semibold text-rose-600 bg-rose-500/10 border border-rose-500/15 hover:bg-rose-500/15 hover:border-rose-500/30 transition-all cursor-pointer"
        >
          <span className="material-symbols-outlined text-[16px]">logout</span>
          Çıkış Yap
        </button>
      </div>
    </aside>
  );
}
