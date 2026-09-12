"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import styles from "./PassportView.module.css";
import { ApiError, materialsApi, PassportData } from "../../lib/api";

interface PassportViewProps {
  passportId: string;
  sig: string;
}

// ESPR uyum sorunlarının makine kodları (dpp.service.ts#checkCompliance).
const ISSUE_LABEL: Record<string, string> = {
  composition_sum_invalid: "Bileşim yüzdeleri toplamı %100 değil",
  material_class_missing: "Malzeme sınıfı belirlenmemiş",
  issuer_location_missing: "Üretici tesis konumu tanımlı değil",
  production_date_missing: "Üretim tarihi eksik",
};

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="p-3 bg-surface-light/60 rounded-xl border border-border-color">
      <span className="text-[10px] text-on-surface-variant uppercase block tracking-wider">{label}</span>
      <span className="text-on-surface mt-1 block text-sm break-words">{value}</span>
    </div>
  );
}

/**
 * DPP QR kodunun işaret ettiği HERKESE AÇIK pasaport sayfası.
 *
 * QR içeriği backend tarafından `${PUBLIC_BASE_URL}/dpp/<passportId>?sig=<hmac>`
 * olarak üretiliyor (dpp.service.ts#buildQrUrl). Kodu okutan kişinin oturumu
 * olmayabilir; doğrulama JWT ile değil, imza (sig) ile yapılıyor
 * (materials.controller.ts @Public() + assertValidSignature).
 */
export default function PassportView({ passportId, sig }: PassportViewProps) {
  // Sonuç, ait olduğu passportId ile birlikte tutuluyor -- effect gövdesinde
  // senkron setState gerekmesin diye (React Compiler kuralı).
  const [result, setResult] = useState<{ id: string; data?: PassportData; error?: string } | null>(null);

  // İmza olmadan istek atmanın anlamı yok (uç 403 döner) -- bu durum state'e
  // yazılmadan doğrudan render sırasında türetiliyor.
  const missingSig = !sig;
  const current = missingSig
    ? { id: passportId, error: "Bu bağlantıda imza (sig) parametresi yok. QR kodunu tekrar okutun." }
    : result && result.id === passportId
      ? result
      : null;
  const loading = !missingSig && current === null;

  useEffect(() => {
    if (!passportId || !sig) return;

    let cancelled = false;

    materialsApi
      .getPassportJson(passportId, sig)
      .then((data) => {
        if (!cancelled) setResult({ id: passportId, data });
      })
      .catch((err) => {
        if (!cancelled) {
          setResult({
            id: passportId,
            error: err instanceof ApiError ? err.message : "Pasaport bilgileri alınamadı.",
          });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [passportId, sig]);

  const data = current?.data;

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <header className="flex items-center gap-3 border-b border-border-color pb-4">
          <span className="material-symbols-outlined text-accent-mint text-3xl">qr_code_2</span>
          <div>
            <h1 className="font-title font-bold text-lg text-on-surface">Dijital Ürün Pasaportu</h1>
            <p className="text-xs text-on-surface-variant">EcoMatch · AB ESPR uyumlu malzeme kimliği</p>
          </div>
        </header>

        {loading && <p className="text-sm text-on-surface-variant py-8 text-center">Pasaport doğrulanıyor…</p>}

        {current?.error && (
          <div className="text-sm text-rose-700 bg-rose-500/10 border border-rose-500/20 rounded-xl px-4 py-3">
            {current.error}
          </div>
        )}

        {data && (
          <>
            <div className="flex flex-wrap items-center gap-4">
              <span className={`status-label ${data.compliance.espr_compliant ? "text-teal-700" : "text-amber-700"}`}>
                {data.compliance.espr_compliant ? "ESPR Uyumlu" : "ESPR Uyumu Eksik"}
              </span>
              <span className="status-label text-on-surface-variant">DPP v{data.dpp_version}</span>
              <span className="status-label text-on-surface-variant">İmza: {data.signature.algorithm}</span>
            </div>

            <section className={styles.grid}>
              <Field label="Pasaport ID" value={<span className="font-mono text-xs">{data.passport_id ?? "—"}</span>} />
              <Field label="Ürün Kodu" value={<span className="font-mono text-xs">{data.product_id}</span>} />
              <Field label="Malzeme" value={data.material.description} />
              <Field label="Sınıf" value={data.material.class ?? "Belirsiz"} />
              <Field
                label="Miktar"
                value={`${data.material.quantity_kg.toLocaleString("tr-TR")} kg`}
              />
              <Field label="Tehlikeli Madde" value={data.material.hazardous ? "Evet" : "Hayır"} />
              <Field
                label="Bileşim"
                value={
                  data.material.composition
                    ? Object.entries(data.material.composition)
                        .map(([k, v]) => `${k} %${v}`)
                        .join(", ")
                    : "—"
                }
              />
              <Field label="Üretim Tarihi" value={data.origin.production_date} />
            </section>

            <section>
              <h2 className="font-title font-bold text-sm text-on-surface mb-2">Üretici Tesis</h2>
              <div className={styles.grid}>
                <Field label="Tesis" value={data.issuer.facility_name} />
                <Field label="Vergi No" value={<span className="font-mono text-xs">{data.issuer.tax_id}</span>} />
                <Field label="OSB" value={data.issuer.location?.osb ?? "—"} />
                <Field
                  label="Konum"
                  value={
                    data.issuer.location
                      ? `${data.issuer.location.lat.toFixed(4)}, ${data.issuer.location.lng.toFixed(4)}`
                      : "—"
                  }
                />
              </div>
            </section>

            {data.compliance.issues.length > 0 && (
              <section>
                <h2 className="font-title font-bold text-sm text-on-surface mb-2">Uyum Notları</h2>
                <ul className="text-xs text-amber-700 bg-amber-500/10 border border-amber-500/20 rounded-xl px-4 py-3 flex flex-col gap-1">
                  {data.compliance.issues.map((issue) => (
                    <li key={issue}>• {ISSUE_LABEL[issue] ?? issue}</li>
                  ))}
                </ul>
              </section>
            )}

            <footer className="flex flex-wrap gap-3 border-t border-border-color pt-5">
              <a
                href={materialsApi.passportPdfUrl(passportId, sig)}
                target="_blank"
                rel="noopener noreferrer"
                className="btn-primary px-5 py-3 rounded-xl text-xs font-bold flex items-center justify-center gap-2"
              >
                <span className="material-symbols-outlined text-[18px]">download_for_offline</span>
                PDF olarak indir
              </a>
              <Link
                href="/"
                className="btn-secondary px-5 py-3 rounded-xl text-xs font-bold flex items-center justify-center gap-2"
              >
                EcoMatch’e git
              </Link>
            </footer>
          </>
        )}
      </div>
    </div>
  );
}
