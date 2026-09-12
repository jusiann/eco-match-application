"use client";

import React, { useEffect, useState } from "react";
import styles from "./Modal.module.css";
import { MatchCandidate } from "../../types";
import { ApiError, MatchContact, matchesApi } from "../../lib/api";
import { getAccessToken } from "../../lib/session";

interface SuccessModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedMatch: MatchCandidate | null;
}

export default function SuccessModal({ isOpen, onClose, selectedMatch }: SuccessModalProps) {
  // Sonuç, ait olduğu matchId ile birlikte tutuluyor: böylece başka bir eşleşmeye
  // geçildiğinde effect içinde senkron bir "temizle" setState'i gerekmiyor (React
  // Compiler kuralı), eski sonuç render sırasında kendiliğinden geçersiz sayılıyor.
  const [result, setResult] = useState<{ matchId: string; data?: MatchContact; error?: string } | null>(null);

  const matchId = selectedMatch?.id ?? null;
  // Gizlilik kuralı (CLAUDE.md / matches.service.ts): karşı tarafın iletişim bilgileri
  // yalnızca KARŞILIKLI kabul sonrası (status === 'completed') açılıyor. Tek taraflı
  // kabulde eşleşme 'accepted' kalır ve GET /matches/:id/contact 403 döner.
  const unlocked = selectedMatch?.status === "completed";

  const current = result && result.matchId === matchId ? result : null;
  const contact = current?.data ?? null;
  const contactError = current?.error ?? "";
  const loading = unlocked && current === null;

  useEffect(() => {
    if (!isOpen || !matchId || !unlocked) return;

    const token = getAccessToken();
    if (!token) return;

    let cancelled = false;

    matchesApi
      .contact(token, matchId)
      .then((data) => {
        if (!cancelled) setResult({ matchId, data });
      })
      .catch((err) => {
        if (!cancelled) {
          setResult({ matchId, error: err instanceof ApiError ? err.message : "İletişim bilgileri alınamadı." });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [isOpen, matchId, unlocked]);

  if (!isOpen || !selectedMatch) return null;

  return (
    <div className={styles.backdrop}>
      <div className={`${styles.modalContent} glass-panel flex items-center text-center`}>
        <div className="w-16 h-16 rounded-full bg-accent-mint/10 border-2 border-accent-mint flex items-center justify-center animate-bounce">
          <span className="material-symbols-outlined text-accent-mint text-4xl">handshake</span>
        </div>
        <div>
          <h3 className="font-title font-bold text-xl text-on-surface">
            {unlocked ? "Eşleştirme Başarıyla Tamamlandı!" : "Kabulünüz Kaydedildi"}
          </h3>
          <p className="text-sm text-on-surface-variant mt-2">
            {unlocked
              ? "Endüstriyel döngüsel simbiyoz akışı iki tarafça da kabul edildi. İletişim bilgileri açılmıştır."
              : "Eşleşme karşı tarafın onayını bekliyor. İletişim bilgileri, karşı taraf da kabul ettiğinde açılacak."}
          </p>
        </div>

        <div className="w-full bg-surface-light/60 p-5 rounded-2xl text-left flex flex-col gap-3 text-xs border border-border-color">
          <h4 className="font-bold text-on-surface uppercase tracking-wider flex items-center gap-1.5">
            <span className="material-symbols-outlined text-teal-700 text-sm">
              {unlocked ? "contact_phone" : "lock"}
            </span>
            Karşı Tesis İletişim Detayları
          </h4>

          {!unlocked && (
            <p className="text-on-surface-variant">
              Bu bölüm eşleşme durumu <strong>tamamlandı</strong> olduğunda dolar. Şu anki durum:{" "}
              <strong>{selectedMatch.status}</strong>.
            </p>
          )}

          {unlocked && loading && <p className="text-on-surface-variant">İletişim bilgileri getiriliyor…</p>}

          {unlocked && contactError && (
            <p className="text-rose-700 bg-rose-500/10 border border-rose-500/20 rounded-xl px-3 py-2">{contactError}</p>
          )}

          {unlocked && contact && (
            <>
              <p className="text-on-surface">
                <strong className="text-on-surface-variant">Firma Adı:</strong> <span>{contact.companyName}</span>
              </p>
              <p className="text-on-surface">
                <strong className="text-on-surface-variant">Temsilci:</strong> {contact.contactName ?? "—"}
              </p>
              <p className="text-on-surface">
                <strong className="text-on-surface-variant">Telefon:</strong>{" "}
                {contact.phone ? <a href={`tel:${contact.phone}`}>{contact.phone}</a> : "—"}
              </p>
              <p className="text-on-surface">
                <strong className="text-on-surface-variant">E-Posta:</strong>{" "}
                {contact.email ? <a href={`mailto:${contact.email}`}>{contact.email}</a> : "—"}
              </p>
            </>
          )}
        </div>

        <button onClick={onClose} className="btn-primary w-full py-3.5 rounded-xl font-bold text-sm cursor-pointer">
          Anladım, Kapat
        </button>
      </div>
    </div>
  );
}
