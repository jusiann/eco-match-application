"use client";

import React, { useEffect, useState } from "react";
import styles from "./Modal.module.css";
import { authApi, osbsApi, ApiError, OsbRow } from "../../lib/api";
import { saveAccessToken, ROLE_MAP } from "../../lib/session";

type AuthMode = "login" | "register";

interface AuthModalProps {
  isOpen: boolean;
  role: "user" | "osb" | "admin";
  onClose: () => void;
  onAuthComplete: (role: "user" | "osb" | "admin") => void;
}

export default function AuthModal({ isOpen, role, onClose, onAuthComplete }: AuthModalProps) {
  const [mode, setMode] = useState<AuthMode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [facilityName, setFacilityName] = useState("");
  const [taxId, setTaxId] = useState("");
  const [sector, setSector] = useState("");
  const [contactName, setContactName] = useState("");
  const [phone, setPhone] = useState("");
  const [osbId, setOsbId] = useState("");
  const [osbs, setOsbs] = useState<OsbRow[]>([]);
  const [lat, setLat] = useState("");
  const [lng, setLng] = useState("");
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (mode !== "register" || osbs.length > 0) return;
    osbsApi.list().then(setOsbs).catch(() => {});
  }, [mode, osbs.length]);

  if (!isOpen) return null;

  const roleLabel = role === "osb" ? "OSB Yönetim Paneli" : role === "admin" ? "Sistem Admin Paneli" : "Tesis Paneli";

  const resetAndClose = () => {
    setMode("login");
    setEmail("");
    setPassword("");
    setFacilityName("");
    setTaxId("");
    setSector("");
    setContactName("");
    setPhone("");
    setOsbId("");
    setLat("");
    setLng("");
    setError("");
    setLoading(false);
    onClose();
  };

  const handleUseMyLocation = () => {
    if (!navigator.geolocation) {
      setError("Tarayıcınız konum servisini desteklemiyor. Enlem/boylamı elle girin.");
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLat(pos.coords.latitude.toFixed(6));
        setLng(pos.coords.longitude.toFixed(6));
        setLocating(false);
      },
      () => {
        setError("Konum alınamadı. Enlem/boylamı elle girebilirsiniz.");
        setLocating(false);
      }
    );
  };

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      setError("E-posta ve şifre alanları zorunludur.");
      return;
    }
    setError("");
    setLoading(true);
    try {
      const res = await authApi.login({ email, password });
      saveAccessToken(res.access_token);
      onAuthComplete(ROLE_MAP[res.user.role]);
      resetAndClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Giriş yapılamadı. Lütfen tekrar deneyin.");
      setLoading(false);
    }
  };

  const handleRegisterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!facilityName || !taxId || !sector || !email || !password || !contactName || !phone) {
      setError("Tüm zorunlu alanları doldurunuz.");
      return;
    }
    if (!lat || !lng) {
      setError("Tesis konumu (enlem/boylam) zorunludur. \"Konumumu Kullan\" ile otomatik doldurabilirsiniz.");
      return;
    }
    setError("");
    setLoading(true);
    try {
      const res = await authApi.register({
        name: facilityName,
        taxId,
        sector,
        email,
        password,
        contactName,
        phone,
        osbId: osbId || undefined,
        location: { lat: parseFloat(lat), lng: parseFloat(lng) },
      });
      saveAccessToken(res.access_token);
      onAuthComplete(ROLE_MAP[res.user.role]);
      resetAndClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Kayıt tamamlanamadı. Lütfen tekrar deneyin.");
      setLoading(false);
    }
  };

  return (
    <div className={styles.backdrop}>
      <div className={`${styles.modalContent} glass-panel`}>
        <div className="flex justify-between items-center">
          <div>
            <h3 className="font-title font-bold text-lg text-on-surface">
              {mode === "login" && "Giriş Yap"}
              {mode === "register" && "Yeni Tesis Kaydı"}
            </h3>
            <p className="text-[10px] text-on-surface-variant mt-0.5">{roleLabel}</p>
          </div>
          <button onClick={resetAndClose} className="text-on-surface-variant hover:text-on-surface cursor-pointer">
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        {mode === "login" && (
          <form onSubmit={handleLoginSubmit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-on-surface-variant">E-posta</label>
              <input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                type="email"
                className="bg-surface border border-border-color rounded-xl p-3 text-sm text-on-surface focus:outline-none focus:border-accent-mint"
                placeholder="tesis@ornek.com"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-on-surface-variant">Şifre</label>
              <input
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                type="password"
                className="bg-surface border border-border-color rounded-xl p-3 text-sm text-on-surface focus:outline-none focus:border-accent-mint"
                placeholder="••••••••"
              />
            </div>
            {error && <p className="text-xs text-rose-600">{error}</p>}
            <button
              type="submit"
              disabled={loading}
              className="btn-primary w-full py-3.5 rounded-xl font-bold text-sm cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? "Giriş yapılıyor..." : "Giriş Yap"}
            </button>
            {role !== "admin" && (
              <div className="flex justify-center text-[11px] text-on-surface-variant">
                <button
                  type="button"
                  onClick={() => {
                    setError("");
                    setMode("register");
                  }}
                  className="hover:text-accent-mint cursor-pointer"
                >
                  Yeni Tesis mi kaydolacaksınız?
                </button>
              </div>
            )}
          </form>
        )}

        {mode === "register" && (
          <form onSubmit={handleRegisterSubmit} className="flex flex-col gap-4 max-h-[65vh] overflow-y-auto pr-1">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-on-surface-variant">Tesis Adı</label>
              <input
                value={facilityName}
                onChange={(e) => setFacilityName(e.target.value)}
                type="text"
                className="bg-surface border border-border-color rounded-xl p-3 text-sm text-on-surface focus:outline-none focus:border-accent-mint"
                placeholder="Örn: Gebze Metal A.Ş."
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-on-surface-variant">Vergi Numarası (10 hane)</label>
                <input
                  value={taxId}
                  onChange={(e) => setTaxId(e.target.value)}
                  type="text"
                  maxLength={10}
                  className="bg-surface border border-border-color rounded-xl p-3 text-sm text-on-surface focus:outline-none focus:border-accent-mint"
                  placeholder="1234567890"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-on-surface-variant">Sektör</label>
                <input
                  value={sector}
                  onChange={(e) => setSector(e.target.value)}
                  type="text"
                  className="bg-surface border border-border-color rounded-xl p-3 text-sm text-on-surface focus:outline-none focus:border-accent-mint"
                  placeholder="Örn: metal"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-on-surface-variant">Yetkili Adı</label>
                <input
                  value={contactName}
                  onChange={(e) => setContactName(e.target.value)}
                  type="text"
                  className="bg-surface border border-border-color rounded-xl p-3 text-sm text-on-surface focus:outline-none focus:border-accent-mint"
                  placeholder="Aylin Yıldız"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-on-surface-variant">Telefon</label>
                <input
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  type="tel"
                  className="bg-surface border border-border-color rounded-xl p-3 text-sm text-on-surface focus:outline-none focus:border-accent-mint"
                  placeholder="+90 5xx xxx xx xx"
                />
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-on-surface-variant">OSB (opsiyonel)</label>
              <select
                value={osbId}
                onChange={(e) => setOsbId(e.target.value)}
                className="bg-surface border border-border-color rounded-xl p-3 text-sm text-on-surface focus:outline-none focus:border-accent-mint"
              >
                <option value="">Seçilmedi</option>
                {osbs.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name} ({o.city})
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-on-surface-variant">Tesis Konumu</label>
                <button
                  type="button"
                  onClick={handleUseMyLocation}
                  disabled={locating}
                  className="text-[11px] font-semibold text-accent-mint hover:underline cursor-pointer disabled:opacity-50"
                >
                  {locating ? "Alınıyor..." : "Konumumu Kullan"}
                </button>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <input
                  value={lat}
                  onChange={(e) => setLat(e.target.value)}
                  type="text"
                  inputMode="decimal"
                  className="bg-surface border border-border-color rounded-xl p-3 text-sm text-on-surface focus:outline-none focus:border-accent-mint"
                  placeholder="Enlem (lat) — Örn: 40.19"
                />
                <input
                  value={lng}
                  onChange={(e) => setLng(e.target.value)}
                  type="text"
                  inputMode="decimal"
                  className="bg-surface border border-border-color rounded-xl p-3 text-sm text-on-surface focus:outline-none focus:border-accent-mint"
                  placeholder="Boylam (lng) — Örn: 29.02"
                />
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-on-surface-variant">E-posta</label>
              <input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                type="email"
                className="bg-surface border border-border-color rounded-xl p-3 text-sm text-on-surface focus:outline-none focus:border-accent-mint"
                placeholder="tesis@ornek.com"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-on-surface-variant">Şifre</label>
              <input
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                type="password"
                className="bg-surface border border-border-color rounded-xl p-3 text-sm text-on-surface focus:outline-none focus:border-accent-mint"
                placeholder="En az 8 karakter, büyük/küçük harf ve rakam"
              />
            </div>
            {error && <p className="text-xs text-rose-600">{error}</p>}
            <button
              type="submit"
              disabled={loading}
              className="btn-primary w-full py-3.5 rounded-xl font-bold text-sm cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? "Kaydediliyor..." : "Kaydı Tamamla"}
            </button>
            <button
              type="button"
              onClick={() => {
                setError("");
                setMode("login");
              }}
              className="text-[11px] text-on-surface-variant hover:text-accent-mint cursor-pointer self-center"
            >
              Zaten hesabınız var mı? Giriş Yapın
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
