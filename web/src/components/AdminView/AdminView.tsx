"use client";

import React, { useState } from "react";
import styles from "./AdminView.module.css";
import { PlatformUser, ReviewQueueItem, WeightsConfig, OSBVerification } from "../../types";
import { ApiKeyRow, CarbonFactorRow, MATERIAL_CLASSES } from "../../lib/api";

const FACTOR_TYPES = ["virgin", "secondary", "transport"];
const FACTOR_TYPE_LABEL: Record<string, string> = {
  virgin: "Ham (virgin)",
  secondary: "İkincil (geri dönüştürülmüş)",
  transport: "Taşıma",
};

export interface AuditLogRow {
  id: string;
  actorId: string | null;
  action: string;
  entity: string;
  entityId: string;
  before: unknown;
  after: unknown;
  ipAddress: string | null;
  createdAt: string;
}

interface AdminViewProps {
  users: PlatformUser[];
  onRemoveUser: (id: string) => void;
  reviewQueue: ReviewQueueItem[];
  onApproveReview: (id: string) => void;
  onRejectReview: (id: string) => void;
  weights: WeightsConfig;
  onSaveWeights: (weights: WeightsConfig) => Promise<void>;
  apiKeys: ApiKeyRow[];
  onCreateApiKey: (name: string, userId: string) => Promise<string | null>;
  onRevokeApiKey: (id: string) => void;
  verifications: OSBVerification[];
  onApproveVerification: (id: string) => void;
  onRejectVerification: (id: string, reason: string) => void;
  carbonFactors: CarbonFactorRow[];
  onCreateCarbonFactor: (dto: { materialClass: string; factorType: string; co2PerKg: number; source: string }) => Promise<void>;
  systemConfig: Record<string, unknown>;
  onUpdateConfig: (changes: Record<string, unknown>) => Promise<void>;
  auditLog: AuditLogRow[];
  auditLogPage: number;
  auditLogTotalPages: number;
  onLoadAuditLogPage: (page: number) => void;
}

const ROLE_LABEL: Record<string, string> = {
  USER: "Tesis Kullanıcısı",
  FACILITY_ADMIN: "Tesis Yöneticisi",
  EXPERT: "Uzman",
  ADMIN: "Sistem Admini",
  OSB_MANAGER: "OSB Yöneticisi",
};

export default function AdminView({
  users,
  onRemoveUser,
  reviewQueue,
  onApproveReview,
  onRejectReview,
  weights,
  onSaveWeights,
  apiKeys,
  onCreateApiKey,
  onRevokeApiKey,
  verifications,
  onApproveVerification,
  onRejectVerification,
  carbonFactors,
  onCreateCarbonFactor,
  systemConfig,
  onUpdateConfig,
  auditLog,
  auditLogPage,
  auditLogTotalPages,
  onLoadAuditLogPage,
}: AdminViewProps) {
  const [draftWeights, setDraftWeights] = useState<WeightsConfig>(weights);
  const [tab, setTab] = useState<
    "users" | "review" | "verifications" | "weights" | "apikeys" | "carbon" | "config" | "auditlog"
  >("users");
  const [newKeyName, setNewKeyName] = useState("");
  const [newKeyUserId, setNewKeyUserId] = useState("");
  const [revealedKey, setRevealedKey] = useState<string | null>(null);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");

  const [newFactorClass, setNewFactorClass] = useState(MATERIAL_CLASSES[0]);
  const [newFactorType, setNewFactorType] = useState(FACTOR_TYPES[0]);
  const [newFactorCo2, setNewFactorCo2] = useState("");
  const [newFactorSource, setNewFactorSource] = useState("");
  const [savingFactor, setSavingFactor] = useState(false);

  const [configDrafts, setConfigDrafts] = useState<Record<string, string>>({});
  const [savingConfigKey, setSavingConfigKey] = useState<string | null>(null);

  const configText = (key: string, value: unknown) => configDrafts[key] ?? JSON.stringify(value);

  const handleCreateFactor = async () => {
    const co2 = parseFloat(newFactorCo2);
    if (!newFactorSource.trim() || Number.isNaN(co2)) return;
    setSavingFactor(true);
    try {
      await onCreateCarbonFactor({
        materialClass: newFactorClass,
        factorType: newFactorType,
        co2PerKg: co2,
        source: newFactorSource.trim(),
      });
      setNewFactorCo2("");
      setNewFactorSource("");
    } finally {
      setSavingFactor(false);
    }
  };

  const handleSaveConfigKey = async (key: string) => {
    const raw = configDrafts[key];
    if (raw === undefined) return;
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return;
    }
    setSavingConfigKey(key);
    try {
      await onUpdateConfig({ [key]: parsed });
      setConfigDrafts((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
    } finally {
      setSavingConfigKey(null);
    }
  };

  const total = Object.values(draftWeights).reduce((sum, v) => sum + v, 0);
  const isValidTotal = Math.round(total) === 100;

  const handleWeightChange = (key: keyof WeightsConfig, value: number) => {
    setDraftWeights((prev) => ({ ...prev, [key]: value }));
  };

  const handleSave = async () => {
    if (!isValidTotal) return;
    await onSaveWeights(draftWeights);
  };

  const pendingReview = reviewQueue.filter((r) => r.status === "pending");
  const pendingVerifications = verifications.filter((v) => v.status === "pending");

  const handleRejectSubmit = (id: string) => {
    if (!rejectReason.trim()) return;
    onRejectVerification(id, rejectReason.trim());
    setRejectingId(null);
    setRejectReason("");
  };

  const handleCreateApiKey = async () => {
    if (!newKeyName.trim() || !newKeyUserId) return;
    const rawKey = await onCreateApiKey(newKeyName.trim(), newKeyUserId);
    if (rawKey) {
      setRevealedKey(rawKey);
      setNewKeyName("");
      setNewKeyUserId("");
    }
  };

  return (
    <div className={styles.container}>
      <div className="flex gap-2 p-1 rounded-xl bg-surface-light border border-border-color self-start overflow-x-auto">
        <button
          onClick={() => setTab("users")}
          className={`px-4 py-2 rounded-lg text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
            tab === "users" ? "text-white bg-primary shadow-sm" : "text-on-surface-variant hover:text-on-surface"
          }`}
        >
          Kullanıcı Yönetimi
        </button>
        <button
          onClick={() => setTab("review")}
          className={`px-4 py-2 rounded-lg text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
            tab === "review" ? "text-white bg-primary shadow-sm" : "text-on-surface-variant hover:text-on-surface"
          }`}
        >
          Onay Kuyruğu (HITL) {pendingReview.length > 0 && `(${pendingReview.length})`}
        </button>
        <button
          onClick={() => setTab("verifications")}
          className={`px-4 py-2 rounded-lg text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
            tab === "verifications" ? "text-white bg-primary shadow-sm" : "text-on-surface-variant hover:text-on-surface"
          }`}
        >
          Tesis Doğrulamaları {pendingVerifications.length > 0 && `(${pendingVerifications.length})`}
        </button>
        <button
          onClick={() => setTab("weights")}
          className={`px-4 py-2 rounded-lg text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
            tab === "weights" ? "text-white bg-primary shadow-sm" : "text-on-surface-variant hover:text-on-surface"
          }`}
        >
          AHP Ağırlık Kalibrasyonu
        </button>
        <button
          onClick={() => setTab("apikeys")}
          className={`px-4 py-2 rounded-lg text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
            tab === "apikeys" ? "text-white bg-primary shadow-sm" : "text-on-surface-variant hover:text-on-surface"
          }`}
        >
          API Anahtarları (IoT)
        </button>
        <button
          onClick={() => setTab("carbon")}
          className={`px-4 py-2 rounded-lg text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
            tab === "carbon" ? "text-white bg-primary shadow-sm" : "text-on-surface-variant hover:text-on-surface"
          }`}
        >
          Karbon Faktörleri
        </button>
        <button
          onClick={() => setTab("config")}
          className={`px-4 py-2 rounded-lg text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
            tab === "config" ? "text-white bg-primary shadow-sm" : "text-on-surface-variant hover:text-on-surface"
          }`}
        >
          Sistem Config
        </button>
        <button
          onClick={() => setTab("auditlog")}
          className={`px-4 py-2 rounded-lg text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
            tab === "auditlog" ? "text-white bg-primary shadow-sm" : "text-on-surface-variant hover:text-on-surface"
          }`}
        >
          Audit Log
        </button>
      </div>

      {tab === "users" && (
        <div className="glass-panel rounded-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className={styles.tableHeader}>
                  <th className={styles.tableCell}>Ad</th>
                  <th className={styles.tableCell}>E-posta</th>
                  <th className={styles.tableCell}>Tesis</th>
                  <th className={styles.tableCell}>Rol</th>
                  <th className={`${styles.tableCell} text-right`}>İşlemler</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-color text-sm text-on-surface">
                {users.map((u) => (
                  <tr key={u.id}>
                    <td className={`${styles.tableCell} font-semibold`}>{u.name}</td>
                    <td className={`${styles.tableCell} text-on-surface-variant`}>{u.email}</td>
                    <td className={`${styles.tableCell} text-on-surface-variant`}>{u.facility}</td>
                    <td className={styles.tableCell}>
                      <span className="status-label text-teal-700">{ROLE_LABEL[u.role] ?? u.role}</span>
                    </td>
                    <td className={`${styles.tableCell} text-right`}>
                      <button
                        onClick={() => onRemoveUser(u.id)}
                        className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-rose-500/10 border border-rose-500/20 text-rose-600 hover:bg-rose-500/20 transition-all cursor-pointer"
                      >
                        Kaldır
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === "review" && (
        <div className="flex flex-col gap-3">
          {reviewQueue.length === 0 && (
            <div className="glass-panel p-6 rounded-2xl text-center text-xs text-on-surface-variant">
              Onay kuyruğunda öğe yok.
            </div>
          )}
          {reviewQueue.map((item) => (
            <div key={item.id} className="glass-panel p-5 rounded-2xl flex flex-col sm:flex-row sm:items-center gap-4 justify-between">
              <div className="flex flex-col gap-1">
                <div className="flex items-center gap-2">
                  <h4 className="font-title font-bold text-on-surface text-sm">{item.matchName}</h4>
                  <span
                    className={`status-label ${
                      item.status === "pending" ? "text-amber-700" : item.status === "approved" ? "text-accent-mint" : "text-rose-600"
                    }`}
                  >
                    {item.status === "pending" ? "Bekliyor" : item.status === "approved" ? "Onaylandı" : "Reddedildi"}
                  </span>
                </div>
                <p className="text-[11px] text-on-surface-variant">
                  Güven skoru: <span className="text-on-surface font-semibold">{(item.confidence * 100).toFixed(0)}%</span> — {item.reason}
                </p>
              </div>
              {item.status === "pending" && (
                <div className="flex gap-2 shrink-0">
                  <button
                    onClick={() => onApproveReview(item.id)}
                    className="px-4 py-2 rounded-lg text-xs font-bold bg-accent-mint/10 border border-accent-mint/20 text-accent-mint hover:bg-accent-mint/20 cursor-pointer"
                  >
                    Onayla
                  </button>
                  <button
                    onClick={() => onRejectReview(item.id)}
                    className="px-4 py-2 rounded-lg text-xs font-bold bg-rose-500/10 border border-rose-500/20 text-rose-600 hover:bg-rose-500/20 cursor-pointer"
                  >
                    Reddet
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {tab === "verifications" && (
        <div className="flex flex-col gap-3">
          {verifications.length === 0 && (
            <div className="glass-panel p-6 rounded-2xl text-center text-xs text-on-surface-variant">
              Doğrulama talebi yok.
            </div>
          )}
          {verifications.map((v) => (
            <div key={v.id} className="glass-panel p-5 rounded-2xl flex flex-col gap-4">
              <div className="flex flex-col sm:flex-row sm:items-center gap-4 justify-between">
                <div className="flex flex-col gap-1">
                  <div className="flex items-center gap-2">
                    <h4 className="font-title font-bold text-on-surface text-sm">{v.name}</h4>
                    <span
                      className={`status-label ${
                        v.status === "pending" ? "text-amber-700" : v.status === "approved" ? "text-accent-mint" : "text-rose-600"
                      }`}
                    >
                      {v.status === "pending" ? "Bekliyor" : v.status === "approved" ? "Onaylandı" : "Reddedildi"}
                    </span>
                  </div>
                  <p className="text-[11px] text-on-surface-variant">Sektör: {v.sector}</p>
                </div>
                {v.status === "pending" && rejectingId !== v.id && (
                  <div className="flex gap-2 shrink-0">
                    <button
                      onClick={() => onApproveVerification(v.id)}
                      className="px-4 py-2 rounded-lg text-xs font-bold bg-accent-mint/10 border border-accent-mint/20 text-accent-mint hover:bg-accent-mint/20 cursor-pointer"
                    >
                      Onayla
                    </button>
                    <button
                      onClick={() => {
                        setRejectingId(v.id);
                        setRejectReason("");
                      }}
                      className="px-4 py-2 rounded-lg text-xs font-bold bg-rose-500/10 border border-rose-500/20 text-rose-600 hover:bg-rose-500/20 cursor-pointer"
                    >
                      Reddet
                    </button>
                  </div>
                )}
              </div>
              {rejectingId === v.id && (
                <div className="flex flex-col gap-2 border-t border-border-color pt-3">
                  <label className="text-[10px] font-semibold text-on-surface-variant">Red gerekçesi</label>
                  <textarea
                    value={rejectReason}
                    onChange={(e) => setRejectReason(e.target.value)}
                    rows={2}
                    placeholder="Tesis neden doğrulanmıyor?"
                    className="bg-surface border border-border-color rounded-xl p-3 text-xs text-on-surface focus:outline-none focus:border-rose-400"
                  />
                  <div className="flex gap-2 justify-end">
                    <button
                      onClick={() => setRejectingId(null)}
                      className="px-3 py-1.5 rounded-lg text-xs font-semibold text-on-surface-variant bg-surface-light border border-border-color hover:text-on-surface cursor-pointer"
                    >
                      Vazgeç
                    </button>
                    <button
                      onClick={() => handleRejectSubmit(v.id)}
                      disabled={!rejectReason.trim()}
                      className="px-3 py-1.5 rounded-lg text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                    >
                      Reddi Onayla
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {tab === "weights" && (
        <div className="glass-panel p-6 rounded-2xl flex flex-col gap-6">
          <div>
            <h3 className="font-title font-bold text-on-surface text-base">5 Faktörlü Skor Ağırlıkları</h3>
            <p className="text-xs text-on-surface-variant mt-1">
              Toplam tam olarak %100 olmalıdır. Değişiklik yeni bir weights_config versiyonu olarak aktif edilir.
            </p>
          </div>

          {(Object.keys(draftWeights) as (keyof WeightsConfig)[]).map((key) => (
            <div key={key} className="flex flex-col gap-2">
              <div className="flex justify-between text-xs">
                <span className="font-semibold text-on-surface capitalize">
                  {key === "material" && "Malzeme"}
                  {key === "quality" && "Kalite"}
                  {key === "environmental" && "Çevresel"}
                  {key === "logistics" && "Lojistik"}
                  {key === "economic" && "Ekonomik"}
                </span>
                <span className="text-accent-mint font-bold">{draftWeights[key]}%</span>
              </div>
              <input
                type="range"
                min={0}
                max={100}
                value={draftWeights[key]}
                onChange={(e) => handleWeightChange(key, Number(e.target.value))}
                className={styles.slider}
              />
            </div>
          ))}

          <div className="flex justify-between items-center border-t border-border-color pt-4">
            <span className={`text-sm font-bold ${isValidTotal ? "text-accent-mint" : "text-rose-600"}`}>
              Toplam: {total}% {!isValidTotal && "(100% olmalı)"}
            </span>
            <button
              onClick={handleSave}
              disabled={!isValidTotal}
              className="btn-primary px-6 py-2.5 rounded-xl text-xs font-bold disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
            >
              Ağırlıkları Kaydet ve Aktif Et
            </button>
          </div>
        </div>
      )}

      {tab === "apikeys" && (
        <div className="flex flex-col gap-4">
          <div className="glass-panel p-6 rounded-2xl flex flex-col gap-4">
            <h3 className="font-title font-bold text-on-surface text-base">Yeni Anahtar Üret</h3>
            <p className="text-xs text-on-surface-variant">
              IoT sensörlerinin <code>POST /v1/iot/sensor-data</code>&apos;ya kimlik doğrulaması için kullandığı{" "}
              <code>X-Api-Key</code>. Anahtarın ham değeri yalnızca üretildiği anda bir kez gösterilir.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <input
                value={newKeyName}
                onChange={(e) => setNewKeyName(e.target.value)}
                type="text"
                placeholder="Anahtar adı (örn: Gebze Metal Sensör-1)"
                className="sm:col-span-2 bg-surface border border-border-color rounded-xl p-3 text-sm text-on-surface focus:outline-none focus:border-accent-mint"
              />
              <select
                value={newKeyUserId}
                onChange={(e) => setNewKeyUserId(e.target.value)}
                className="bg-surface border border-border-color rounded-xl p-3 text-sm text-on-surface focus:outline-none focus:border-accent-mint"
              >
                <option value="">Kullanıcı seç</option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name} ({u.email})
                  </option>
                ))}
              </select>
            </div>
            <button
              onClick={handleCreateApiKey}
              disabled={!newKeyName.trim() || !newKeyUserId}
              className="btn-primary self-start px-6 py-2.5 rounded-xl text-xs font-bold disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
            >
              Anahtar Üret
            </button>
            {revealedKey && (
              <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-4 flex flex-col gap-2">
                <span className="text-[11px] font-bold text-amber-700 uppercase">
                  Bu anahtarı şimdi kaydedin — bir daha gösterilmeyecek
                </span>
                <code className="text-xs break-all text-on-surface">{revealedKey}</code>
                <button
                  onClick={() => setRevealedKey(null)}
                  className="self-start text-[11px] font-semibold text-accent-mint hover:underline cursor-pointer"
                >
                  Kapat
                </button>
              </div>
            )}
          </div>

          <div className="glass-panel rounded-2xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className={styles.tableHeader}>
                    <th className={styles.tableCell}>Ad</th>
                    <th className={styles.tableCell}>Son Kullanım</th>
                    <th className={styles.tableCell}>Durum</th>
                    <th className={`${styles.tableCell} text-right`}>İşlemler</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border-color text-sm text-on-surface">
                  {apiKeys.length === 0 && (
                    <tr>
                      <td colSpan={4} className="py-6 text-center text-on-surface-variant text-xs">
                        Henüz üretilmiş anahtar yok.
                      </td>
                    </tr>
                  )}
                  {apiKeys.map((k) => (
                    <tr key={k.id}>
                      <td className={`${styles.tableCell} font-semibold`}>{k.name}</td>
                      <td className={`${styles.tableCell} text-on-surface-variant`}>{k.lastUsed ?? "Hiç kullanılmadı"}</td>
                      <td className={styles.tableCell}>
                        <span className={`status-label ${k.revokedAt ? "text-rose-600" : "text-accent-mint"}`}>
                          {k.revokedAt ? "İptal edildi" : "Aktif"}
                        </span>
                      </td>
                      <td className={`${styles.tableCell} text-right`}>
                        {!k.revokedAt && (
                          <button
                            onClick={() => onRevokeApiKey(k.id)}
                            className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-rose-500/10 border border-rose-500/20 text-rose-600 hover:bg-rose-500/20 transition-all cursor-pointer"
                          >
                            İptal Et
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {tab === "carbon" && (
        <div className="flex flex-col gap-4">
          <div className="glass-panel p-6 rounded-2xl flex flex-col gap-4">
            <h3 className="font-title font-bold text-on-surface text-base">Yeni Karbon Faktörü Ekle</h3>
            <p className="text-xs text-on-surface-variant">
              CO2 azaltımı ve CBAM hesaplarında kullanılan referans emisyon faktörleri (kg CO2 / kg malzeme).
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
              <select
                value={newFactorClass}
                onChange={(e) => setNewFactorClass(e.target.value)}
                className="bg-surface border border-border-color rounded-xl p-3 text-sm text-on-surface focus:outline-none focus:border-accent-mint"
              >
                {MATERIAL_CLASSES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
              <select
                value={newFactorType}
                onChange={(e) => setNewFactorType(e.target.value)}
                className="bg-surface border border-border-color rounded-xl p-3 text-sm text-on-surface focus:outline-none focus:border-accent-mint"
              >
                {FACTOR_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {FACTOR_TYPE_LABEL[t] ?? t}
                  </option>
                ))}
              </select>
              <input
                value={newFactorCo2}
                onChange={(e) => setNewFactorCo2(e.target.value)}
                type="number"
                step="0.01"
                placeholder="kg CO2 / kg"
                className="bg-surface border border-border-color rounded-xl p-3 text-sm text-on-surface focus:outline-none focus:border-accent-mint"
              />
              <input
                value={newFactorSource}
                onChange={(e) => setNewFactorSource(e.target.value)}
                type="text"
                placeholder="Kaynak (örn: Ecoinvent 3.9)"
                className="bg-surface border border-border-color rounded-xl p-3 text-sm text-on-surface focus:outline-none focus:border-accent-mint"
              />
            </div>
            <button
              onClick={handleCreateFactor}
              disabled={!newFactorSource.trim() || !newFactorCo2 || savingFactor}
              className="btn-primary self-start px-6 py-2.5 rounded-xl text-xs font-bold disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
            >
              {savingFactor ? "Kaydediliyor..." : "Faktör Ekle"}
            </button>
          </div>

          <div className="glass-panel rounded-2xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className={styles.tableHeader}>
                    <th className={styles.tableCell}>Malzeme Sınıfı</th>
                    <th className={styles.tableCell}>Tür</th>
                    <th className={styles.tableCell}>kg CO2 / kg</th>
                    <th className={styles.tableCell}>Kaynak</th>
                    <th className={styles.tableCell}>Geçerlilik</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border-color text-sm text-on-surface">
                  {carbonFactors.length === 0 && (
                    <tr>
                      <td colSpan={5} className="py-6 text-center text-on-surface-variant text-xs">
                        Henüz karbon faktörü tanımlanmamış.
                      </td>
                    </tr>
                  )}
                  {carbonFactors.map((f) => (
                    <tr key={f.id}>
                      <td className={`${styles.tableCell} font-semibold status-label text-teal-700`}>{f.materialClass}</td>
                      <td className={`${styles.tableCell} text-on-surface-variant`}>{FACTOR_TYPE_LABEL[f.factorType] ?? f.factorType}</td>
                      <td className={`${styles.tableCell} font-mono text-on-surface`}>{f.co2PerKg}</td>
                      <td className={`${styles.tableCell} text-on-surface-variant`}>{f.source}</td>
                      <td className={`${styles.tableCell} text-on-surface-variant text-xs`}>
                        {f.validFrom?.slice(0, 10)}
                        {f.validTo ? ` — ${f.validTo.slice(0, 10)}` : ""}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {tab === "config" && (
        <div className="glass-panel rounded-2xl overflow-hidden">
          <div className="p-6 border-b border-border-color">
            <h3 className="font-title font-bold text-on-surface text-base">Sistem Yapılandırması</h3>
            <p className="text-xs text-on-surface-variant mt-1">
              system_config tablosundaki anahtar-değer çiftleri (eşleşme eşiği, HITL güven eşiği, top-K vb.). Değeri
              JSON olarak düzenleyin (sayı, metin veya boole).
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className={styles.tableHeader}>
                  <th className={styles.tableCell}>Anahtar</th>
                  <th className={styles.tableCell}>Değer</th>
                  <th className={`${styles.tableCell} text-right`}>İşlem</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-color text-sm text-on-surface">
                {Object.keys(systemConfig).length === 0 && (
                  <tr>
                    <td colSpan={3} className="py-6 text-center text-on-surface-variant text-xs">
                      Yapılandırma yüklenemedi.
                    </td>
                  </tr>
                )}
                {Object.entries(systemConfig).map(([key, value]) => {
                  const dirty = configDrafts[key] !== undefined && configDrafts[key] !== JSON.stringify(value);
                  return (
                    <tr key={key}>
                      <td className={`${styles.tableCell} font-mono text-xs font-semibold`}>{key}</td>
                      <td className={styles.tableCell}>
                        <input
                          value={configText(key, value)}
                          onChange={(e) => setConfigDrafts((prev) => ({ ...prev, [key]: e.target.value }))}
                          type="text"
                          className="bg-surface border border-border-color rounded-lg px-2.5 py-1.5 text-xs font-mono text-on-surface focus:outline-none focus:border-accent-mint w-full max-w-xs"
                        />
                      </td>
                      <td className={`${styles.tableCell} text-right`}>
                        <button
                          onClick={() => handleSaveConfigKey(key)}
                          disabled={!dirty || savingConfigKey === key}
                          className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-accent-mint/10 border border-accent-mint/20 text-accent-mint hover:bg-accent-mint/20 transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          {savingConfigKey === key ? "Kaydediliyor..." : "Kaydet"}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === "auditlog" && (
        <div className="glass-panel rounded-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className={styles.tableHeader}>
                  <th className={styles.tableCell}>Tarih</th>
                  <th className={styles.tableCell}>Aksiyon</th>
                  <th className={styles.tableCell}>Varlık</th>
                  <th className={styles.tableCell}>Varlık ID</th>
                  <th className={styles.tableCell}>Aktör ID</th>
                  <th className={styles.tableCell}>IP</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-color text-sm text-on-surface">
                {auditLog.length === 0 && (
                  <tr>
                    <td colSpan={6} className="py-6 text-center text-on-surface-variant text-xs">
                      Kayıt yok.
                    </td>
                  </tr>
                )}
                {auditLog.map((row) => (
                  <tr key={row.id}>
                    <td className={`${styles.tableCell} text-on-surface-variant text-xs`}>
                      {row.createdAt ? new Date(row.createdAt).toLocaleString("tr-TR") : "—"}
                    </td>
                    <td className={`${styles.tableCell} status-label text-teal-700`}>{row.action}</td>
                    <td className={`${styles.tableCell} text-on-surface-variant`}>{row.entity}</td>
                    <td className={`${styles.tableCell} font-mono text-[11px] text-on-surface-variant`}>
                      {row.entityId?.slice(0, 8)}…
                    </td>
                    <td className={`${styles.tableCell} font-mono text-[11px] text-on-surface-variant`}>
                      {row.actorId ? `${row.actorId.slice(0, 8)}…` : "—"}
                    </td>
                    <td className={`${styles.tableCell} text-on-surface-variant text-xs`}>{row.ipAddress ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {auditLogTotalPages > 1 && (
            <div className="flex justify-between items-center px-5 py-3 border-t border-border-color">
              <button
                onClick={() => onLoadAuditLogPage(auditLogPage - 1)}
                disabled={auditLogPage <= 1}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold text-on-surface-variant bg-surface-light border border-border-color hover:text-on-surface disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
              >
                Önceki
              </button>
              <span className="text-xs text-on-surface-variant">
                Sayfa {auditLogPage} / {auditLogTotalPages}
              </span>
              <button
                onClick={() => onLoadAuditLogPage(auditLogPage + 1)}
                disabled={auditLogPage >= auditLogTotalPages}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold text-on-surface-variant bg-surface-light border border-border-color hover:text-on-surface disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
              >
                Sonraki
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
