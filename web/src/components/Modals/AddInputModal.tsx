"use client";

import React, { useEffect, useState } from "react";
import styles from "./Modal.module.css";
import { aiApi, ClassifyResponse } from "../../lib/api";
import { getAccessToken } from "../../lib/session";
import { InputItem } from "../../types";

// Dropdown'daki (Malzeme Sınıfı) Türkçe etiketlerle aynı -- backend
// materialClass'ı İngilizce/küçük harf döner (bkz. ai-client.service.ts
// MATERIAL_CLASSES), burada sadece görüntü için Türkçeleştiriyoruz.
const CLASS_LABELS: Record<string, string> = {
  metal: "Metal",
  plastic: "Plastik",
  organic: "Organik",
  chemical: "Kimyasal",
  textile: "Tekstil",
  glass: "Cam",
  paper: "Kağıt",
  other: "Diğer",
};

interface AddInputModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (name: string, classVal: string, freq: string, qty: number, specs: string) => void;
  editingInput?: InputItem | null;
  onUpdate?: (id: string, name: string, classVal: string, freq: string, qty: number, specs: string) => void;
}

// Backend'e {raw: "..."} olarak yazılan specs, GET /materials/inputs'tan
// JSON.stringify edilmiş halde geri geliyor (bkz. page.tsx#mapInput) -- düzenleme
// formunu bu ham JSON yerine kullanıcının orijinal yazdığı metinle dolduruyoruz.
function extractSpecsText(specs: string): string {
  try {
    const parsed = JSON.parse(specs);
    if (parsed && typeof parsed === "object" && typeof parsed.raw === "string") return parsed.raw;
  } catch {
    // JSON değil -- muhtemelen zaten ham metin (aynı oturumda oluşturulmuş kayıt).
  }
  return specs;
}

const emptyForm = { name: "", classVal: "METAL", freq: "", qty: "", specs: "" };

export default function AddInputModal({ isOpen, onClose, onSubmit, editingInput, onUpdate }: AddInputModalProps) {
  const [formInName, setFormInName] = useState(emptyForm.name);
  const [formInClass, setFormInClass] = useState(emptyForm.classVal);
  const [formInFreq, setFormInFreq] = useState(emptyForm.freq);
  const [formInQty, setFormInQty] = useState(emptyForm.qty);
  const [formInSpecs, setFormInSpecs] = useState(emptyForm.specs);

  const [prevEditingId, setPrevEditingId] = useState<string | null>(editingInput?.id ?? null);
  if (isOpen && (editingInput?.id ?? null) !== prevEditingId) {
    setPrevEditingId(editingInput?.id ?? null);
    if (editingInput) {
      setFormInName(editingInput.name);
      setFormInClass(editingInput.class);
      setFormInFreq(editingInput.frequency);
      setFormInQty(String(editingInput.quantity));
      setFormInSpecs(extractSpecsText(editingInput.specs));
    } else {
      setFormInName(emptyForm.name);
      setFormInClass(emptyForm.classVal);
      setFormInFreq(emptyForm.freq);
      setFormInQty(emptyForm.qty);
      setFormInSpecs(emptyForm.specs);
    }
  }

  const [classifyPreview, setClassifyPreview] = useState<ClassifyResponse | null>(null);

  // POST /v1/ai/classify -- gerçek servise gidiyor, bkz. AddOutputModal'daki
  // aynı desen. AI kapalı/hata dönerse önizleme sessizce kaybolur.
  useEffect(() => {
    const text = `${formInName} ${formInSpecs}`.trim();
    if (text.length < 3) {
      setClassifyPreview(null);
      return;
    }
    const token = getAccessToken();
    if (!token) return;

    let cancelled = false;
    const timer = setTimeout(() => {
      aiApi
        .classify(token, text)
        .then((res) => {
          if (!cancelled) setClassifyPreview(res);
        })
        .catch(() => {
          if (!cancelled) setClassifyPreview(null);
        });
    }, 500);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [formInName, formInSpecs]);

  if (!isOpen) return null;

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formInName || !formInFreq || !formInQty || !formInSpecs) return;

    if (editingInput && onUpdate) {
      onUpdate(editingInput.id, formInName, formInClass, formInFreq, parseFloat(formInQty), formInSpecs);
      return;
    }

    onSubmit(
      formInName,
      formInClass,
      formInFreq,
      parseFloat(formInQty),
      formInSpecs
    );

    // Reset Form
    setFormInName("");
    setFormInClass("METAL");
    setFormInFreq("");
    setFormInQty("");
    setFormInSpecs("");
  };

  return (
    <div className={styles.backdrop}>
      <div className={`${styles.modalContent} glass-panel`}>
        <div className="flex justify-between items-center">
          <h3 className="font-title font-bold text-lg text-on-surface">
            {editingInput ? "Girdiyi Düzenle" : "Yeni Girdi / Hammadde İhtiyacı"}
          </h3>
          <button onClick={onClose} className="text-on-surface-variant hover:text-on-surface cursor-pointer">
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>
        <form onSubmit={handleFormSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-on-surface-variant">Hammadde / Girdi Adı</label>
            <input
              value={formInName}
              onChange={(e) => setFormInName(e.target.value)}
              type="text"
              required
              className="bg-surface border border-border-color rounded-xl p-3 text-sm text-on-surface focus:outline-none focus:border-accent-mint"
              placeholder="Örn: Katkı Tozu"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-on-surface-variant">Malzeme Sınıfı</label>
              <select
                value={formInClass}
                onChange={(e) => setFormInClass(e.target.value)}
                className="bg-surface border border-border-color rounded-xl p-3 text-sm text-on-surface focus:outline-none focus:border-accent-mint"
              >
                <option value="METAL">Metal</option>
                <option value="PLASTIC">Plastik</option>
                <option value="ORGANIC">Organik</option>
                <option value="CHEMICAL">Kimyasal</option>
                <option value="TEXTILE">Tekstil</option>
                <option value="GLASS">Cam</option>
                <option value="PAPER">Kağıt</option>
                <option value="OTHER">Diğer</option>
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-on-surface-variant">Tedarik Frekansı</label>
              <input
                value={formInFreq}
                onChange={(e) => setFormInFreq(e.target.value)}
                type="text"
                required
                className="bg-surface border border-border-color rounded-xl p-3 text-sm text-on-surface focus:outline-none focus:border-accent-mint"
                placeholder="Aylık, Haftalık, Yıllık"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-on-surface-variant">İhtiyaç Miktarı (kg)</label>
              <input
                value={formInQty}
                onChange={(e) => setFormInQty(e.target.value)}
                type="number"
                required
                className="bg-surface border border-border-color rounded-xl p-3 text-sm text-on-surface focus:outline-none focus:border-accent-mint"
                placeholder="5000"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-on-surface-variant">Teknik Spekt / Limit</label>
              <input
                value={formInSpecs}
                onChange={(e) => setFormInSpecs(e.target.value)}
                type="text"
                required
                className="bg-surface border border-border-color rounded-xl p-3 text-sm text-on-surface focus:outline-none focus:border-accent-mint"
                placeholder="Saflık > %90"
              />
            </div>
          </div>

          {classifyPreview && (
            <div className="flex items-center gap-2 p-3 rounded-xl bg-accent-mint/5 border border-accent-mint/15 text-xs">
              <span className="material-symbols-outlined text-accent-mint text-[16px]">auto_awesome</span>
              <span className="text-on-surface-variant">
                AI Sınıflandırma Önizlemesi:{" "}
                <span className="text-accent-mint font-bold">
                  {CLASS_LABELS[classifyPreview.materialClass] ?? classifyPreview.materialClass}
                </span>{" "}
                — %{Math.round(classifyPreview.confidence * 100)} güven
              </span>
            </div>
          )}

          <button type="submit" className="btn-primary w-full py-3.5 rounded-xl font-bold text-sm mt-4 cursor-pointer">
            {editingInput ? "Değişiklikleri Kaydet" : "Girdi Tanımla"}
          </button>
        </form>
      </div>
    </div>
  );
}
