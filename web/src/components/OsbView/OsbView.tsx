"use client";

import React, { useState } from "react";
import styles from "./OsbView.module.css";
import { OsbStats, OsbFacilityRow, OsbMapResponse } from "../../lib/api";

interface OsbViewProps {
  stats: OsbStats | null;
  facilities: OsbFacilityRow[];
  map: OsbMapResponse | null;
  onDownloadMonthlyReport: (period: string, format: "pdf" | "xlsx") => void;
}

// lat/lng -> SVG viewBox koordinatı (600x320), tesislerin gerçek konumlarına göre
// dinamik bir bounding box üzerinden. Tek tesis/veri yoksa merkeze sabitlenir.
function projectPins(pins: OsbMapResponse["pins"]) {
  const known = pins.filter((p) => p.lat !== null && p.lng !== null) as Array<{
    id: string;
    name: string;
    sector: string;
    lat: number;
    lng: number;
  }>;
  if (known.length === 0) return { project: () => ({ x: 300, y: 160 }), known: [] as typeof known };

  const lats = known.map((p) => p.lat);
  const lngs = known.map((p) => p.lng);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);
  const latSpan = maxLat - minLat || 1;
  const lngSpan = maxLng - minLng || 1;
  const pad = 50;

  const project = (lat: number, lng: number) => ({
    x: pad + ((lng - minLng) / lngSpan) * (600 - 2 * pad),
    y: 320 - pad - ((lat - minLat) / latSpan) * (320 - 2 * pad),
  });

  return { project, known };
}

export default function OsbView({
  stats,
  facilities,
  map,
  onDownloadMonthlyReport,
}: OsbViewProps) {
  const [period, setPeriod] = useState(() => new Date().toISOString().slice(0, 7));

  const { project, known } = projectPins(map?.pins ?? []);
  const coordsById = new Map(known.map((p) => [p.id, project(p.lat, p.lng)]));

  return (
    <div className={styles.container}>
      {/* OSB Stats */}
      <div className={styles.statsGrid}>
        <div className="glass-panel p-4 md:p-6 rounded-2xl flex flex-col justify-between">
          <span className="text-[10px] md:text-xs font-semibold text-on-surface-variant uppercase tracking-wider block">
            OSB Simbiyoz Oranı
          </span>
          <span className="text-xl md:text-3xl font-extrabold font-title text-on-surface mt-2 block">
            {stats ? `${Math.round(stats.symbiosisRate * 100)}%` : "—"}
          </span>
          <div className="w-full bg-surface-light h-1.5 rounded-full mt-2 overflow-hidden">
            <div
              className="bg-accent-mint h-full rounded-full"
              style={{ width: `${stats ? Math.round(stats.symbiosisRate * 100) : 0}%` }}
            ></div>
          </div>
        </div>
        <div className="glass-panel p-4 md:p-6 rounded-2xl flex flex-col justify-between">
          <span className="text-[10px] md:text-xs font-semibold text-on-surface-variant uppercase tracking-wider block">
            Doğrulanmış Tesis
          </span>
          <span className="text-xl md:text-3xl font-extrabold font-title text-on-surface mt-2 block">
            {stats ? `${stats.totalFacilities} Tesis` : "—"}
          </span>
        </div>
        <div className="glass-panel p-4 md:p-6 rounded-2xl flex flex-col justify-between">
          <span className="text-[10px] md:text-xs font-semibold text-on-surface-variant uppercase tracking-wider block">
            Bu Ay Toplam CO2
          </span>
          <span className="text-xl md:text-3xl font-extrabold font-title text-teal-700 mt-2 block">
            {stats ? `${(stats.monthlyCo2SavedKg / 1000).toFixed(1)} Ton` : "—"}
          </span>
        </div>
        <div className="glass-panel p-4 md:p-6 rounded-2xl flex flex-col justify-between">
          <span className="text-[10px] md:text-xs font-semibold text-on-surface-variant uppercase tracking-wider block">
            Bu Ay CBAM Tasarrufu
          </span>
          <span className="text-xl md:text-3xl font-extrabold font-title text-accent-mint mt-2 block">
            {stats ? `€${stats.monthlyCbamSavingEur.toLocaleString("tr-TR")}` : "—"}
          </span>
        </div>
      </div>

      {/* OSB Map & Approvals */}
      <div className={styles.layoutGrid}>
        {/* OSB regional map -- gerçek tesis konumları (osb/map) üzerine, dinamik lat/lng -> SVG izdüşümü */}
        <div className="lg:col-span-7 glass-panel p-6 rounded-2xl flex flex-col gap-4">
          <div className="flex justify-between items-center flex-wrap gap-2">
            <h3 className="font-title font-bold text-on-surface text-base">Bölgesel Tesis ve Akış Dağılımı</h3>
            <div className="flex items-center gap-2">
              <input
                type="month"
                value={period}
                onChange={(e) => setPeriod(e.target.value)}
                className="bg-surface border border-border-color rounded-lg px-2 py-1.5 text-[11px] text-on-surface"
              />
              <button
                onClick={() => onDownloadMonthlyReport(period, "pdf")}
                className="btn-secondary px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer"
              >
                <span className="material-symbols-outlined text-[16px]">analytics</span>
                Aylık Rapor (PDF)
              </button>
            </div>
          </div>
          <div className={styles.mapWrapper}>
            {known.length === 0 ? (
              <div className="w-full h-full flex items-center justify-center text-xs text-on-surface-variant text-center px-6">
                Bölgede konum bilgisi olan doğrulanmış tesis bulunamadı.
              </div>
            ) : (
              <svg viewBox="0 0 600 320" className="w-full h-full text-on-surface-variant" fill="currentColor">
                <defs>
                  <pattern id="osb-grid" width="30" height="30" patternUnits="userSpaceOnUse">
                    <path d="M 30 0 L 0 0 0 30" fill="none" stroke="rgba(29,36,32,0.05)" strokeWidth={1} />
                  </pattern>
                </defs>
                <rect width="100%" height="100%" fill="url(#osb-grid)" />

                {/* Tamamlanmış eşleşme akış çizgileri */}
                {(map?.matchLines ?? []).map((line) => {
                  const from = line.from && line.from.lat !== null && line.from.lng !== null ? project(line.from.lat, line.from.lng) : null;
                  const to = line.to && line.to.lat !== null && line.to.lng !== null ? project(line.to.lat, line.to.lng) : null;
                  if (!from || !to) return null;
                  return (
                    <path
                      key={line.matchId}
                      d={`M ${from.x} ${from.y} Q ${(from.x + to.x) / 2} ${(from.y + to.y) / 2 - 30} ${to.x} ${to.y}`}
                      fill="none"
                      stroke="#1e5f46"
                      strokeWidth={1.5}
                      strokeOpacity={0.5}
                    />
                  );
                })}

                {known.map((p) => {
                  const pt = coordsById.get(p.id)!;
                  return (
                    <g key={p.id}>
                      <circle cx={pt.x} cy={pt.y} r={7} fill="#1e5f46" />
                      <text x={pt.x + 12} y={pt.y + 3} fill="#666f63" fontSize="9" fontWeight="bold">
                        {p.name}
                      </text>
                    </g>
                  );
                })}
              </svg>
            )}
          </div>
        </div>

        {/* Bölge tesisleri -- doğrulama ONAYI/REDDİ ADMIN paneline taşındı (CLAUDE.md: "Verification
            is an admin action"), OSB_MANAGER bu işlemi zaten çağıramıyordu (admin.controller.ts
            @Roles(ADMIN) -> 403). Burada yalnızca bilgi amaçlı, salt-okunur durum gösteriliyor. */}
        <div className="lg:col-span-5 glass-panel p-6 rounded-2xl flex flex-col gap-4">
          <div>
            <h3 className="font-title font-bold text-on-surface text-base">Bölge Tesisleri</h3>
            <p className="text-[11px] text-on-surface-variant mt-1">
              Doğrulama onay/red işlemleri EcoMatch Sistem Admini tarafından yapılır.
            </p>
          </div>
          <div className="overflow-x-auto max-h-96 overflow-y-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="text-[10px] font-bold text-on-surface-variant uppercase border-b border-border-color pb-2">
                  <th className="pb-2">Tesis Adı</th>
                  <th className="pb-2">Sektör</th>
                  <th className="pb-2 text-right">Doğrulama</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-color text-xs text-on-surface">
                {facilities.length === 0 && (
                  <tr>
                    <td colSpan={3} className="py-6 text-center text-on-surface-variant">
                      Bölgede tesis yok.
                    </td>
                  </tr>
                )}
                {facilities.map((f) => (
                  <tr key={f.id}>
                    <td className="py-3 font-semibold text-on-surface">{f.name}</td>
                    <td className="py-3 text-on-surface-variant">{f.sector}</td>
                    <td className="py-3 text-right">
                      <span className={`status-label ${f.verified ? "text-accent-mint" : "text-amber-700"}`}>
                        {f.verified ? "Doğrulanmış" : "Bekliyor"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
