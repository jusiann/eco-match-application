"use client";

import React, { useEffect, useState } from "react";
import styles from "./Modal.module.css";
import { aiApi, ClassifyResponse } from "../../lib/api";
import { getAccessToken } from "../../lib/session";
import { OutputItem } from "../../types";

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

interface AddOutputModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (name: string, classVal: string, comp: string, qty: number, stock: number) => void;
  // Doluysa modal PATCH /materials/outputs/:id akışına geçer (düzenleme modu) --
  // create ile aynı formu, farklı başlık/buton metni ve onUpdate çağrısıyla kullanır.
  editingOutput?: OutputItem | null;
  onUpdate?: (id: string, name: string, classVal: string, comp: string, qty: number, stock: number) => void;
}

const emptyForm = { name: "", classVal: "METAL", comp: "", qty: "", stock: "" };

export default function AddOutputModal({ isOpen, onClose, onSubmit, editingOutput, onUpdate }: AddOutputModalProps) {
  const [formOutName, setFormOutName] = useState(emptyForm.name);
  const [formOutClass, setFormOutClass] = useState(emptyForm.classVal);
  const [formOutComp, setFormOutComp] = useState(emptyForm.comp);
  const [formOutQty, setFormOutQty] = useState(emptyForm.qty);
  const [formOutStock, setFormOutStock] = useState(emptyForm.stock);

  // Modal isOpen=false olduğunda unmount olmuyor (aşağıdaki `if (!isOpen) return null`
  // hook'lardan SONRA), bu yüzden edit hedefi her açılışta render sırasında senkronize
  // ediliyor -- bir useEffect yerine (bkz. SettingsView'daki aynı kalıp, React Compiler
  // lint kuralı effect içinde setState'i engelliyor).
  const [prevEditingId, setPrevEditingId] = useState<string | null>(editingOutput?.id ?? null);
  if (isOpen && (editingOutput?.id ?? null) !== prevEditingId) {
    setPrevEditingId(editingOutput?.id ?? null);
    if (editingOutput) {
      setFormOutName(editingOutput.name);
      setFormOutClass(editingOutput.class);
      setFormOutComp(editingOutput.composition);
      setFormOutQty(String(editingOutput.quantity));
      setFormOutStock(String(editingOutput.stock));
    } else {
      setFormOutName(emptyForm.name);
      setFormOutClass(emptyForm.classVal);
      setFormOutComp(emptyForm.comp);
      setFormOutQty(emptyForm.qty);
      setFormOutStock(emptyForm.stock);
    }
  }

  const [classifyPreview, setClassifyPreview] = useState<ClassifyResponse | null>(null);

  // POST /v1/ai/classify -- gerçek servise gidiyor (docs/04: 60/dk kullanıcı
  // bazlı limit, "debounce ile birlikte" diye not düşülmüş, o debounce burada).
  // AI kapalı/hata dönerse (503 AI_SERVICE_UNAVAILABLE) önizleme sessizce
  // kaybolur -- bu sadece tavsiye niteliğinde, form gönderimini engellemiyor,
  // kullanıcı zaten yukarıdaki dropdown'dan elle de seçebiliyor.
  useEffect(() => {
    const text = `${formOutName} ${formOutComp}`.trim();
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
  }, [formOutName, formOutComp]);

  if (!isOpen) return null;

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formOutName || !formOutComp || !formOutQty || !formOutStock) return;

    if (editingOutput && onUpdate) {
      onUpdate(editingOutput.id, formOutName, formOutClass, formOutComp, parseFloat(formOutQty), parseFloat(formOutStock));
      return;
    }

    onSubmit(
      formOutName,
      formOutClass,
      formOutComp,
      parseFloat(formOutQty),
      parseFloat(formOutStock)
    );

    // Reset Form
    setFormOutName("");
    setFormOutClass("METAL");
    setFormOutComp("");
    setFormOutQty("");
    setFormOutStock("");
  };

  return (
    <div className={styles.backdrop}>
      <div className={`${styles.modalContent} glass-panel`}>
        <div className="flex justify-between items-center">
          <h3 className="font-title font-bold text-lg text-on-surface">
            {editingOutput ? "Çıktıyı Düzenle" : "Yeni Çıktı / Atık Girişi"}
          </h3>
          <button onClick={onClose} className="text-on-surface-variant hover:text-on-surface cursor-pointer">
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>
        <form onSubmit={handleFormSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-on-surface-variant">Malzeme Adı</label>
            <input
              value={formOutName}
              onChange={(e) => setFormOutName(e.target.value)}
              type="text"
              required
              className="bg-surface border border-border-color rounded-xl p-3 text-sm text-on-surface focus:outline-none focus:border-accent-mint"
              placeholder="Örn: Demir Alaşımlı Toz"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-on-surface-variant">Malzeme Sınıfı</label>
              <select
                value={formOutClass}
                onChange={(e) => setFormOutClass(e.target.value)}
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
              <label className="text-xs font-semibold text-on-surface-variant">Saflık / Bileşim Değeri</label>
              <input
                value={formOutComp}
                onChange={(e) => setFormOutComp(e.target.value)}
                type="text"
                required
                className="bg-surface border border-border-color rounded-xl p-3 text-sm text-on-surface focus:outline-none focus:border-accent-mint"
                placeholder="Örn: Al %95, Fe %2"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-on-surface-variant">Toplam Miktar (kg)</label>
              <input
                value={formOutQty}
                onChange={(e) => setFormOutQty(e.target.value)}
                type="number"
                required
                className="bg-surface border border-border-color rounded-xl p-3 text-sm text-on-surface focus:outline-none focus:border-accent-mint"
                placeholder="1000"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-on-surface-variant">Anlık Stok (kg)</label>
              <input
                value={formOutStock}
                onChange={(e) => setFormOutStock(e.target.value)}
                type="number"
                required
                className="bg-surface border border-border-color rounded-xl p-3 text-sm text-on-surface focus:outline-none focus:border-accent-mint"
                placeholder="1000"
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
            {editingOutput ? "Değişiklikleri Kaydet" : "Atık Kaydet ve Vektörleştir"}
          </button>
        </form>
      </div>
    </div>
  );
}
