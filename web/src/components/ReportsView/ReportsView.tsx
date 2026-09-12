"use client";

import React, { useEffect, useState } from "react";
import styles from "./ReportsView.module.css";
import { ApiError, reportsApi } from "../../lib/api";
import { getAccessToken } from "../../lib/session";
import { MatchCandidate, OutputItem } from "../../types";

interface ReportRow {
  id: string;
  matchId: string;
  reportType: "ENVIRONMENTAL" | "CBAM";
  createdAt: string;
}

const REPORT_TYPE_LABEL: Record<string, string> = {
  ENVIRONMENTAL: "Çevresel Etki",
  CBAM: "SKDM (CBAM)",
};

interface ReportsViewProps {
  matches: MatchCandidate[];
  outputs: OutputItem[];
}

// Backend kısıtı (reports.service.ts): CBAM raporu yalnızca TAMAMLANMIŞ eşleşmeler için
// üretilebilir, aksi hâlde 403 REPORT_NOT_AVAILABLE. Çevresel etki raporunun böyle bir
// durum kısıtı yok -- tesisin sahip olduğu her eşleşme için çalışır.
const CBAM_REQUIRED_STATUS = "completed";

// MatchmakerView#statusLabel ile aynı Türkçe karşılıklar.
const STATUS_LABEL: Record<string, string> = {
  pending: "Onay Bekliyor",
  accepted: "Kabul Edildi",
  completed: "Tamamlandı",
  rejected: "Reddedildi",
  expired: "Süresi Doldu",
};

type CardKey = "environmental" | "cbam" | "dpp";

const SELECT_CLASS =
  "bg-surface border border-border-color rounded-xl p-2.5 text-xs text-on-surface focus:outline-none focus:border-accent-mint w-full";

export default function ReportsView({ matches, outputs }: ReportsViewProps) {
  // GET /materials/outputs pasaport ilişkisini döndürmüyor -- pasaport id'si yalnızca
  // bu oturumda POST /materials/outputs ile oluşturulmuş kayıtlar için biliniyor
  // (bkz. types.ts OutputItem.dppId notu), bu yüzden liste onlarla sınırlı.
  const outputsWithPassport = outputs.filter((o) => o.dppId);

  // Seçim, "kullanıcının tıkladığı id" olarak tutulup render sırasında çözülüyor;
  // listeler asenkron dolduğu için bir useEffect ile senkronlamak gerekmesin diye
  // (React Compiler kuralı: effect gövdesinde senkron setState yok) geçersiz/boş
  // seçim doğrudan burada ilk kayda düşürülüyor.
  const [matchChoice, setMatchChoice] = useState("");
  const [outputChoice, setOutputChoice] = useState("");

  const [busy, setBusy] = useState<CardKey | null>(null);
  const [error, setError] = useState("");

  // GET /v1/reports -- daha önce üretilmiş raporların geçmişi (PDF depolanmıyor,
  // yalnızca tür/tarih/eşleşme kaydı; yeniden indirme aynı uca tekrar gidip PDF'i
  // anlık üretir, bkz. reportsApi.downloadPdf).
  const [history, setHistory] = useState<ReportRow[]>([]);
  // Token yoksa (pratikte olmaz, bu görünüm zaten oturum açılmadan render edilmiyor)
  // fetch hiç başlamaz ve yükleniyor durumu kalıcı kalır -- kabul edilebilir bir
  // edge case, senkron bir "vazgeç" setState'i eklemeye değmez (React Compiler kuralı).
  const [historyLoading, setHistoryLoading] = useState(true);

  useEffect(() => {
    const token = getAccessToken();
    if (!token) return;
    reportsApi
      .list(token)
      .then((res) => setHistory(res.data as unknown as ReportRow[]))
      .catch(() => {})
      .finally(() => setHistoryLoading(false));
  }, []);

  const selectedMatch = matches.find((m) => m.id === matchChoice) ?? matches[0] ?? null;
  const selectedMatchId = selectedMatch?.id ?? "";
  const selectedOutput = outputsWithPassport.find((o) => o.id === outputChoice) ?? outputsWithPassport[0] ?? null;
  const selectedOutputId = selectedOutput?.id ?? "";
  const cbamAvailable = selectedMatch?.status === CBAM_REQUIRED_STATUS;

  const runDownload = async (card: CardKey, action: (token: string) => Promise<unknown>) => {
    const token = getAccessToken();
    if (!token) {
      setError("Oturum bulunamadı, tekrar giriş yapın.");
      return;
    }
    setError("");
    setBusy(card);
    try {
      await action(token);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Rapor üretilemedi. Lütfen tekrar deneyin.");
    } finally {
      setBusy(null);
    }
  };

  const handleMatchPdf = (kind: "environmental" | "cbam") => {
    if (!selectedMatchId) return;
    runDownload(kind, (token) => reportsApi.downloadPdf(token, kind, selectedMatchId));
  };

  const [historyBusyId, setHistoryBusyId] = useState<string | null>(null);
  const handleHistoryRedownload = async (row: ReportRow) => {
    const token = getAccessToken();
    if (!token) return;
    setHistoryBusyId(row.id);
    try {
      await reportsApi.downloadPdf(token, row.reportType === "CBAM" ? "cbam" : "environmental", row.matchId);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Rapor indirilemedi.");
    } finally {
      setHistoryBusyId(null);
    }
  };

  // DPP pasaportunun kendi PDF'i /v1/materials/passport/:id/pdf?sig=... üzerinden
  // sunuluyor (public + HMAC imzalı) ve o imzalı tam URL zaten createOutput yanıtında
  // geldi -- bu yüzden düz bir bağlantı olarak açılabiliyor. reports/dpp/:passportId
  // ise aynı verinin JSON hâli, JwtAuthGuard arkasında.
  const handleDppJson = () => {
    if (!selectedOutput?.dppId) return;
    runDownload("dpp", async (token) => {
      const data = await reportsApi.dppReport(token, selectedOutput.dppId as string);
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `dpp-${selectedOutput.dppId}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 0);
    });
  };

  // totalScore zaten 0-100 arası bir tamsayı (matches.total_score INTEGER),
  // kesir değil -- MatchmakerView de "{m.score}%" olarak gösteriyor.
  const matchLabel = (m: MatchCandidate) => `${m.name} — %${m.score} uyum (${STATUS_LABEL[m.status] ?? m.status})`;

  return (
    <div className={styles.container}>
      <div className="glass-panel p-6 rounded-2xl flex flex-col gap-4">
        <div>
          <h3 className="font-title font-bold text-on-surface text-base">Raporlama ve Uyumluluk</h3>
          <p className="text-xs text-on-surface-variant mt-1">
            Eşleşmeleriniz sonucu sağlanan emisyon azaltımlarını içeren yasal belgeler ve AB uyumluluk dosyaları.
            Belgeler backend tarafından anlık üretilir.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-on-surface-variant">Eşleşme (çevresel / SKDM raporları için)</label>
            {matches.length > 0 ? (
              <select value={selectedMatchId} onChange={(e) => setMatchChoice(e.target.value)} className={SELECT_CLASS}>
                {matches.map((m) => (
                  <option key={m.id} value={m.id}>
                    {matchLabel(m)}
                  </option>
                ))}
              </select>
            ) : (
              <p className="text-xs text-on-surface-variant bg-surface-light/60 border border-border-color rounded-xl p-2.5">
                Henüz eşleşmeniz yok. Malzemeler sekmesinden bir çıktı ekleyip eşleştirme başlatın.
              </p>
            )}
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-on-surface-variant">Çıktı (dijital pasaport raporu için)</label>
            {outputsWithPassport.length > 0 ? (
              <select value={selectedOutputId} onChange={(e) => setOutputChoice(e.target.value)} className={SELECT_CLASS}>
                {outputsWithPassport.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name}
                  </option>
                ))}
              </select>
            ) : (
              <p className="text-xs text-on-surface-variant bg-surface-light/60 border border-border-color rounded-xl p-2.5">
                Pasaport kimliği yalnızca bu oturumda oluşturulan çıktılar için biliniyor (liste ucu pasaport
                ilişkisini döndürmüyor). Yeni bir çıktı ekleyin veya Malzemeler → DPP’yi kullanın.
              </p>
            )}
          </div>
        </div>

        {error && (
          <p className="text-xs text-rose-700 bg-rose-500/10 border border-rose-500/20 rounded-xl px-3 py-2">{error}</p>
        )}
      </div>

      <div className={styles.grid}>
        <div className="glass-panel p-6 rounded-2xl flex flex-col justify-between gap-6 relative overflow-hidden">
          <div className="flex flex-col gap-3">
            <span className="material-symbols-outlined text-teal-700 text-3xl">co2</span>
            <h4 className="font-title font-bold text-lg text-on-surface">Çevresel Etki Raporu</h4>
            <p className="text-xs text-on-surface-variant">
              ISO 14040 Life Cycle Assessment (LCA) uyumlu, net karbon azaltımlarını beyan eden detaylı emisyon raporu.
            </p>
          </div>
          <button
            onClick={() => handleMatchPdf("environmental")}
            disabled={!selectedMatchId || busy !== null}
            className="btn-secondary w-full py-3 rounded-xl text-xs font-bold flex items-center justify-center gap-2 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <span className="material-symbols-outlined text-[16px]">download</span>
            {busy === "environmental" ? "Hazırlanıyor…" : "PDF İndir"}
          </button>
        </div>

        <div className="glass-panel p-6 rounded-2xl flex flex-col justify-between gap-6 relative overflow-hidden">
          <div className="flex flex-col gap-3">
            <span className="material-symbols-outlined text-secondary text-3xl">gavel</span>
            <h4 className="font-title font-bold text-lg text-on-surface">SKDM (CBAM) Uyum Beyanı</h4>
            <p className="text-xs text-on-surface-variant">
              Sınırda Karbon Düzenleme Mekanizması kurallarına uygun, ithalat/ihracat vergi muafiyeti bildirim belgesi.
            </p>
            {selectedMatch && !cbamAvailable && (
              <p className="text-[11px] text-amber-700 bg-amber-500/10 border border-amber-500/20 rounded-xl px-3 py-2">
                SKDM beyanı yalnızca tamamlanmış (karşılıklı kabul edilmiş) eşleşmeler için üretilebilir. Seçili
                eşleşmenin durumu: {STATUS_LABEL[selectedMatch.status] ?? selectedMatch.status}.
              </p>
            )}
          </div>
          <button
            onClick={() => handleMatchPdf("cbam")}
            disabled={!selectedMatchId || !cbamAvailable || busy !== null}
            className="btn-secondary w-full py-3 rounded-xl text-xs font-bold flex items-center justify-center gap-2 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <span className="material-symbols-outlined text-[16px]">download</span>
            {busy === "cbam" ? "Hazırlanıyor…" : "PDF İndir"}
          </button>
        </div>

        <div className="glass-panel p-6 rounded-2xl flex flex-col justify-between gap-6 relative overflow-hidden">
          <div className="flex flex-col gap-3">
            <span className="material-symbols-outlined text-accent-mint text-3xl">qr_code</span>
            <h4 className="font-title font-bold text-lg text-on-surface">Dijital Pasaport Raporu</h4>
            <p className="text-xs text-on-surface-variant">
              AB ESPR yönetmeliklerine uygun, malzemenin kimyasal, fiziksel ve izlenebilirlik pasaport özeti.
            </p>
          </div>
          <div className="flex flex-col gap-2">
            {selectedOutput?.pdfUrl ? (
              <a
                href={selectedOutput.pdfUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="btn-secondary w-full py-3 rounded-xl text-xs font-bold flex items-center justify-center gap-2 cursor-pointer"
              >
                <span className="material-symbols-outlined text-[16px]">download</span>
                PDF İndir
              </a>
            ) : (
              <button
                disabled
                className="btn-secondary w-full py-3 rounded-xl text-xs font-bold flex items-center justify-center gap-2 opacity-40 cursor-not-allowed"
              >
                <span className="material-symbols-outlined text-[16px]">download</span>
                PDF İndir
              </button>
            )}
            <button
              onClick={handleDppJson}
              disabled={!selectedOutput || busy !== null}
              className="btn-secondary w-full py-2.5 rounded-xl text-[11px] font-bold flex items-center justify-center gap-2 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <span className="material-symbols-outlined text-[16px]">data_object</span>
              {busy === "dpp" ? "Hazırlanıyor…" : "Pasaport Verisi (JSON)"}
            </button>
          </div>
        </div>
      </div>

      <div className="glass-panel rounded-2xl overflow-hidden">
        <div className="p-6 border-b border-border-color">
          <h3 className="font-title font-bold text-on-surface text-base">Geçmiş Raporlar</h3>
          <p className="text-xs text-on-surface-variant mt-1">
            Daha önce üretilmiş raporların kaydı. PDF içeriği saklanmıyor — yeniden indirme aynı verilerle anlık üretir.
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="text-[10px] font-bold text-on-surface-variant uppercase border-b border-border-color">
                <th className="px-5 py-3">Tarih</th>
                <th className="px-5 py-3">Tür</th>
                <th className="px-5 py-3">Eşleşme</th>
                <th className="px-5 py-3 text-right">İşlem</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-color text-sm text-on-surface">
              {historyLoading && (
                <tr>
                  <td colSpan={4} className="px-5 py-6 text-center text-xs text-on-surface-variant">
                    Yükleniyor…
                  </td>
                </tr>
              )}
              {!historyLoading && history.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-5 py-6 text-center text-xs text-on-surface-variant">
                    Henüz üretilmiş rapor yok.
                  </td>
                </tr>
              )}
              {history.map((row) => (
                <tr key={row.id}>
                  <td className="px-5 py-3 text-xs text-on-surface-variant">
                    {row.createdAt ? new Date(row.createdAt).toLocaleString("tr-TR") : "—"}
                  </td>
                  <td className="px-5 py-3 status-label text-teal-700">{REPORT_TYPE_LABEL[row.reportType] ?? row.reportType}</td>
                  <td className="px-5 py-3 font-mono text-[11px] text-on-surface-variant">{row.matchId.slice(0, 8)}…</td>
                  <td className="px-5 py-3 text-right">
                    <button
                      onClick={() => handleHistoryRedownload(row)}
                      disabled={historyBusyId === row.id}
                      className="px-3 py-1.5 rounded-lg text-xs font-semibold text-teal-700 hover:bg-teal-600/10 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      {historyBusyId === row.id ? "Hazırlanıyor…" : "Yeniden İndir"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
