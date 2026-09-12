"use client";

import React, { useState } from "react";
import styles from "./SettingsView.module.css";
import { FacilityMe } from "../../lib/api";

interface SettingsViewProps {
  userEmail: string;
  facility: FacilityMe | null;
  onUpdateAccount: (dto: { email?: string; password?: string }) => Promise<void>;
  onUpdateFacility: (dto: { name?: string; sector?: string }) => Promise<void>;
  onDeleteAccount: () => Promise<void>;
}

export default function SettingsView({
  userEmail,
  facility,
  onUpdateAccount,
  onUpdateFacility,
  onDeleteAccount,
}: SettingsViewProps) {
  const [email, setEmail] = useState(userEmail);
  const [password, setPassword] = useState("");
  const [savingAccount, setSavingAccount] = useState(false);

  const [facilityName, setFacilityName] = useState(facility?.name ?? "");
  const [sector, setSector] = useState(facility?.sector ?? "");
  const [savingFacility, setSavingFacility] = useState(false);

  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // userEmail/facility ilk render'da boş gelip birer async çağrı sonrasında doluyor
  // (page.tsx'in authApi.me/facilitiesApi.getMe'si) -- bu yüzden gelen değeri render
  // sırasında önceki değerle karşılaştırıp gerekirse senkronize ediyoruz (React'in
  // "adjusting state when a prop changes" kalıbı) bir useEffect yerine; aksi halde
  // React Compiler lint kuralı effect içinde setState'i engelliyor (bkz. DashboardView'daki
  // benzer düzeltme).
  const [prevUserEmail, setPrevUserEmail] = useState(userEmail);
  if (userEmail !== prevUserEmail) {
    setPrevUserEmail(userEmail);
    setEmail(userEmail);
  }
  const [prevFacility, setPrevFacility] = useState(facility);
  if (facility !== prevFacility) {
    setPrevFacility(facility);
    setFacilityName(facility?.name ?? "");
    setSector(facility?.sector ?? "");
  }

  const accountDirty = email.trim() !== userEmail || password.trim().length > 0;
  const facilityDirty = facilityName.trim() !== (facility?.name ?? "") || sector.trim() !== (facility?.sector ?? "");

  const handleAccountSave = async () => {
    if (!accountDirty) return;
    setSavingAccount(true);
    try {
      const dto: { email?: string; password?: string } = {};
      if (email.trim() !== userEmail) dto.email = email.trim();
      if (password.trim().length > 0) dto.password = password.trim();
      await onUpdateAccount(dto);
      setPassword("");
    } finally {
      setSavingAccount(false);
    }
  };

  const handleFacilitySave = async () => {
    if (!facilityDirty) return;
    setSavingFacility(true);
    try {
      const dto: { name?: string; sector?: string } = {};
      if (facilityName.trim() !== (facility?.name ?? "")) dto.name = facilityName.trim();
      if (sector.trim() !== (facility?.sector ?? "")) dto.sector = sector.trim();
      await onUpdateFacility(dto);
    } finally {
      setSavingFacility(false);
    }
  };

  const handleDeleteConfirmed = async () => {
    setDeleting(true);
    try {
      await onDeleteAccount();
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className={styles.container}>
      {/* --- HESAP BİLGİLERİ --- */}
      <div className="glass-panel p-6 rounded-2xl flex flex-col gap-5">
        <div>
          <h3 className="font-title font-bold text-on-surface text-base">Hesap Bilgileri</h3>
          <p className="text-xs text-on-surface-variant mt-1">
            E-posta adresinizi veya şifrenizi güncelleyin. Şifre alanını boş bırakırsanız mevcut şifreniz korunur.
          </p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-on-surface-variant">E-posta</label>
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              type="email"
              className="bg-surface border border-border-color rounded-xl p-3 text-sm text-on-surface focus:outline-none focus:border-accent-mint"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-on-surface-variant">Yeni Şifre</label>
            <input
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              type="password"
              placeholder="Değiştirmek için doldurun"
              className="bg-surface border border-border-color rounded-xl p-3 text-sm text-on-surface focus:outline-none focus:border-accent-mint"
            />
          </div>
        </div>
        <div className="flex justify-end">
          <button
            onClick={handleAccountSave}
            disabled={!accountDirty || savingAccount}
            className="btn-primary px-6 py-2.5 rounded-xl text-xs font-bold disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
          >
            {savingAccount ? "Kaydediliyor..." : "Hesap Bilgilerini Kaydet"}
          </button>
        </div>
      </div>

      {/* --- TESİS / KURUM BİLGİLERİ --- */}
      {facility && (
        <div className="glass-panel p-6 rounded-2xl flex flex-col gap-5">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <h3 className="font-title font-bold text-on-surface text-base">Tesis / Kurum Bilgileri</h3>
              <p className="text-xs text-on-surface-variant mt-1">Vergi numarası ve doğrulama durumu değiştirilemez.</p>
            </div>
            <span className={`status-label shrink-0 ${facility.verified ? "text-accent-mint" : "text-amber-700"}`}>
              {facility.verified ? "Doğrulandı" : "Doğrulama Bekliyor"}
            </span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-on-surface-variant">Tesis / Kurum Adı</label>
              <input
                value={facilityName}
                onChange={(e) => setFacilityName(e.target.value)}
                type="text"
                className="bg-surface border border-border-color rounded-xl p-3 text-sm text-on-surface focus:outline-none focus:border-accent-mint"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-on-surface-variant">Sektör</label>
              <input
                value={sector}
                onChange={(e) => setSector(e.target.value)}
                type="text"
                className="bg-surface border border-border-color rounded-xl p-3 text-sm text-on-surface focus:outline-none focus:border-accent-mint"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-on-surface-variant">Vergi No</label>
              <input
                value={facility.taxId}
                disabled
                type="text"
                className="bg-surface-light border border-border-color rounded-xl p-3 text-sm text-on-surface-variant cursor-not-allowed"
              />
            </div>
          </div>
          <div className="flex justify-end">
            <button
              onClick={handleFacilitySave}
              disabled={!facilityDirty || savingFacility}
              className="btn-primary px-6 py-2.5 rounded-xl text-xs font-bold disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
            >
              {savingFacility ? "Kaydediliyor..." : "Tesis Bilgilerini Kaydet"}
            </button>
          </div>
        </div>
      )}

      {/* --- TEHLİKELİ BÖLGE --- */}
      <div className="glass-panel p-6 rounded-2xl flex flex-col gap-4 border-rose-500/20">
        <div>
          <h3 className="font-title font-bold text-rose-600 text-base">Tehlikeli Bölge</h3>
          <p className="text-xs text-on-surface-variant mt-1">
            Hesabınızı sildiğinizde tüm oturumlarınız kapatılır ve bu işlem geri alınamaz.
          </p>
        </div>
        {!confirmingDelete ? (
          <div>
            <button
              onClick={() => setConfirmingDelete(true)}
              className="px-4 py-2.5 rounded-xl text-xs font-bold text-rose-600 bg-rose-500/10 border border-rose-500/20 hover:bg-rose-500/15 transition-all cursor-pointer"
            >
              Hesabımı Sil
            </button>
          </div>
        ) : (
          <div className={styles.deleteConfirm}>
            <p className="text-xs font-semibold text-rose-700">
              Emin misiniz? Bu işlem hesabınızı ve bağlı verileri kalıcı olarak siler.
            </p>
            <div className="flex gap-2">
              <button
                onClick={handleDeleteConfirmed}
                disabled={deleting}
                className="px-4 py-2 rounded-xl text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 disabled:opacity-50 transition-all cursor-pointer"
              >
                {deleting ? "Siliniyor..." : "Evet, Kalıcı Olarak Sil"}
              </button>
              <button
                onClick={() => setConfirmingDelete(false)}
                disabled={deleting}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-on-surface-variant bg-surface-light border border-border-color hover:text-on-surface transition-all cursor-pointer"
              >
                Vazgeç
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
