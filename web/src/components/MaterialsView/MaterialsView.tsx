"use client";

import React, { useState } from "react";
import styles from "./MaterialsView.module.css";
import { OutputItem, InputItem } from "../../types";

interface MaterialsViewProps {
  outputs: OutputItem[];
  inputs: InputItem[];
  currentTab: "outputs" | "inputs";
  setCurrentTab: (tab: "outputs" | "inputs") => void;
  onShowOutputModal: () => void;
  onShowInputModal: () => void;
  onShowDppModal: (output: OutputItem) => void;
  onEditOutput: (output: OutputItem) => void;
  onDeleteOutput: (id: string) => void;
  onFindMatches: (output: OutputItem) => void;
  onEditInput: (input: InputItem) => void;
  onDeleteInput: (id: string) => void;
}

export default function MaterialsView({
  outputs,
  inputs,
  currentTab,
  setCurrentTab,
  onShowOutputModal,
  onShowInputModal,
  onShowDppModal,
  onEditOutput,
  onDeleteOutput,
  onFindMatches,
  onEditInput,
  onDeleteInput,
}: MaterialsViewProps) {
  // Sil butonu için sayfa-içi onay -- window.confirm() yerine (bkz. ToastProvider'daki
  // aynı gerekçe: native dialog uygulamanın görsel diline uymuyor).
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const handleConfirmDeleteOutput = (id: string) => {
    onDeleteOutput(id);
    setConfirmDeleteId(null);
  };
  const handleConfirmDeleteInput = (id: string) => {
    onDeleteInput(id);
    setConfirmDeleteId(null);
  };
  return (
    <div className={styles.container}>
      {/* Tabs */}
      <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4 border-b border-border-color pb-4">
        <div className="flex gap-2 p-1 rounded-xl bg-surface-light border border-border-color self-start">
          <button
            onClick={() => setCurrentTab("outputs")}
            className={`px-4 py-2 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
              currentTab === "outputs" ? "text-white bg-primary shadow-sm" : "text-on-surface-variant hover:text-on-surface"
            }`}
          >
            Üretilen Çıktılar / Atıklar
          </button>
          <button
            onClick={() => setCurrentTab("inputs")}
            className={`px-4 py-2 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
              currentTab === "inputs" ? "text-white bg-primary shadow-sm" : "text-on-surface-variant hover:text-on-surface"
            }`}
          >
            Girdi İhtiyaçları
          </button>
        </div>
        <div>
          {currentTab === "outputs" ? (
            <button
              onClick={onShowOutputModal}
              className="btn-primary px-5 py-2.5 rounded-xl text-xs font-semibold flex items-center gap-2 cursor-pointer"
            >
              <span className="material-symbols-outlined text-[16px]">add</span>
              Yeni Çıktı Kaydet
            </button>
          ) : (
            <button
              onClick={onShowInputModal}
              className="btn-primary px-5 py-2.5 rounded-xl text-xs font-semibold flex items-center gap-2 cursor-pointer"
            >
              <span className="material-symbols-outlined text-[16px]">add</span>
              Girdi İhtiyacı Tanımla
            </button>
          )}
        </div>
      </div>

      {/* List Container */}
      <div className="glass-panel rounded-2xl overflow-hidden">
        {currentTab === "outputs" ? (
          <div>
            {/* Desktop Table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className={styles.tableHeader}>
                    <th className={styles.tableCell}>Malzeme Adı</th>
                    <th className={styles.tableCell}>Sınıf</th>
                    <th className={styles.tableCell}>Kimyasal Bileşim</th>
                    <th className={styles.tableCell}>Miktar (kg)</th>
                    <th className={styles.tableCell}>Stok (kg)</th>
                    <th className={styles.tableCell}>Kayıt Tarihi</th>
                    <th className={`${styles.tableCell} text-right`}>İşlemler</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border-color text-sm text-on-surface">
                  {outputs.map((out) => (
                    <tr key={out.id}>
                      <td className={`${styles.tableCell} font-semibold text-on-surface`}>{out.name}</td>
                      <td className={styles.tableCell}>
                        <span className="status-label text-teal-700">
                          {out.class}
                        </span>
                      </td>
                      <td className={`${styles.tableCell} text-on-surface-variant`}>{out.composition}</td>
                      <td className={`${styles.tableCell} font-mono text-on-surface`}>{out.quantity.toLocaleString()}</td>
                      <td className={`${styles.tableCell} font-mono text-on-surface`}>{out.stock.toLocaleString()}</td>
                      <td className={`${styles.tableCell} text-on-surface-variant`}>{out.date}</td>
                      <td className={`${styles.tableCell} text-right`}>
                        {confirmDeleteId === out.id ? (
                          <div className="flex items-center justify-end gap-1.5">
                            <span className="text-[10px] text-rose-600 font-semibold">Emin misiniz?</span>
                            <button
                              onClick={() => handleConfirmDeleteOutput(out.id)}
                              className="px-2.5 py-1 rounded-lg text-[11px] font-bold text-white bg-rose-600 hover:bg-rose-700 cursor-pointer"
                            >
                              Sil
                            </button>
                            <button
                              onClick={() => setConfirmDeleteId(null)}
                              className="px-2.5 py-1 rounded-lg text-[11px] font-semibold text-on-surface-variant bg-surface-light border border-border-color cursor-pointer"
                            >
                              Vazgeç
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              onClick={() => onFindMatches(out)}
                              title="Eşleştirme adayı bul"
                              className="w-8 h-8 rounded-lg text-primary hover:bg-primary/10 transition-colors flex items-center justify-center cursor-pointer"
                            >
                              <span className="material-symbols-outlined text-[16px]">hub</span>
                            </button>
                            <button
                              onClick={() => onShowDppModal(out)}
                              title="Pasaport (DPP)"
                              className="w-8 h-8 rounded-lg text-accent-mint hover:bg-accent-mint/10 transition-colors flex items-center justify-center cursor-pointer"
                            >
                              <span className="material-symbols-outlined text-[16px]">qr_code_2</span>
                            </button>
                            <button
                              onClick={() => onEditOutput(out)}
                              title="Düzenle"
                              className="w-8 h-8 rounded-lg text-on-surface-variant hover:text-on-surface hover:bg-surface-light transition-colors flex items-center justify-center cursor-pointer"
                            >
                              <span className="material-symbols-outlined text-[16px]">edit</span>
                            </button>
                            <button
                              onClick={() => setConfirmDeleteId(out.id)}
                              title="Sil"
                              className="w-8 h-8 rounded-lg text-rose-600 hover:bg-rose-500/10 transition-colors flex items-center justify-center cursor-pointer"
                            >
                              <span className="material-symbols-outlined text-[16px]">delete</span>
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile Cards */}
            <div className="md:hidden flex flex-col divide-y divide-border-color">
              {outputs.map((out) => (
                <div key={out.id} className={styles.mobileCard}>
                  <div className="flex justify-between items-start">
                    <div>
                      <h4 className="font-title font-bold text-on-surface text-sm">{out.name}</h4>
                      <span className="text-[10px] text-on-surface-variant block mt-1">Kayıt: {out.date}</span>
                    </div>
                    <span className="status-label text-teal-700 shrink-0">
                      {out.class}
                    </span>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-xs border-y border-border-color py-2">
                    <div>
                      <span className="text-on-surface-variant text-[9px] block">Miktar</span>
                      <span className="text-on-surface font-mono font-medium">{out.quantity.toLocaleString()} kg</span>
                    </div>
                    <div>
                      <span className="text-on-surface-variant text-[9px] block">Stok</span>
                      <span className="text-on-surface font-mono font-medium">{out.stock.toLocaleString()} kg</span>
                    </div>
                    <div>
                      <span className="text-on-surface-variant text-[9px] block">Bileşim</span>
                      <span className="text-on-surface truncate block max-w-[80px]" title={out.composition}>
                        {out.composition}
                      </span>
                    </div>
                  </div>
                  {confirmDeleteId === out.id ? (
                    <div className="flex items-center justify-between gap-2 bg-rose-500/5 border border-rose-500/20 rounded-xl p-2.5">
                      <span className="text-[11px] text-rose-600 font-semibold">Silmek istediğinize emin misiniz?</span>
                      <div className="flex gap-1.5 shrink-0">
                        <button
                          onClick={() => handleConfirmDeleteOutput(out.id)}
                          className="px-3 py-1.5 rounded-lg text-[11px] font-bold text-white bg-rose-600 hover:bg-rose-700 cursor-pointer"
                        >
                          Sil
                        </button>
                        <button
                          onClick={() => setConfirmDeleteId(null)}
                          className="px-3 py-1.5 rounded-lg text-[11px] font-semibold text-on-surface-variant bg-surface-light border border-border-color cursor-pointer"
                        >
                          Vazgeç
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex gap-2">
                      <button
                        onClick={() => onFindMatches(out)}
                        className="flex-1 py-2.5 rounded-xl text-xs font-semibold border border-primary/30 text-primary hover:bg-primary/10 transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
                      >
                        <span className="material-symbols-outlined text-[16px]">hub</span>
                        Eşleştir
                      </button>
                      <button
                        onClick={() => onShowDppModal(out)}
                        title="Pasaport (DPP)"
                        className="w-11 h-11 shrink-0 rounded-xl border border-accent-mint/30 text-accent-mint hover:bg-accent-mint/10 transition-colors flex items-center justify-center cursor-pointer"
                      >
                        <span className="material-symbols-outlined text-[18px]">qr_code_2</span>
                      </button>
                      <button
                        onClick={() => onEditOutput(out)}
                        title="Düzenle"
                        className="w-11 h-11 shrink-0 rounded-xl text-on-surface-variant hover:text-on-surface hover:bg-surface-light transition-colors flex items-center justify-center cursor-pointer"
                      >
                        <span className="material-symbols-outlined text-[18px]">edit</span>
                      </button>
                      <button
                        onClick={() => setConfirmDeleteId(out.id)}
                        title="Sil"
                        className="w-11 h-11 shrink-0 rounded-xl text-rose-600 hover:bg-rose-500/10 transition-colors flex items-center justify-center cursor-pointer"
                      >
                        <span className="material-symbols-outlined text-[18px]">delete</span>
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div>
            {/* Desktop Table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className={styles.tableHeader}>
                    <th className={styles.tableCell}>Girdi / Hammadde</th>
                    <th className={styles.tableCell}>Sınıf</th>
                    <th className={styles.tableCell}>Teknik Özellik / Limit</th>
                    <th className={styles.tableCell}>Miktar (kg)</th>
                    <th className={styles.tableCell}>Frekans</th>
                    <th className={styles.tableCell}>Kayıt Tarihi</th>
                    <th className={`${styles.tableCell} text-right`}>İşlemler</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border-color text-sm text-on-surface">
                  {inputs.map((input) => (
                    <tr key={input.id}>
                      <td className={`${styles.tableCell} font-semibold text-on-surface`}>{input.name}</td>
                      <td className={styles.tableCell}>
                        <span className="status-label text-blue-700">
                          {input.class}
                        </span>
                      </td>
                      <td className={`${styles.tableCell} text-on-surface-variant`}>{input.specs}</td>
                      <td className={`${styles.tableCell} font-mono text-on-surface`}>{input.quantity.toLocaleString()}</td>
                      <td className={`${styles.tableCell} text-on-surface-variant`}>{input.frequency}</td>
                      <td className={`${styles.tableCell} text-on-surface-variant`}>{input.date}</td>
                      <td className={`${styles.tableCell} text-right`}>
                        {confirmDeleteId === input.id ? (
                          <div className="flex items-center justify-end gap-1.5">
                            <span className="text-[10px] text-rose-600 font-semibold">Emin misiniz?</span>
                            <button
                              onClick={() => handleConfirmDeleteInput(input.id)}
                              className="px-2.5 py-1 rounded-lg text-[11px] font-bold text-white bg-rose-600 hover:bg-rose-700 cursor-pointer"
                            >
                              Sil
                            </button>
                            <button
                              onClick={() => setConfirmDeleteId(null)}
                              className="px-2.5 py-1 rounded-lg text-[11px] font-semibold text-on-surface-variant bg-surface-light border border-border-color cursor-pointer"
                            >
                              Vazgeç
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center justify-end gap-1.5">
                            <span className="text-[10px] text-on-surface-variant font-medium mr-1">Eşleştirme Bekliyor</span>
                            <button
                              onClick={() => onEditInput(input)}
                              title="Düzenle"
                              className="w-8 h-8 rounded-lg text-on-surface-variant hover:text-on-surface hover:bg-surface-light transition-colors flex items-center justify-center cursor-pointer"
                            >
                              <span className="material-symbols-outlined text-[16px]">edit</span>
                            </button>
                            <button
                              onClick={() => setConfirmDeleteId(input.id)}
                              title="Sil"
                              className="w-8 h-8 rounded-lg text-rose-600 hover:bg-rose-500/10 transition-colors flex items-center justify-center cursor-pointer"
                            >
                              <span className="material-symbols-outlined text-[16px]">delete</span>
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile Cards */}
            <div className="md:hidden flex flex-col divide-y divide-border-color">
              {inputs.map((input) => (
                <div key={input.id} className={styles.mobileCard}>
                  <div className="flex justify-between items-start">
                    <div>
                      <h4 className="font-title font-bold text-on-surface text-sm">{input.name}</h4>
                      <span className="text-[10px] text-on-surface-variant block mt-1">Kayıt: {input.date}</span>
                    </div>
                    <span className="status-label text-blue-700 shrink-0">
                      {input.class}
                    </span>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-xs border-y border-border-color py-2">
                    <div>
                      <span className="text-on-surface-variant text-[9px] block">İhtiyaç</span>
                      <span className="text-on-surface font-mono font-medium">{input.quantity.toLocaleString()} kg</span>
                    </div>
                    <div>
                      <span className="text-on-surface-variant text-[9px] block">Frekans</span>
                      <span className="text-on-surface font-medium">{input.frequency}</span>
                    </div>
                    <div className="col-span-1">
                      <span className="text-on-surface-variant text-[9px] block">Özellik</span>
                      <span className="text-on-surface truncate block max-w-[80px]" title={input.specs}>
                        {input.specs}
                      </span>
                    </div>
                  </div>
                  {confirmDeleteId === input.id ? (
                    <div className="flex items-center justify-between gap-2 bg-rose-500/5 border border-rose-500/20 rounded-xl p-2.5">
                      <span className="text-[11px] text-rose-600 font-semibold">Silmek istediğinize emin misiniz?</span>
                      <div className="flex gap-1.5 shrink-0">
                        <button
                          onClick={() => handleConfirmDeleteInput(input.id)}
                          className="px-3 py-1.5 rounded-lg text-[11px] font-bold text-white bg-rose-600 hover:bg-rose-700 cursor-pointer"
                        >
                          Sil
                        </button>
                        <button
                          onClick={() => setConfirmDeleteId(null)}
                          className="px-3 py-1.5 rounded-lg text-[11px] font-semibold text-on-surface-variant bg-surface-light border border-border-color cursor-pointer"
                        >
                          Vazgeç
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <div className="flex-1 text-center text-on-surface-variant text-[11px] font-medium">
                        ⏳ Eşleştirme Bekliyor
                      </div>
                      <button
                        onClick={() => onEditInput(input)}
                        title="Düzenle"
                        className="w-11 h-11 shrink-0 rounded-xl text-on-surface-variant hover:text-on-surface hover:bg-surface-light transition-colors flex items-center justify-center cursor-pointer"
                      >
                        <span className="material-symbols-outlined text-[18px]">edit</span>
                      </button>
                      <button
                        onClick={() => setConfirmDeleteId(input.id)}
                        title="Sil"
                        className="w-11 h-11 shrink-0 rounded-xl text-rose-600 hover:bg-rose-500/10 transition-colors flex items-center justify-center cursor-pointer"
                      >
                        <span className="material-symbols-outlined text-[18px]">delete</span>
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
