"use client";

import React from "react";
import styles from "./Modal.module.css";
import { OutputItem } from "../../types";
import { FacilityMe } from "../../lib/api";

interface DppModalProps {
  isOpen: boolean;
  onClose: () => void;
  output: OutputItem | null;
  // Bu modal her zaman OTURUM SAHİBİNİN kendi çıktısını gösterir -- "Menşe" (üretici tesis)
  // bu yüzden facility.name'den geliyor, uydurma bir OSB adından değil.
  facility: FacilityMe | null;
}

export default function DppModal({ isOpen, onClose, output, facility }: DppModalProps) {
  if (!isOpen || !output) return null;

  const hasRealPassport = Boolean(output.qrCode && output.pdfUrl);

  // --- SVG QR CODE GENERATION (yalnızca gerçek QR bilinmeyen geçmiş kayıtlar için yer tutucu) ---
  const drawMockSvgQrCode = () => {
    return (
      <svg viewBox="0 0 100 100" className="w-full h-full text-on-surface" fill="currentColor">
        <rect x="5" y="5" width="25" height="25" />
        <rect x="10" y="10" width="15" height="15" fill="white" />
        <rect x="15" y="15" width="5" height="5" />

        <rect x="70" y="5" width="25" height="25" />
        <rect x="75" y="10" width="15" height="15" fill="white" />
        <rect x="80" y="15" width="5" height="5" />

        <rect x="5" y="70" width="25" height="25" />
        <rect x="10" y="75" width="15" height="15" fill="white" />
        <rect x="15" y="80" width="5" height="5" />

        <rect x="75" y="75" width="10" height="10" />
        <rect x="78" y="78" width="4" height="4" fill="white" />

        <rect x="35" y="12" width="4" height="4" />
        <rect x="42" y="25" width="4" height="4" />
        <rect x="55" y="50" width="4" height="4" />
        <rect x="62" y="70" width="4" height="4" />
        <rect x="38" y="82" width="4" height="4" />
        <rect x="45" y="44" width="4" height="4" />
        <rect x="52" y="15" width="4" height="4" />
        <rect x="58" y="32" width="4" height="4" />
        <rect x="66" y="88" width="4" height="4" />
        <rect x="12" y="48" width="4" height="4" />
        <rect x="25" y="55" width="4" height="4" />
        <rect x="30" y="38" width="4" height="4" />
        <rect x="22" y="42" width="4" height="4" />
        <rect x="48" y="68" width="4" height="4" />
        <rect x="72" y="45" width="4" height="4" />
        <rect x="88" y="38" width="4" height="4" />
        <rect x="84" y="52" width="4" height="4" />
        <rect x="92" y="65" width="4" height="4" />
      </svg>
    );
  };

  return (
    <div className={styles.backdrop}>
      <div className={`${styles.modalContent} ${styles.modalContentWide} glass-panel`}>
        <div className="flex justify-between items-center border-b border-border-color pb-4">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-accent-mint">qr_code_2</span>
            <h3 className="font-title font-bold text-lg text-on-surface">Dijital Ürün Pasaportu (DPP)</h3>
          </div>
          <button onClick={onClose} className="text-on-surface-variant hover:text-on-surface cursor-pointer">
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-center">
          <div className="md:col-span-8 flex flex-col gap-4">
            <div>
              <h4 className="font-title text-base font-bold text-on-surface">{output.name}</h4>
              {/* ESPR uyum durumu backend'de pasaport bazında hesaplanıyor
                  (dpp.service.ts#checkCompliance) ama ne createOutput'un yanıtı ne de
                  GET /materials/outputs bunu döndürüyor -- burada bilmediğimiz bir şeyi
                  hep "uyumlu" göstermek yerine rozeti kaldırdık. Tam DPP verisi (ve
                  gerçek uyum durumu) Raporlar ekranındaki "Pasaport Verisi (JSON)"
                  indirmesinde mevcut. */}
            </div>
            <div className="grid grid-cols-2 gap-4 text-xs">
              <div className="p-3 bg-surface-light/60 rounded-xl border border-border-color">
                <span className="text-[10px] text-on-surface-variant uppercase block">Pasaport ID</span>
                <span className="font-mono text-on-surface mt-1 block">
                  {output.dppId ?? "Bu oturumda oluşturulmamış kayıtlar için pasaport ID listelenmiyor"}
                </span>
              </div>
              <div className="p-3 bg-surface-light/60 rounded-xl border border-border-color">
                <span className="text-[10px] text-on-surface-variant uppercase block">Bileşim</span>
                <span className="text-on-surface mt-1 block">{output.composition}</span>
              </div>
              <div className="p-3 bg-surface-light/60 rounded-xl border border-border-color col-span-2">
                <span className="text-[10px] text-on-surface-variant uppercase block">Menşe</span>
                <span className="text-on-surface mt-1 block">{facility?.name ?? "—"}, Türkiye</span>
              </div>
            </div>
          </div>

          <div className="md:col-span-4 flex flex-col items-center justify-center p-4 bg-white rounded-2xl aspect-square w-full max-w-[180px] mx-auto border border-border-color">
            {output.qrCode ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={output.qrCode} alt="Pasaport QR kodu" className="w-full h-full object-contain" />
            ) : (
              <div className="w-full h-full text-on-surface">{drawMockSvgQrCode()}</div>
            )}
          </div>
        </div>

        {!hasRealPassport && (
          <p className="text-[11px] text-amber-700 bg-amber-500/10 border border-amber-500/20 rounded-xl px-3 py-2">
            Bu kayıt mevcut oturumda oluşturulmadığı için gerçek QR/PDF bağlantısı bilinmiyor (backend `GET
            /materials/outputs` pasaport ilişkisini döndürmüyor) — yukarıdaki QR yer tutucudur.
          </p>
        )}

        <div className="flex gap-4 border-t border-border-color pt-6">
          {output.pdfUrl ? (
            <a
              href={output.pdfUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-primary flex-grow py-3 rounded-xl text-xs font-bold flex items-center justify-center gap-2 cursor-pointer"
            >
              <span className="material-symbols-outlined text-[18px]">download_for_offline</span>
              Pasaport Raporunu İndir (PDF)
            </a>
          ) : (
            <button
              disabled
              className="flex-grow py-3 rounded-xl text-xs font-bold flex items-center justify-center gap-2 opacity-40 cursor-not-allowed bg-surface-light border border-border-color text-on-surface-variant"
            >
              <span className="material-symbols-outlined text-[18px]">download_for_offline</span>
              PDF Bağlantısı Bilinmiyor
            </button>
          )}
          <button onClick={onClose} className="btn-secondary px-6 py-3 rounded-xl text-xs font-bold cursor-pointer">
            Kapat
          </button>
        </div>
      </div>
    </div>
  );
}
