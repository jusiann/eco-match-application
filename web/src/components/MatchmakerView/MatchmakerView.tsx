"use client";

import React, { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import styles from "./MatchmakerView.module.css";
import { MatchCandidate } from "../../types";

// Leaflet modül yüklenirken window'a erişiyor -- next.config.ts'in statik export
// modu her sayfayı sunucu tarafında (Node, DOM yok) bir kez ön-render ettiğinden
// düz bir import "ReferenceError: window is not defined" ile build'i kırıyor.
// ssr:false bu bileşeni yalnızca client'ta (hydration sonrası) yüklüyor.
const RouteMap = dynamic(() => import("./RouteMap"), { ssr: false });

interface MatchmakerViewProps {
  matches: MatchCandidate[];
  setMatches: React.Dispatch<React.SetStateAction<MatchCandidate[]>>;
  selectedMatchId: string;
  setSelectedMatchId: (id: string) => void;
  onAcceptMatch: () => void;
  onRejectMatch: (reasonCategory: string, reasonText: string) => void;
  // A3: yalnızca süresi dolmuş (expired) eşleşmeler için -- backend eskisini expired
  // bırakıp yeni bir 30 günlük pencere açan bir match daha oluşturuyor.
  onRetryMatch: () => void;
  // Kendi tesisinizin konumu (facilitiesApi.getMe()#location) -- rota haritasının
  // başlangıç noktası. Tesis konumu hiç girilmemişse null, harita bunu ele alır.
  originLocation: { lat: number; lng: number } | null;
}

// match_status durum makinesi terminal (bir daha kabul/red edilemeyen) durumlar --
// matches.service.ts#TERMINAL_STATUSES ile birebir aynı liste. Eskiden Kabul Et/Reddet
// butonları eşleşmenin durumuna bakmaksızın HER ZAMAN gösteriliyordu; tamamlanmış/
// reddedilmiş/süresi dolmuş bir eşleşmede tıklamak backend'den sessizce 409 alıyordu.
const TERMINAL_STATUSES = new Set(["completed", "rejected", "expired"]);

export default function MatchmakerView({
  matches,
  setMatches,
  selectedMatchId,
  setSelectedMatchId,
  onAcceptMatch,
  onRejectMatch,
  onRetryMatch,
  originLocation,
}: MatchmakerViewProps) {
  const radarCanvasRef = useRef<HTMLCanvasElement | null>(null);

  // Local state for the rejection UI
  const [rejectPanelOpen, setRejectPanelOpen] = useState(false);
  const [rejectReasonText, setRejectReasonText] = useState("");

  const [viewMode, setViewMode] = useState<"board" | "history">("board");
  const [historyFilter, setHistoryFilter] = useState<"all" | "accepted" | "rejected" | "completed">("all");
  const [historySort, setHistorySort] = useState<"date_desc" | "date_asc" | "score_desc" | "score_asc">("date_desc");

  const selectedMatch = matches.find((m) => m.id === selectedMatchId) || matches[0];

  // --- DRAWING RADAR CHART ---
  const drawRadarChart = (details: MatchCandidate["details"]) => {
    const canvas = radarCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * 2;
    canvas.height = rect.height * 2;
    ctx.scale(2, 2);

    const width = rect.width;
    const height = rect.height;
    const centerX = width / 2;
    const centerY = height / 2;
    const radius = Math.min(width, height) / 2.6;

    const labels = ["Malzeme", "Kalite", "Çevre", "Lojistik", "Ekonomi"];
    const values = [details.material, details.quality, details.env, details.logistics, details.economic];
    const numAxes = labels.length;

    ctx.clearRect(0, 0, width, height);

    // Draw polygons
    ctx.strokeStyle = "rgba(29, 36, 32, 0.1)";
    ctx.lineWidth = 1;
    for (let level = 1; level <= 5; level++) {
      const curRadius = radius * (level / 5);
      ctx.beginPath();
      for (let i = 0; i < numAxes; i++) {
        const angle = (i * 2 * Math.PI) / numAxes - Math.PI / 2;
        const x = centerX + curRadius * Math.cos(angle);
        const y = centerY + curRadius * Math.sin(angle);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.stroke();
    }

    // Axes and Labels
    ctx.fillStyle = "#666f63";
    ctx.font = "bold 9px Inter, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    for (let i = 0; i < numAxes; i++) {
      const angle = (i * 2 * Math.PI) / numAxes - Math.PI / 2;
      const xAxis = centerX + radius * Math.cos(angle);
      const yAxis = centerY + radius * Math.sin(angle);

      ctx.beginPath();
      ctx.moveTo(centerX, centerY);
      ctx.lineTo(xAxis, yAxis);
      ctx.stroke();

      const labelDist = radius + 15;
      const lx = centerX + labelDist * Math.cos(angle);
      const ly = centerY + labelDist * Math.sin(angle);
      ctx.fillText(labels[i], lx, ly);
    }

    // Score Polygon
    ctx.beginPath();
    for (let i = 0; i < numAxes; i++) {
      const angle = (i * 2 * Math.PI) / numAxes - Math.PI / 2;
      const valRatio = values[i] / 100;
      const x = centerX + radius * valRatio * Math.cos(angle);
      const y = centerY + radius * valRatio * Math.sin(angle);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fillStyle = "rgba(30, 95, 70, 0.2)";
    ctx.fill();
    ctx.strokeStyle = "#1e5f46";
    ctx.lineWidth = 2;
    ctx.stroke();

    // Data dots
    for (let i = 0; i < numAxes; i++) {
      const angle = (i * 2 * Math.PI) / numAxes - Math.PI / 2;
      const valRatio = values[i] / 100;
      const x = centerX + radius * valRatio * Math.cos(angle);
      const y = centerY + radius * valRatio * Math.sin(angle);

      ctx.beginPath();
      ctx.arc(x, y, 3, 0, 2 * Math.PI);
      ctx.fillStyle = "#fffdf8";
      ctx.fill();
      ctx.strokeStyle = "#1e5f46";
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
  };

  useEffect(() => {
    if (selectedMatch) {
      drawRadarChart(selectedMatch.details);
    }

    const handleResize = () => {
      if (selectedMatch) {
        drawRadarChart(selectedMatch.details);
      }
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [selectedMatchId, matches]);

  const handleConfirmRejectMatch = () => {
    onRejectMatch("other", rejectReasonText);
    setRejectPanelOpen(false);
    setRejectReasonText("");
  };

  const statusLabel = (status: MatchCandidate["status"]) =>
    status === "accepted"
      ? "Kabul Edildi"
      : status === "rejected"
      ? "Reddedildi"
      : status === "completed"
      ? "Tamamlandı"
      : status === "expired"
      ? "Süresi Doldu"
      : "Onay Bekliyor";

  const historyRows = matches
    .filter((m) => m.status !== "pending")
    .filter((m) => historyFilter === "all" || m.status === historyFilter)
    .sort((a, b) => {
      if (historySort === "date_desc") return b.date.localeCompare(a.date);
      if (historySort === "date_asc") return a.date.localeCompare(b.date);
      if (historySort === "score_desc") return b.score - a.score;
      return a.score - b.score;
    });

  const handleExportCsv = () => {
    const header = ["Tesis", "Tarih", "Skor", "Durum", "CO2 Tasarrufu (kg)", "Tasarruf (EUR)"];
    const rows = historyRows.map((m) => [m.name, m.date, m.score, statusLabel(m.status), m.co2, m.savings]);
    const csv = [header, ...rows].map((row) => row.map((cell) => `"${cell}"`).join(",")).join("\n");
    const blob = new Blob([`﻿${csv}`], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "esleztirme-gecmisi.csv";
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-2 p-1 rounded-xl bg-surface-light border border-border-color self-start">
        <button
          onClick={() => setViewMode("board")}
          className={`px-4 py-2 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
            viewMode === "board" ? "text-white bg-primary shadow-sm" : "text-on-surface-variant hover:text-on-surface"
          }`}
        >
          Eşleştirme Panosu
        </button>
        <button
          onClick={() => setViewMode("history")}
          className={`px-4 py-2 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
            viewMode === "history" ? "text-white bg-primary shadow-sm" : "text-on-surface-variant hover:text-on-surface"
          }`}
        >
          Eşleştirme Geçmişi
        </button>
      </div>

      {viewMode === "history" ? (
        <div className="glass-panel rounded-2xl overflow-hidden">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-5 border-b border-border-color">
            <div className="flex gap-3">
              <select
                value={historyFilter}
                onChange={(e) => setHistoryFilter(e.target.value as typeof historyFilter)}
                className="bg-surface border border-border-color rounded-lg text-xs px-3 py-2 text-on-surface focus:outline-none focus:border-accent-mint"
              >
                <option value="all">Tüm Durumlar</option>
                <option value="accepted">Kabul Edildi</option>
                <option value="rejected">Reddedildi</option>
                <option value="completed">Tamamlandı</option>
              </select>
              <select
                value={historySort}
                onChange={(e) => setHistorySort(e.target.value as typeof historySort)}
                className="bg-surface border border-border-color rounded-lg text-xs px-3 py-2 text-on-surface focus:outline-none focus:border-accent-mint"
              >
                <option value="date_desc">Tarih (Yeni → Eski)</option>
                <option value="date_asc">Tarih (Eski → Yeni)</option>
                <option value="score_desc">Skor (Yüksek → Düşük)</option>
                <option value="score_asc">Skor (Düşük → Yüksek)</option>
              </select>
            </div>
            <button
              onClick={handleExportCsv}
              disabled={historyRows.length === 0}
              className="btn-secondary px-4 py-2 rounded-lg text-xs font-bold flex items-center gap-1.5 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <span className="material-symbols-outlined text-[16px]">download</span>
              CSV Dışa Aktar
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="text-[10px] font-bold text-on-surface-variant uppercase bg-surface-light/60">
                  <th className="px-5 py-3">Tesis</th>
                  <th className="px-5 py-3">Tarih</th>
                  <th className="px-5 py-3">Skor</th>
                  <th className="px-5 py-3">CO2 Tasarrufu</th>
                  <th className="px-5 py-3">Tasarruf</th>
                  <th className="px-5 py-3 text-right">Durum</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-color text-sm text-on-surface">
                {historyRows.map((m) => (
                  <tr key={m.id}>
                    <td className="px-5 py-3 font-semibold">{m.name}</td>
                    <td className="px-5 py-3 text-on-surface-variant text-xs">{m.date}</td>
                    <td className="px-5 py-3 text-accent-mint font-bold">{m.score}%</td>
                    <td className="px-5 py-3 text-xs text-teal-700">{m.co2} kg</td>
                    <td className="px-5 py-3 text-xs text-accent-mint">€{m.savings.toLocaleString()}</td>
                    <td className="px-5 py-3 text-right">
                      <span
                        className={`status-label ${
                          m.status === "accepted" ? "text-accent-mint" : m.status === "rejected" ? "text-rose-600" : "text-sky-700"
                        }`}
                      >
                        {statusLabel(m.status)}
                      </span>
                    </td>
                  </tr>
                ))}
                {historyRows.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-5 py-8 text-center text-xs text-on-surface-variant">
                      Geçmişte eşleştirme kaydı yok.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className={styles.container}>
          {/* Left Column: Candidates */}
          <div className="lg:col-span-5 flex flex-col gap-4">
        <div className="glass-panel p-5 rounded-2xl">
          <h3 className="font-title font-bold text-on-surface text-base">Eşleştirme Adayları</h3>
          <p className="text-xs text-on-surface-variant mt-1">
            Çıktılarınız için pgvector ile eşleşen tesisler listelenmektedir (Kosinüs Benzerliği &gt;= 0.60)
          </p>
        </div>
        <div className={styles.candidatesList}>
          {matches.map((m) => (
            <div
              key={m.id}
              onClick={() => {
                setSelectedMatchId(m.id);
                if (typeof window !== "undefined" && window.innerWidth < 1024) {
                  setTimeout(() => {
                    document.getElementById("matchmaker-detail")?.scrollIntoView({ behavior: "smooth" });
                  }, 100);
                }
              }}
              className={`glass-panel p-5 rounded-2xl flex flex-col gap-3 cursor-pointer transition-all duration-300 ${
                selectedMatchId === m.id ? "border-accent-mint/60 bg-accent-mint/[0.04]" : ""
              }`}
            >
              <div className="flex justify-between items-start">
                <div>
                  <h4 className="font-title font-bold text-on-surface text-sm">{m.name}</h4>
                  <span className="text-[10px] text-on-surface-variant block mt-1">Lojistik Mesafe: {m.distanceKm !== null ? `${m.distanceKm} km` : "Bilinmiyor"}</span>
                </div>
                <span className="text-base font-extrabold font-title text-accent-mint">{m.score}% Uyum</span>
              </div>
              <div className="flex justify-between items-center border-t border-border-color pt-2 text-[10px]">
                <span className="text-teal-700 flex items-center gap-1">
                  <span className="material-symbols-outlined text-[12px]">eco</span>
                  {m.co2} kg CO2 Tasarrufu
                </span>
                <span
                  className={`status-label ${
                    m.status === "accepted"
                      ? "text-accent-mint"
                      : m.status === "rejected"
                      ? "text-rose-600"
                      : m.status === "completed"
                      ? "text-sky-700"
                      : "text-amber-700"
                  }`}
                >
                  {statusLabel(m.status)}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Right Column: Selected Detail */}
      <div id="matchmaker-detail" className="lg:col-span-7 flex flex-col gap-6 scroll-mt-24">
        <div className="glass-panel p-6 rounded-2xl flex flex-col gap-6">
          <div className="flex justify-between items-start border-b border-border-color pb-4">
            <div>
              <h3 className="font-title font-bold text-lg text-on-surface">{selectedMatch.name}</h3>
              <p className="text-xs text-on-surface-variant mt-0.5">Karşı taraf sektörü: {selectedMatch.sectorLabel}</p>
            </div>
            <div className="flex flex-col items-end">
              <span className="text-2xl font-black font-title text-accent-mint">{selectedMatch.score} / 100</span>
              <span className="text-[10px] font-bold text-on-surface-variant">ECOMATCH MATCH SCORE</span>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="flex flex-col gap-3">
              <h4 className="text-xs font-bold text-on-surface uppercase tracking-wider">5 Faktörlü Uyum Kırılımı</h4>
              <div className={styles.radarCanvasWrapper}>
                <canvas ref={radarCanvasRef} className={styles.radarCanvas}></canvas>
              </div>
            </div>

            <div className="flex flex-col gap-3">
              <h4 className="text-xs font-bold text-on-surface uppercase tracking-wider">Lojistik Rota Simülasyonu</h4>
              <div className={styles.routeMapWrapper}>
                <RouteMap
                  origin={originLocation}
                  destination={selectedMatch.destinationLocation}
                  destinationLabel={selectedMatch.name}
                  distanceKm={selectedMatch.distanceKm}
                />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-4 rounded-xl bg-surface-light/60 border border-border-color">
              <span className="text-[10px] text-on-surface-variant font-bold uppercase tracking-wider block">
                Lojistik Mesafe
              </span>
              <span className="text-lg font-bold text-on-surface mt-1 block">{selectedMatch.distanceKm !== null ? `${selectedMatch.distanceKm} km` : "Bilinmiyor"}</span>
            </div>
            <div className="p-4 rounded-xl bg-teal-600/5 border border-teal-600/15">
              <span className="text-[10px] text-teal-700 font-bold uppercase tracking-wider block">
                CO2 Azaltımı (Net)
              </span>
              <span className="text-lg font-bold text-teal-700 mt-1 block">{selectedMatch.co2} kg CO2</span>
            </div>
            <div className="p-4 rounded-xl bg-emerald-500/5 border border-emerald-500/10">
              <span className="text-[10px] text-accent-mint font-bold uppercase tracking-wider block">
                CBAM Karbon Tasarrufu
              </span>
              <span className="text-lg font-bold text-accent-mint mt-1 block">
                €{selectedMatch.savings.toLocaleString()}
              </span>
            </div>
          </div>

          {/* Actions -- yalnızca 'pending'/'accepted' (henüz terminal olmayan) eşleşmelerde
              gösterilir. Terminal bir eşleşmede backend zaten 409 INVALID_STATE_TRANSITION
              döner (matches.service.ts#TERMINAL_STATUSES); bunu tıklanabilir bırakmak yerine
              durumu açıkça anlatan bir bilgi kutusu (+ expired'da "Yeniden Talep Et") gösteriyoruz.
              'accepted' durumu, KİM'in zaten kabul ettiğine göre ikiye ayrılıyor: viewerAccepted
              true ise görüntüleyen taraf kendi payını çoktan yaptı (backend'in accept()'teki
              alreadyAcceptedBySelf koruması "Kabul Et"i tekrar tıklamayı 409 ile reddeder) --
              o yüzden bu durumda buton yerine "karşı taraf bekleniyor" mesajı gösteriliyor.
              Reddet ise hâlâ geçerli bir işlem (backend'de 'accepted' terminal değil), o yüzden
              bu dalda da kalıyor. */}
          {TERMINAL_STATUSES.has(selectedMatch.status) ? null : selectedMatch.status === "accepted" &&
            selectedMatch.viewerAccepted ? (
            <div className="border-t border-border-color pt-6 flex items-center justify-between gap-4">
              <p className="text-xs text-on-surface-variant flex items-center gap-2">
                <span className="material-symbols-outlined text-[16px] text-amber-600">hourglass_top</span>
                Bu eşleşmeyi kabul ettiniz, karşı tarafın onayı bekleniyor.
              </p>
              <button
                onClick={() => setRejectPanelOpen(true)}
                className="px-6 py-3.5 rounded-xl font-bold text-sm text-rose-600 bg-rose-500/5 border border-rose-500/15 hover:bg-rose-500/10 transition-colors cursor-pointer shrink-0"
              >
                Reddet
              </button>
            </div>
          ) : (
            <div className="flex gap-4 border-t border-border-color pt-6">
              <button
                onClick={onAcceptMatch}
                className="flex-grow btn-primary py-3.5 rounded-xl font-bold text-sm flex items-center justify-center gap-2 cursor-pointer"
              >
                <span className="material-symbols-outlined">handshake</span>
                Eşleşmeyi Kabul Et ve Onayla
              </button>
              <button
                onClick={() => setRejectPanelOpen(true)}
                className="px-6 py-3.5 rounded-xl font-bold text-sm text-rose-600 bg-rose-500/5 border border-rose-500/15 hover:bg-rose-500/10 transition-colors cursor-pointer"
              >
                Reddet
              </button>
            </div>
          )}
          {TERMINAL_STATUSES.has(selectedMatch.status) && (
            <div className="border-t border-border-color pt-6 flex items-center justify-between gap-4">
              <p className="text-xs text-on-surface-variant">
                {selectedMatch.status === "completed" &&
                  "Bu eşleşme tamamlandı. İletişim bilgileri kabul anında gösterilen onay penceresinde açıldı."}
                {selectedMatch.status === "rejected" && "Bu eşleşme reddedildi ve artık işlem kabul etmiyor."}
                {selectedMatch.status === "expired" &&
                  "Bu eşleşmenin 30 günlük onay süresi doldu. Aynı verilerle yeni bir eşleşme talep edebilirsiniz."}
              </p>
              {selectedMatch.status === "expired" && (
                <button
                  onClick={onRetryMatch}
                  className="btn-secondary px-5 py-2.5 rounded-xl text-xs font-bold flex items-center gap-2 cursor-pointer shrink-0"
                >
                  <span className="material-symbols-outlined text-[16px]">restart_alt</span>
                  Yeniden Talep Et
                </button>
              )}
            </div>
          )}

          {/* Inline Rejection Panel */}
          {!TERMINAL_STATUSES.has(selectedMatch.status) && rejectPanelOpen && (
            <div className="border-t border-border-color pt-4 flex flex-col gap-3">
              <label className="text-xs font-bold text-on-surface uppercase tracking-wider">Red Gerekçesi Belirtiniz</label>
              <textarea
                value={rejectReasonText}
                onChange={(e) => setRejectReasonText(e.target.value)}
                rows={2}
                className="w-full bg-surface border border-border-color rounded-xl text-sm p-3 text-on-surface focus:border-rose-500 focus:ring-rose-500 focus:outline-none"
                placeholder="Örn: Nakliye fiyatlandırması çok yüksek veya malzeme kalitesi spektlerimizi karşılamıyor..."
              />
              <div className="flex gap-3 justify-end">
                <button
                  onClick={() => setRejectPanelOpen(false)}
                  className="px-4 py-2 rounded-lg text-xs font-semibold text-on-surface-variant hover:text-on-surface cursor-pointer"
                >
                  İptal
                </button>
                <button
                  onClick={handleConfirmRejectMatch}
                  className="px-4 py-2 rounded-lg text-xs font-semibold text-rose-600 bg-rose-500/10 border border-rose-500/20 cursor-pointer"
                >
                  Reddetmeyi Onayla
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
        </div>
      )}
    </div>
  );
}
