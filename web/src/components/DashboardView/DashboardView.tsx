"use client";

import React, { useEffect, useRef, useState } from "react";
import styles from "./DashboardView.module.css";
import { MatchCandidate, OutputItem } from "../../types";
import { FacilityMe, FacilityDocumentRow } from "../../lib/api";

interface DashboardViewProps {
  outputsCount: number;
  inputsCount: number;
  outputs: OutputItem[];
  // GET /v1/matches -- "AI Eşleşmesi" ve "Önlenen CO2" kartları buradan türetiliyor.
  matches: MatchCandidate[];
  facility: FacilityMe | null;
  facilityDocuments: FacilityDocumentRow[];
  onUploadDocument: (file: File, documentType: "tax_certificate" | "operating_permit") => void;
}

// Reddedilen/süresi dolan eşleşmeler "aktif AI eşleşmesi" sayılmıyor.
const ACTIVE_MATCH_STATUSES = new Set(["pending", "accepted", "completed"]);

const formatKg = (kg: number) => {
  if (kg >= 1000) return `${(kg / 1000).toLocaleString("tr-TR", { maximumFractionDigits: 1 })} t`;
  return `${kg.toLocaleString("tr-TR", { maximumFractionDigits: 0 })} kg`;
};

const DOCUMENT_TYPE_LABEL: Record<string, string> = {
  tax_certificate: "Vergi Levhası",
  operating_permit: "Faaliyet İzni",
};

export default function DashboardView({
  outputsCount,
  inputsCount,
  outputs,
  matches,
  facility,
  facilityDocuments,
  onUploadDocument,
}: DashboardViewProps) {
  const activeMatches = matches.filter((m) => ACTIVE_MATCH_STATUSES.has(m.status));
  const co2SavedKg = activeMatches.reduce((sum, m) => sum + (Number.isFinite(m.co2) ? m.co2 : 0), 0);
  const sensorCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const [uploadType, setUploadType] = useState<"tax_certificate" | "operating_permit">("tax_certificate");
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // GET /v1/materials/outputs'tan gelen GERÇEK kayıtların, tarihe göre kümülatif toplamı --
  // eskiden burada backend'e hiç bağlı olmayan sabit bir örnek dizi ([200,350,...]) vardı
  // ve "GÜNCEL SENSÖR VERİSİ" diye etiketlenmişti; ne IoT modülünden (POST /v1/iot/sensor-data
  // ile veri girişi var ama listeleme ucu yok) ne de başka bir kaynaktan geliyordu. Gerçek
  // bir "sensör" iddiası taşımayan, kendi kayıtlarından türeyen dürüst bir grafiğe çevrildi.
  const cumulativeOutputSeries = (() => {
    const byDate = new Map<string, number>();
    for (const o of outputs) {
      const key = o.date || "Bilinmiyor";
      byDate.set(key, (byDate.get(key) ?? 0) + (Number.isFinite(o.quantity) ? o.quantity : 0));
    }
    const sortedDates = [...byDate.keys()].sort();
    return sortedDates.reduce<{ date: string; total: number }[]>((acc, date) => {
      const prevTotal = acc.length > 0 ? acc[acc.length - 1].total : 0;
      acc.push({ date, total: prevTotal + (byDate.get(date) ?? 0) });
      return acc;
    }, []);
  })();

  // --- KAYITLI ÇIKTI BİRİKİMİ GRAFİĞİ (gerçek veri) ---
  const drawDashboardSensorChart = () => {
    const canvas = sensorCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    if (cumulativeOutputSeries.length < 2) {
      // Tek nokta veya hiç veri yokken bir çizgi grafiği anlamsız -- boş bırak,
      // JSX tarafındaki empty-state metni gösterilir.
      const rect = canvas.getBoundingClientRect();
      canvas.width = rect.width * 2;
      canvas.height = rect.height * 2;
      ctx.scale(2, 2);
      ctx.clearRect(0, 0, rect.width, rect.height);
      return;
    }

    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * 2;
    canvas.height = rect.height * 2;
    ctx.scale(2, 2);

    const w = rect.width;
    const h = rect.height;
    const padding = 25;

    const data = cumulativeOutputSeries.map((p) => p.total);
    const maxVal = Math.max(...data, 1) * 1.1;
    const points = data.map((val, index) => {
      const x = padding + (index / (data.length - 1)) * (w - 2 * padding);
      const y = h - padding - (val / maxVal) * (h - 2 * padding);
      return { x, y };
    });

    ctx.clearRect(0, 0, w, h);

    // Grid lines
    ctx.strokeStyle = "rgba(29,36,32,0.06)";
    ctx.lineWidth = 1;
    for (let i = 0; i < 5; i++) {
      const gridY = padding + (i / 4) * (h - 2 * padding);
      ctx.beginPath();
      ctx.moveTo(padding, gridY);
      ctx.lineTo(w - padding, gridY);
      ctx.stroke();
    }

    // Fill Gradient below curve
    const gradient = ctx.createLinearGradient(0, padding, 0, h - padding);
    gradient.addColorStop(0, "rgba(30, 95, 70, 0.18)");
    gradient.addColorStop(1, "rgba(30, 95, 70, 0)");

    ctx.beginPath();
    ctx.moveTo(points[0].x, h - padding);
    for (let i = 0; i < points.length - 1; i++) {
      const cpX = (points[i].x + points[i + 1].x) / 2;
      ctx.quadraticCurveTo(points[i].x, points[i].y, cpX, (points[i].y + points[i + 1].y) / 2);
    }
    ctx.lineTo(points[points.length - 1].x, points[points.length - 1].y);
    ctx.lineTo(points[points.length - 1].x, h - padding);
    ctx.closePath();
    ctx.fillStyle = gradient;
    ctx.fill();

    // Draw Line
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (let i = 0; i < points.length - 1; i++) {
      const cpX = (points[i].x + points[i + 1].x) / 2;
      ctx.quadraticCurveTo(points[i].x, points[i].y, cpX, (points[i].y + points[i + 1].y) / 2);
    }
    ctx.lineTo(points[points.length - 1].x, points[points.length - 1].y);
    ctx.strokeStyle = "#1e5f46";
    ctx.lineWidth = 2.5;
    ctx.stroke();

    // Dots and labels
    ctx.fillStyle = "#fffdf8";
    ctx.font = "9px Inter, sans-serif";
    ctx.textAlign = "center";
    points.forEach((pt, i) => {
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, 4, 0, 2 * Math.PI);
      ctx.fill();
      ctx.strokeStyle = "#1e5f46";
      ctx.lineWidth = 1.5;
      ctx.stroke();

      ctx.fillStyle = "#666f63";
      ctx.fillText(formatKg(data[i]), pt.x, pt.y - 10);
    });
  };

  useEffect(() => {
    drawDashboardSensorChart();

    // Add window resize listener to redraw the chart for responsiveness
    const handleResize = () => drawDashboardSensorChart();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
    // cumulativeOutputSeries outputs'tan türediği için outputs değişince yeniden hesaplanıyor
    // -- effect bağımlılığı olarak outputs'un kendisini kullanmak yeterli.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [outputs]);

  return (
    <div className={styles.container}>
      {/* Tesis doğrulama durumu (docs/04 Facilities) -- verified=false ise materials POST
          403 FACILITY_NOT_VERIFIED alır, bu yüzden burada belge yükleme akışı sağlanıyor. */}
      {facility && !facility.verified && (
        <div className="glass-panel p-5 rounded-2xl border border-amber-500/30 bg-amber-500/5 flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-amber-700">pending_actions</span>
            <h3 className="font-title font-bold text-on-surface text-sm">Tesisiniz henüz doğrulanmadı</h3>
          </div>
          <p className="text-xs text-on-surface-variant">
            Doğrulanana kadar çıktı/girdi kaydı oluşturamazsınız. Vergi levhası veya faaliyet izni belgesi yükleyin,
            admin incelemesi sonrası tesisiniz aktifleşir.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={uploadType}
              onChange={(e) => setUploadType(e.target.value as typeof uploadType)}
              className="bg-surface border border-border-color rounded-xl px-3 py-2 text-xs text-on-surface"
            >
              <option value="tax_certificate">Vergi Levhası</option>
              <option value="operating_permit">Faaliyet İzni</option>
            </select>
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.jpg,.jpeg"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) onUploadDocument(file, uploadType);
                e.target.value = "";
              }}
              className="hidden"
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              className="btn-primary px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer"
            >
              <span className="material-symbols-outlined text-[16px]">upload_file</span>
              Belge Yükle (PDF/JPG, max 10 MB)
            </button>
          </div>
          {facilityDocuments.length > 0 && (
            <div className="flex flex-col gap-1.5 mt-1">
              {facilityDocuments.map((d) => (
                <div key={d.id} className="flex items-center justify-between text-[11px] bg-surface-light/60 rounded-lg px-3 py-2">
                  <span className="text-on-surface-variant">{DOCUMENT_TYPE_LABEL[d.documentType] ?? d.documentType}</span>
                  <span
                    className={`status-label ${
                      d.status === "APPROVED" ? "text-accent-mint" : d.status === "REJECTED" ? "text-rose-600" : "text-amber-700"
                    }`}
                  >
                    {d.status === "APPROVED" ? "Onaylandı" : d.status === "REJECTED" ? "Reddedildi" : "İnceleniyor"}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Bento Stats */}
      <div className={styles.statsGrid}>
        <div className="glass-panel p-4 md:p-6 rounded-2xl flex flex-col justify-between">
          <span className="text-[10px] md:text-xs font-semibold text-on-surface-variant uppercase tracking-wider">
            Aktif Ürün/Atık
          </span>
          <div className="flex items-baseline justify-between mt-4">
            <span className="text-xl md:text-3xl font-extrabold font-title text-on-surface">{outputsCount}</span>
            <span className="material-symbols-outlined text-accent-mint text-lg md:text-2xl">arrow_upward</span>
          </div>
        </div>
        <div className="glass-panel p-4 md:p-6 rounded-2xl flex flex-col justify-between">
          <span className="text-[10px] md:text-xs font-semibold text-on-surface-variant uppercase tracking-wider">
            Tanımlı Girdi
          </span>
          <div className="flex items-baseline justify-between mt-4">
            <span className="text-xl md:text-3xl font-extrabold font-title text-on-surface">{inputsCount}</span>
            <span className="material-symbols-outlined text-on-surface-variant text-lg md:text-2xl">horizontal_rule</span>
          </div>
        </div>
        <div className="glass-panel p-4 md:p-6 rounded-2xl flex flex-col justify-between">
          <span className="text-[10px] md:text-xs font-semibold text-on-surface-variant uppercase tracking-wider">
            AI Eşleşmesi
          </span>
          <div className="flex items-baseline justify-between mt-4">
            <span className="text-xl md:text-3xl font-extrabold font-title text-accent-mint">
              {activeMatches.length}
            </span>
            <span className="hidden sm:inline-block status-label text-accent-mint">AI Aktif</span>
          </div>
        </div>
        <div className="glass-panel p-4 md:p-6 rounded-2xl flex flex-col justify-between">
          <span className="text-[10px] md:text-xs font-semibold text-on-surface-variant uppercase tracking-wider">
            Önlenen CO2
          </span>
          <div className="flex items-baseline justify-between mt-4">
            <span className="text-xl md:text-3xl font-extrabold font-title text-teal-700">{formatKg(co2SavedKg)}</span>
            <span className="material-symbols-outlined text-teal-700 text-lg md:text-2xl">eco</span>
          </div>
        </div>
      </div>

      {/* Charts Grid */}
      <div className={styles.chartsGrid}>
        <div className="glass-panel p-6 rounded-2xl flex flex-col gap-4">
          <div className="flex justify-between items-center">
            <h3 className="font-title font-bold text-on-surface flex items-center gap-2">
              <span className="material-symbols-outlined text-accent-mint">show_chart</span>
              Kayıtlı Çıktı Birikimi
            </h3>
            <span className="text-[10px] font-semibold text-on-surface-variant">KENDİ KAYITLARINIZ</span>
          </div>
          {cumulativeOutputSeries.length >= 2 ? (
            <div className={styles.canvasWrapper}>
              <canvas ref={sensorCanvasRef} className={styles.canvas}></canvas>
            </div>
          ) : (
            <p className="text-xs text-on-surface-variant py-8 text-center">
              En az iki farklı tarihte çıktı kaydettiğinizde burada birikim grafiğiniz görünecek.
            </p>
          )}
        </div>

        {/* AI destekli talep/üretim öngörüsü henüz entegre edilmedi (K-24) -- sahte bir
            "tahmin" eğrisi göstermek yerine bunu dürüstçe belirtiyoruz. */}
        <div className="glass-panel p-6 rounded-2xl flex flex-col gap-4 opacity-70">
          <div className="flex justify-between items-center">
            <h3 className="font-title font-bold text-on-surface flex items-center gap-2">
              <span className="material-symbols-outlined text-on-surface-variant">online_prediction</span>
              Gelecek Dönem Atık Birikim Öngörüsü
            </h3>
            <span className="status-label text-on-surface-variant">YAKINDA</span>
          </div>
          <div className="flex flex-col items-center justify-center gap-2 py-10 text-center">
            <span className="material-symbols-outlined text-3xl text-on-surface-variant">hourglass_top</span>
            <p className="text-xs text-on-surface-variant max-w-xs">
              AI destekli öngörü servisi henüz entegre edilmedi. Bu bölüm, servis devreye alındığında
              gerçek tahminlerle dolacak.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
