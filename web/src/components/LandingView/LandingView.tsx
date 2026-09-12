"use client";

import React, { useState } from "react";
import styles from "./LandingView.module.css";
import AuthModal from "../Modals/AuthModal";

interface LandingViewProps {
  onLogin: (role: "user" | "osb" | "admin") => void;
}

export default function LandingView({ onLogin }: LandingViewProps) {
  const [authRole, setAuthRole] = useState<"user" | "osb" | "admin" | null>(null);

  return (
    <div className={styles.container}>
      {/* Top Navigation */}
      <header className={styles.header}>
        <div className="flex items-center gap-3">
          <span className="material-symbols-outlined text-accent-mint text-3xl filled">recycling</span>
          <span className="font-title text-2xl font-bold tracking-tight text-on-surface flex items-center gap-1.5">
            Eco<span className="text-accent-mint">Match</span>
          </span>
        </div>
        <div className="flex items-center gap-6">
          <a className="text-on-surface-variant hover:text-accent-mint transition-colors duration-200 text-sm font-medium hidden md:block" href="#capabilities">
            Yetenekler
          </a>
          <button onClick={() => setAuthRole("user")} className="btn-secondary px-6 py-2.5 rounded-full text-sm font-medium cursor-pointer">
            Giriş Yap
          </button>
        </div>
      </header>

      <main className="flex-grow pt-20">
        {/* Ticker */}
        <div className={styles.tickerContainer}>
          <div className="ticker-content flex gap-8 sm:gap-16 text-accent-mint text-[10px] sm:text-xs font-semibold uppercase tracking-widest whitespace-nowrap">
            <span className="flex items-center shrink-0 whitespace-nowrap">
              <span className="material-symbols-outlined align-middle mr-2 text-[16px] sm:text-[18px]">recycling</span> 1,240 Ton Atık Geri Kazandırıldı
            </span>
            <span className="text-on-surface-variant/40 shrink-0">•</span>
            <span className="flex items-center shrink-0 whitespace-nowrap">
              <span className="material-symbols-outlined align-middle mr-2 text-[16px] sm:text-[18px]">co2</span> 450 Ton CO2 Azaltımı Sağlandı
            </span>
            <span className="text-on-surface-variant/40 shrink-0">•</span>
            <span className="flex items-center shrink-0 whitespace-nowrap">
              <span className="material-symbols-outlined align-middle mr-2 text-[16px] sm:text-[18px]">payments</span> €150,000 SKDM Karbon Vergisi Tasarrufu
            </span>
            <span className="text-on-surface-variant/40 shrink-0">•</span>
            {/* Duplicate for loop */}
            <span className="flex items-center shrink-0 whitespace-nowrap">
              <span className="material-symbols-outlined align-middle mr-2 text-[16px] sm:text-[18px]">recycling</span> 1,240 Ton Atık Geri Kazandırıldı
            </span>
            <span className="text-on-surface-variant/40 shrink-0">•</span>
            <span className="flex items-center shrink-0 whitespace-nowrap">
              <span className="material-symbols-outlined align-middle mr-2 text-[16px] sm:text-[18px]">co2</span> 450 Ton CO2 Azaltımı Sağlandı
            </span>
          </div>
        </div>

        {/* Hero Section */}
        <section className={styles.heroSection}>
          <div className={styles.heroGlow}></div>

          <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-8 relative z-10 w-full items-center mt-6 md:mt-12">
            <div className="lg:col-span-7 flex flex-col items-start gap-6">
              <div className="inline-flex items-center gap-2 text-accent-mint text-xs font-semibold uppercase tracking-widest">
                <span className="w-2 h-2 rounded-full bg-accent-mint animate-pulse"></span>
                Yapay Zeka Destekli Kaynak Optimizasyonu
              </div>
              <h1 className="font-title text-4xl md:text-5xl lg:text-6xl font-extrabold text-on-surface leading-tight">
                EcoMatch: Akıllı<br />
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-accent-mint">Endüstriyel Simbiyoz</span> Platformu
              </h1>
              <p className="text-base md:text-lg text-on-surface-variant max-w-2xl leading-relaxed">
                Endüstriyel atık ve yan ürünlerinizi katma değerli kaynaklara dönüştürün. Tesisleri eşleştirin, lojistiği optimize edin ve AB yeşil mutabakat (ESPR/SKDM) uyumluluğunu otomatikleştirin.
              </p>
              <button onClick={() => setAuthRole("user")} className="btn-primary px-8 py-4 rounded-xl font-semibold text-base flex items-center justify-center gap-2 cursor-pointer">
                Tesis Olarak Başla
                <span className="material-symbols-outlined text-[20px]">arrow_forward</span>
              </button>
            </div>

            <div className="lg:col-span-5 flex flex-col gap-4 w-full max-w-md mx-auto lg:mx-0 mt-8 lg:mt-0">
              <p className="text-xs font-bold text-on-surface-variant uppercase tracking-wider mb-1 pl-1">Hızlı Erişim Rol Seçimi</p>
              <div onClick={() => setAuthRole("user")} className={`${styles.card} glass-panel p-6 rounded-2xl flex items-center justify-between group cursor-pointer transition-all duration-300`}>
                <div className="flex items-center gap-4">
                  <span className="material-symbols-outlined text-accent-mint text-4xl">factory</span>
                  <div>
                    <h3 className="font-title text-lg font-bold text-on-surface group-hover:text-accent-mint transition-colors">Tesis / Fabrika Paneli</h3>
                    <p className="text-xs text-on-surface-variant mt-0.5">Atık listeleme, girdi arama ve eşleştirme</p>
                  </div>
                </div>
                <span className={`material-symbols-outlined text-on-surface-variant group-hover:text-accent-mint ${styles.chevronIcon}`}>chevron_right</span>
              </div>

              <div onClick={() => setAuthRole("osb")} className={`${styles.card} glass-panel p-6 rounded-2xl flex items-center justify-between group cursor-pointer transition-all duration-300`}>
                <div className="flex items-center gap-4">
                  <span className="material-symbols-outlined text-teal-700 text-4xl">domain</span>
                  <div>
                    <h3 className="font-title text-lg font-bold text-on-surface group-hover:text-teal-700 transition-colors">OSB Yönetim Paneli</h3>
                    <p className="text-xs text-on-surface-variant mt-0.5">Bölgesel döngüsellik ve toplu analiz takibi</p>
                  </div>
                </div>
                <span className={`material-symbols-outlined text-on-surface-variant group-hover:text-teal-700 ${styles.chevronIcon}`}>chevron_right</span>
              </div>

              <div onClick={() => setAuthRole("admin")} className={`${styles.card} glass-panel p-6 rounded-2xl flex items-center justify-between group cursor-pointer transition-all duration-300`}>
                <div className="flex items-center gap-4">
                  <span className="material-symbols-outlined text-secondary text-4xl">admin_panel_settings</span>
                  <div>
                    <h3 className="font-title text-lg font-bold text-on-surface group-hover:text-secondary transition-colors">Sistem Admin Paneli</h3>
                    <p className="text-xs text-on-surface-variant mt-0.5">Kullanıcı, onay kuyruğu ve ağırlık yönetimi</p>
                  </div>
                </div>
                <span className={`material-symbols-outlined text-on-surface-variant group-hover:text-secondary ${styles.chevronIcon}`}>chevron_right</span>
              </div>
            </div>
          </div>
        </section>
      </main>

      <AuthModal
        isOpen={authRole !== null}
        role={authRole || "user"}
        onClose={() => setAuthRole(null)}
        onAuthComplete={(role) => onLogin(role)}
      />
    </div>
  );
}
