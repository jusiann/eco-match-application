"use client";

import React, { useEffect, useState, useSyncExternalStore } from "react";
import {
  authApi,
  materialsApi,
  matchesApi,
  adminApi,
  reviewQueueApi,
  notificationsApi,
  osbDashboardApi,
  healthApi,
  facilitiesApi,
  ApiError,
  OutputRow,
  InputRow,
  MatchRow,
  NotificationRow,
  AdminUserRow,
  ReviewQueueRow,
  FacilityVerificationRow,
  OsbStats,
  OsbFacilityRow,
  OsbMapResponse,
  ApiKeyRow,
  FacilityMe,
  FacilityDocumentRow,
  CarbonFactorRow,
} from "@/lib/api";
import { getAccessToken, saveAccessToken, clearTokens, ROLE_MAP } from "@/lib/session";
import { useToast } from "@/components/Toast/ToastProvider";
import { connectNotificationsSocket, disconnectNotificationsSocket, NotificationSocketEvent } from "@/lib/notificationsSocket";
import {
  OutputItem,
  InputItem,
  MatchCandidate,
  ChatMessage,
  OSBVerification,
  AppNotification,
  PlatformUser,
  ReviewQueueItem,
  WeightsConfig,
} from "@/types";

// Import Views
import LandingView from "@/components/LandingView/LandingView";
import Sidebar from "@/components/Sidebar/Sidebar";
import Header from "@/components/Header/Header";
import DashboardView from "@/components/DashboardView/DashboardView";
import MaterialsView from "@/components/MaterialsView/MaterialsView";
import MatchmakerView from "@/components/MatchmakerView/MatchmakerView";
import ReportsView from "@/components/ReportsView/ReportsView";
import ChatbotView from "@/components/ChatbotView/ChatbotView";
import OsbView from "@/components/OsbView/OsbView";
import AdminView, { AuditLogRow } from "@/components/AdminView/AdminView";
import SettingsView from "@/components/SettingsView/SettingsView";
import ChatWidget from "@/components/ChatWidget/ChatWidget";
import PassportView from "@/components/PassportView/PassportView";

// Import Modals
import AddOutputModal from "@/components/Modals/AddOutputModal";
import AddInputModal from "@/components/Modals/AddInputModal";
import DppModal from "@/components/Modals/DppModal";
import SuccessModal from "@/components/Modals/SuccessModal";

type UserRole = "user" | "osb" | "admin" | "none";
type Page = "landing" | "dashboard" | "materials" | "matchmaker" | "reports" | "chatbot" | "osb" | "admin" | "settings";

// ── DPP QR kodunun hedefi: /dpp/<passportId>?sig=<hmac> ──────────────────────
// next.config.ts `output: "export"` kullandığı için dinamik bir route segmenti
// (app/dpp/[id]) generateStaticParams olmadan üretilemiyor -- pasaport id'leri
// derleme anında bilinemez. Bunun yerine nginx bilinmeyen yolları index.html'e
// düşürüyor (SPA fallback) ve yol burada istemci tarafında ele alınıyor.
//
// Konum, prerender edilmiş HTML ile istemcinin ilk render'ı arasında hidrasyon
// uyuşmazlığı yaratmasın diye useSyncExternalStore ile okunuyor: sunucu anlık
// görüntüsü boş string, istemci anlık görüntüsü gerçek URL.
const subscribeToLocation = (onChange: () => void) => {
  window.addEventListener("popstate", onChange);
  return () => window.removeEventListener("popstate", onChange);
};
const getLocationSnapshot = () => `${window.location.pathname}${window.location.search}`;
const getServerLocationSnapshot = () => "";

const DPP_PATH_PATTERN = /^\/dpp\/([^/?#]+)\/?$/;

function parsePassportRoute(locationString: string): { passportId: string; sig: string } | null {
  if (!locationString) return null;
  const [pathname, search = ""] = locationString.split("?");
  const match = DPP_PATH_PATTERN.exec(pathname);
  if (!match) return null;
  return { passportId: decodeURIComponent(match[1]), sig: new URLSearchParams(search).get("sig") ?? "" };
}

const nowStamp = () =>
  new Date().toLocaleString("tr-TR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });

const formatStamp = (iso: string | null) => {
  if (!iso) return nowStamp();
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return nowStamp();
  return d.toLocaleString("tr-TR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
};

// "Al %95, Fe %2" gibi serbest metinleri {Al: 95, Fe: 2} şekline çeviren, elden geldiğince
// doğru çalışan bir ayrıştırıcı (CreateOutputDto.composition alanı için). AddOutputModal
// yalnızca tek bir serbest metin alanı topladığından (yapılandırılmış bir kompozisyon
// tablosu değil), bu kesin doğruluk garantisi olmayan bir sezgisel ayrıştırmadır.
function parseComposition(text: string): Record<string, number> | undefined {
  const result: Record<string, number> = {};
  for (const part of text.split(",")) {
    const match = part.match(/([A-Za-zÇĞİÖŞÜçğıöşü]+)\s*%?\s*(\d+(?:\.\d+)?)/);
    if (match) result[match[1].trim()] = Number(match[2]);
  }
  return Object.keys(result).length > 0 ? result : undefined;
}

// ── Backend satırlarını frontend view-model'lerine çeviren mapper'lar ──────────────────────────

function mapOutput(o: OutputRow): OutputItem {
  return {
    id: o.id,
    name: o.description,
    class: (o.materialClass ?? "BELİRSİZ").toUpperCase(),
    quantity: Number(o.quantityKg),
    stock: Number(o.stock),
    composition: o.composition ? Object.entries(o.composition).map(([k, v]) => `${k} %${v}`).join(", ") : "-",
    date: (o.createdAt ?? "").slice(0, 10),
    dppId: null, // list endpoint pasaport ilişkisini içermiyor, bkz. types.ts notu
    qrCode: null,
    pdfUrl: null,
  };
}

function mapInput(i: InputRow): InputItem {
  return {
    id: i.id,
    name: i.description,
    class: (i.materialClass ?? "BELİRSİZ").toUpperCase(),
    quantity: Number(i.quantityKg),
    frequency: i.frequency ?? "-",
    specs: i.specs ? JSON.stringify(i.specs) : "-",
    date: (i.createdAt ?? "").slice(0, 10),
  };
}

function mapMatch(m: MatchRow): MatchCandidate {
  return {
    id: m.id,
    name: m.counterparty.osbName ?? m.counterparty.sectorLabel ?? "Bilinmeyen Tesis",
    sectorLabel: m.counterparty.sectorLabel ?? "Bilinmiyor",
    score: m.totalScore,
    distanceKm: m.distanceKm ?? null,
    destinationLocation: m.counterparty.approximateLocation ?? null,
    co2: m.co2Saved !== null ? Number(m.co2Saved) : 0,
    savings: m.cbamImpact !== null ? Number(m.cbamImpact) : 0,
    status: (m.status.toLowerCase() as MatchCandidate["status"]) ?? "pending",
    viewerAccepted: m.viewerAccepted,
    date: (m.createdAt ?? "").slice(0, 10),
    details: {
      material: m.breakdown?.material ?? 0,
      quality: m.breakdown?.quality ?? 0,
      env: m.breakdown?.environmental ?? 0,
      logistics: m.breakdown?.logistics ?? 0,
      economic: m.breakdown?.economic ?? 0,
    },
  };
}

function mapNotification(n: NotificationRow): AppNotification {
  return {
    id: n.id,
    type: n.type,
    title: n.title,
    body: n.body ?? "",
    read: n.readAt !== null,
    createdAt: formatStamp(n.createdAt),
  };
}

function mapSocketNotification(n: NotificationSocketEvent): AppNotification {
  return {
    id: n.id,
    type: n.type,
    title: n.title,
    body: n.body ?? "",
    read: false,
    createdAt: formatStamp(n.created_at),
  };
}

function mapUser(u: AdminUserRow): PlatformUser {
  return {
    id: u.id,
    name: u.contactName ?? u.email,
    email: u.email,
    role: u.role,
    facility: u.facilityId,
  };
}

function mapReviewQueueRow(r: ReviewQueueRow): ReviewQueueItem {
  return {
    id: r.id,
    matchName: r.output?.description ?? "Bilinmeyen Kayıt",
    confidence: Number(r.confidence),
    reason: r.reason,
    status: r.status.toLowerCase() as ReviewQueueItem["status"],
  };
}

function mapVerification(v: FacilityVerificationRow): OSBVerification {
  return {
    id: v.id,
    name: v.facility.name,
    sector: v.facility.sector,
    status: v.status.toLowerCase() as OSBVerification["status"],
  };
}

export default function Home() {
  // DPP QR kodundan gelindiyse (/dpp/<id>?sig=...) uygulamanın tamamı yerine
  // herkese açık pasaport sayfası gösterilir -- bkz. parsePassportRoute.
  const locationString = useSyncExternalStore(subscribeToLocation, getLocationSnapshot, getServerLocationSnapshot);
  const passportRoute = parsePassportRoute(locationString);
  const { showToast } = useToast();

  // --- CORE ROUTING STATE ---
  const [currentPage, setCurrentPage] = useState<Page>("landing");
  const [userRole, setUserRole] = useState<UserRole>("none");
  const [currentMaterialTab, setCurrentMaterialTab] = useState<"outputs" | "inputs">("outputs");
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // --- GERÇEK BACKEND'DEN BESLENEN STATE (aşağıdaki useEffect ile çekilir, eski mock dizilerin yerini alır) ---
  const [userEmail, setUserEmail] = useState("");
  const [facility, setFacility] = useState<FacilityMe | null>(null);
  const [facilityDocuments, setFacilityDocuments] = useState<FacilityDocumentRow[]>([]);
  const [outputs, setOutputs] = useState<OutputItem[]>([]);
  const [inputs, setInputs] = useState<InputItem[]>([]);
  const [matches, setMatches] = useState<MatchCandidate[]>([]);
  const [selectedMatchId, setSelectedMatchId] = useState<string>("");

  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([
    {
      role: "assistant",
      content:
        "Merhaba! EcoMatch AI Sürdürülebilirlik Asistanıyım. Sınırda Karbon Düzenleme Mekanizması (SKDM - CBAM), Dijital Ürün Pasaportları (DPP) veya atık kodları hakkındaki sorularınızı cevaplayabilirim.",
    },
  ]);
  const [chatIsTyping, setChatIsTyping] = useState(false);

  // Doğrulama listesi yalnızca ADMIN tarafından çekilir (/admin/verifications,
  // admin.controller.ts @Roles(ADMIN)) ve AdminView'in "Tesis Doğrulamaları" sekmesinde
  // gösterilir -- OSB_MANAGER bu uca hiç erişemediği için (403) OsbView artık bu listeyi
  // kullanmıyor, sadece salt-okunur "Bölge Tesisleri" tablosunu gösteriyor.
  const [osbVerificationList, setOsbVerificationList] = useState<OSBVerification[]>([]);
  const [osbStats, setOsbStats] = useState<OsbStats | null>(null);
  const [osbFacilities, setOsbFacilities] = useState<OsbFacilityRow[]>([]);
  const [osbMap, setOsbMap] = useState<OsbMapResponse | null>(null);

  // --- SİSTEM SAĞLIĞI (H2) -- /health/ready periyodik kontrol, DB/AI/Redis erişilemezse banner ---
  const [systemDown, setSystemDown] = useState(false);

  // --- CANLI BİLDİRİM SOKETİNİN GERÇEK DURUMU (Header rozetini besler) ---
  const [socketConnected, setSocketConnected] = useState(false);

  // --- NOTIFICATIONS STATE ---
  const [notifications, setNotifications] = useState<AppNotification[]>([]);

  // --- ADMIN STATE ---
  const [platformUsers, setPlatformUsers] = useState<PlatformUser[]>([]);
  const [reviewQueue, setReviewQueue] = useState<ReviewQueueItem[]>([]);
  const [apiKeys, setApiKeys] = useState<ApiKeyRow[]>([]);
  const [carbonFactors, setCarbonFactors] = useState<CarbonFactorRow[]>([]);
  const [systemConfig, setSystemConfig] = useState<Record<string, unknown>>({});
  const [auditLog, setAuditLog] = useState<AuditLogRow[]>([]);
  const [auditLogPage, setAuditLogPage] = useState(1);
  const [auditLogTotalPages, setAuditLogTotalPages] = useState(1);

  // GET/POST /v1/admin/weights + POST .../:id/activate gerçek uçlar (Faz 3.5) --
  // aşağıdaki veri yükleme useEffect'i aktif versiyonu çekip bunu günceller; bu
  // sadece ilk boyama için varsayılan/yer tutucu değer.
  const [weights, setWeights] = useState<WeightsConfig>({
    material: 30,
    quality: 20,
    environmental: 20,
    logistics: 15,
    economic: 15,
  });

  // --- MODALS STATE ---
  const [showOutputModal, setShowOutputModal] = useState(false);
  const [showInputModal, setShowInputModal] = useState(false);
  const [editingOutput, setEditingOutput] = useState<OutputItem | null>(null);
  const [editingInput, setEditingInput] = useState<InputItem | null>(null);
  const [showDppModal, setShowDppModal] = useState(false);
  const [selectedDppOutput, setSelectedDppOutput] = useState<OutputItem | null>(null);
  const [showSuccessModal, setShowSuccessModal] = useState(false);

  // --- LOGIN / LOGOUT ---
  const handleLogin = (role: "user" | "osb" | "admin") => {
    setUserRole(role);
    if (role === "osb") {
      setCurrentPage("osb");
    } else if (role === "admin") {
      setCurrentPage("admin");
    } else {
      setCurrentPage("dashboard");
    }
  };

  // --- OTURUM GERİ YÜKLEME ---
  // Access token artık yalnızca 1 saat ömürlü ve refresh token httpOnly cookie'de
  // (K-18) -- localStorage'da hiç görünmüyor. Bu yüzden sayfa her açıldığında önce
  // sessizce /auth/refresh çağrılır (cookie credentials:'include' ile otomatik
  // taşınır); başarılıysa yeni access token saklanıp /auth/me ile oturum geri
  // yüklenir. Refresh de başarısızsa (cookie yok/süresi dolmuş) kullanıcı
  // landing'de kalır -- normal "giriş yapılmamış" durumu.
  useEffect(() => {
    authApi
      .refresh()
      .then((res) => {
        saveAccessToken(res.access_token);
        return authApi.me(res.access_token);
      })
      .then((res) => {
        setUserEmail(res.user.email);
        handleLogin(ROLE_MAP[res.user.role]);
      })
      .catch(() => {
        clearTokens();
      });
  }, []);

  // --- SİSTEM SAĞLIĞI (H2) -- DB/AI/Redis erişilemezse backend /health/ready 503 döner,
  // 500 değil (docs/04) -- istemci bunu "sistem geçici bakımda" banner'ı olarak gösterir.
  useEffect(() => {
    const check = () => healthApi.ready().then((res) => setSystemDown(!res.ok));
    check();
    const interval = setInterval(check, 60_000);
    return () => clearInterval(interval);
  }, []);

  // --- CANLI BİLDİRİMLER (WS /v1/notifications/stream, Socket.IO) ---
  useEffect(() => {
    if (userRole === "none") {
      disconnectNotificationsSocket();
      return;
    }
    const token = getAccessToken();
    if (!token) return;

    connectNotificationsSocket(
      token,
      (n) => setNotifications((prev) => (prev.some((existing) => existing.id === n.id) ? prev : [mapSocketNotification(n), ...prev])),
      () => {}, // rozet sayısı yerel listeden (unreadCount = notifications.filter(!read)) türetiliyor, ayrı bir state tutmuyoruz
      setSocketConnected
    );

    return () => {
      disconnectNotificationsSocket();
      setSocketConnected(false);
    };
  }, [userRole]);

  // --- VERİ YÜKLEME (giriş yapıldıktan sonra, /auth/me oturum geri yüklemesiyle aynı mantıkla) ---
  useEffect(() => {
    if (userRole === "none") return;
    const token = getAccessToken();
    if (!token) return;

    authApi.me(token).then((res) => setUserEmail(res.user.email)).catch(() => {});
    facilitiesApi.getMe(token).then(setFacility).catch(() => {});
    facilitiesApi
      .listDocuments(token)
      .then((res) => setFacilityDocuments(res.documents))
      .catch(() => {});

    materialsApi
      .listOutputs(token)
      .then((res) => setOutputs(res.data.map(mapOutput)))
      .catch(() => {});

    materialsApi
      .listInputs(token)
      .then((res) => setInputs(res.data.map(mapInput)))
      .catch(() => {});

    matchesApi
      .list(token)
      .then((res) => {
        const mapped = res.data.map(mapMatch);
        setMatches(mapped);
        setSelectedMatchId((prev) => prev || mapped[0]?.id || "");
      })
      .catch(() => {});

    notificationsApi
      .list(token)
      .then((res) => setNotifications(res.data.map(mapNotification)))
      .catch(() => {});

    if (userRole === "admin") {
      adminApi
        .listVerifications(token)
        .then((res) => setOsbVerificationList(res.map(mapVerification)))
        .catch(() => {});
    }

    if (userRole === "osb") {
      osbDashboardApi.stats(token).then(setOsbStats).catch(() => {});
      osbDashboardApi
        .facilities(token)
        .then((res) => setOsbFacilities(res.data))
        .catch(() => {});
      osbDashboardApi.map(token).then(setOsbMap).catch(() => {});
    }

    if (userRole === "admin") {
      adminApi
        .listUsers(token)
        .then((res) => setPlatformUsers(res.data.map(mapUser)))
        .catch(() => {});

      reviewQueueApi
        .list(token)
        .then((res) => setReviewQueue(res.data.map(mapReviewQueueRow)))
        .catch(() => {});

      adminApi
        .listApiKeys(token)
        .then((res) => setApiKeys(res.data))
        .catch(() => {});

      adminApi
        .listWeights(token)
        .then((rows) => {
          const active = rows.find((r) => r.active) ?? rows[0];
          if (!active) return;
          setWeights({
            material: Math.round(active.material * 100),
            quality: Math.round(active.quality * 100),
            environmental: Math.round(active.environmental * 100),
            logistics: Math.round(active.logistics * 100),
            economic: Math.round(active.economic * 100),
          });
        })
        .catch(() => {});

      adminApi.listCarbonFactors(token).then(setCarbonFactors).catch(() => {});
      adminApi.getConfig(token).then(setSystemConfig).catch(() => {});
      adminApi
        .listAuditLog(token, { page: 1, limit: 20 })
        .then((res) => {
          setAuditLog(res.data as unknown as AuditLogRow[]);
          setAuditLogPage(res.meta.page);
          setAuditLogTotalPages(res.meta.totalPages);
        })
        .catch(() => {});
    }
  }, [userRole]);

  // --- LOGOUT ---
  const handleLogout = () => {
    const token = getAccessToken();
    if (token) {
      authApi.logout(token).catch(() => {});
    }
    clearTokens();
    setUserRole("none");
    setCurrentPage("landing");
    setOutputs([]);
    setInputs([]);
    setMatches([]);
    setNotifications([]);
    setPlatformUsers([]);
    setReviewQueue([]);
    setOsbVerificationList([]);
    setOsbStats(null);
    setOsbFacilities([]);
    setOsbMap(null);
    setApiKeys([]);
    setFacility(null);
    setFacilityDocuments([]);
  };

  // --- HESAP AYARLARI (PUT /auth/update-profile, PATCH /facilities/me, DELETE /auth/delete-account) ---
  const handleUpdateAccount = async (dto: { email?: string; password?: string }) => {
    const token = getAccessToken();
    if (!token) return;
    try {
      await authApi.updateProfile(token, dto);
      if (dto.email) setUserEmail(dto.email);
      showToast("Hesap bilgileri güncellendi.", "success");
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : "Hesap bilgileri güncellenemedi. Lütfen tekrar deneyin.", "error");
    }
  };

  const handleUpdateFacility = async (dto: { name?: string; sector?: string }) => {
    const token = getAccessToken();
    if (!token) return;
    try {
      await facilitiesApi.updateMe(token, dto);
      const refreshed = await facilitiesApi.getMe(token);
      setFacility(refreshed);
      showToast("Tesis bilgileri güncellendi.", "success");
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : "Tesis bilgileri güncellenemedi. Lütfen tekrar deneyin.", "error");
    }
  };

  const handleDeleteAccount = async () => {
    const token = getAccessToken();
    if (!token) return;
    try {
      await authApi.deleteAccount(token);
      showToast("Hesabınız silindi.", "success");
      handleLogout();
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : "Hesap silinemedi. Lütfen tekrar deneyin.", "error");
    }
  };

  // --- TESİS DOĞRULAMA BELGESİ YÜKLEME (docs/04 Facilities) ---
  const handleUploadFacilityDocument = async (file: File, documentType: "tax_certificate" | "operating_permit") => {
    const token = getAccessToken();
    if (!token) return;
    try {
      await facilitiesApi.uploadDocument(token, file, documentType);
      const res = await facilitiesApi.listDocuments(token);
      setFacilityDocuments(res.documents);
      showToast("Belge yüklendi, inceleme bekleniyor.", "success");
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : "Belge yüklenemedi. Lütfen tekrar deneyin.", "error");
    }
  };

  // --- BİLDİRİM İŞLEYİCİLERİ ---
  // Yalnızca yerel, iyimser (optimistic) UI geri bildirimi -- backend, eşleşme kabul/red
  // veya tesis doğrulama olayları için kalıcı bir Notification satırı OLUŞTURMUYOR (ne
  // matches.service.ts ne de admin.service.ts bu olaylarda NotificationsService.create'i
  // çağırıyor), yani bu hiçbir zaman sunucuya gitmiyor. Sadece anlık, oturum içi bir
  // geri bildirim sağlıyor.
  const pushNotification = (notification: Omit<AppNotification, "id" | "read" | "createdAt">) => {
    setNotifications((prev) => [
      { ...notification, id: `local-${prev.length + 1}-${Date.now()}`, read: false, createdAt: nowStamp() },
      ...prev,
    ]);
  };

  const handleMarkNotificationRead = (id: string) => {
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));
    if (id.startsWith("local-")) return;
    const token = getAccessToken();
    if (token) notificationsApi.markRead(token, id).catch(() => {});
  };

  const handleMarkAllNotificationsRead = () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    const token = getAccessToken();
    if (token) notificationsApi.markAllRead(token).catch(() => {});
  };

  // --- FORM HANDLERS ---
  const handleAddOutputSubmit = async (
    name: string,
    classVal: string,
    comp: string,
    qty: number,
    stock: number
  ) => {
    const token = getAccessToken();
    if (!token) return;
    try {
      const res = await materialsApi.createOutput(token, {
        description: name,
        materialClass: classVal.toLowerCase(),
        composition: parseComposition(comp),
        quantityKg: qty,
        stock,
      });

      const newItem: OutputItem = {
        id: res.outputId,
        name,
        class: classVal,
        composition: comp,
        quantity: qty,
        stock,
        date: new Date().toISOString().split("T")[0],
        dppId: res.passportId,
        qrCode: res.qrCode,
        pdfUrl: res.pdfUrl,
      };

      setOutputs((prev) => [newItem, ...prev]);
      setShowOutputModal(false);
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : "Çıktı kaydedilemedi. Lütfen tekrar deneyin.", "error");
    }
  };

  const handleAddInputSubmit = async (
    name: string,
    classVal: string,
    freq: string,
    qty: number,
    specs: string
  ) => {
    const token = getAccessToken();
    if (!token) return;
    try {
      const res = await materialsApi.createInput(token, {
        description: name,
        materialClass: classVal.toLowerCase(),
        specs: { raw: specs },
        quantityKg: qty,
        frequency: freq,
      });

      const itemToAdd: InputItem = {
        id: res.inputId,
        name,
        class: classVal,
        frequency: freq,
        quantity: qty,
        specs,
        date: new Date().toISOString().split("T")[0],
      };

      setInputs((prev) => [itemToAdd, ...prev]);
      setShowInputModal(false);
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : "Girdi kaydedilemedi. Lütfen tekrar deneyin.", "error");
    }
  };

  // --- ÇIKTI/GİRDİ DÜZENLEME VE SİLME (PATCH/DELETE /materials/outputs|inputs/:id) ---
  const handleUpdateOutputSubmit = async (
    id: string,
    name: string,
    classVal: string,
    comp: string,
    qty: number,
    stock: number
  ) => {
    const token = getAccessToken();
    if (!token) return;
    try {
      await materialsApi.updateOutput(token, id, {
        description: name,
        materialClass: classVal.toLowerCase(),
        composition: parseComposition(comp),
        quantityKg: qty,
        stock,
      });
      setOutputs((prev) => prev.map((o) => (o.id === id ? { ...o, name, class: classVal, composition: comp, quantity: qty, stock } : o)));
      setShowOutputModal(false);
      setEditingOutput(null);
      showToast("Çıktı güncellendi.", "success");
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : "Çıktı güncellenemedi. Lütfen tekrar deneyin.", "error");
    }
  };

  const handleDeleteOutput = async (id: string) => {
    const token = getAccessToken();
    if (!token) return;
    try {
      await materialsApi.deleteOutput(token, id);
      setOutputs((prev) => prev.filter((o) => o.id !== id));
      showToast("Çıktı silindi.", "success");
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : "Çıktı silinemedi. Lütfen tekrar deneyin.", "error");
    }
  };

  const handleUpdateInputSubmit = async (
    id: string,
    name: string,
    classVal: string,
    freq: string,
    qty: number,
    specs: string
  ) => {
    const token = getAccessToken();
    if (!token) return;
    try {
      await materialsApi.updateInput(token, id, {
        description: name,
        materialClass: classVal.toLowerCase(),
        specs: { raw: specs },
        quantityKg: qty,
        frequency: freq,
      });
      setInputs((prev) => prev.map((i) => (i.id === id ? { ...i, name, class: classVal, frequency: freq, quantity: qty, specs } : i)));
      setShowInputModal(false);
      setEditingInput(null);
      showToast("Girdi güncellendi.", "success");
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : "Girdi güncellenemedi. Lütfen tekrar deneyin.", "error");
    }
  };

  const handleDeleteInput = async (id: string) => {
    const token = getAccessToken();
    if (!token) return;
    try {
      await materialsApi.deleteInput(token, id);
      setInputs((prev) => prev.filter((i) => i.id !== id));
      showToast("Girdi silindi.", "success");
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : "Girdi silinemedi. Lütfen tekrar deneyin.", "error");
    }
  };

  // --- CANLI EŞLEŞTİRME TETİKLEME (GET /matches/find/:outputId -- yan etki olarak PENDING
  // Match satırları oluşturur, bkz. api.ts#FindCandidatesResponse). Öncesinde bu uç hiçbir
  // yerden çağrılmıyordu: yeni bir çıktı oluşturmak asla eşleşme üretmiyordu, seed verisi
  // dışında eşleştirme akışı hiç test edilmemişti. ---
  const handleFindMatches = async (output: OutputItem) => {
    const token = getAccessToken();
    if (!token) return;
    try {
      const res = await matchesApi.find(token, output.id);
      if (res.error === "PENDING_EXPERT_REVIEW") {
        showToast(`"${output.name}" henüz sınıflandırılmadı, uzman incelemesi bekliyor.`, "info");
        return;
      }
      const count = res.matches?.length ?? 0;
      if (count === 0) {
        showToast(`"${output.name}" için uygun eşleşme adayı bulunamadı (benzerlik eşiği %60 altında).`, "info");
        return;
      }
      const refreshed = await matchesApi.list(token);
      const mapped = refreshed.data.map(mapMatch);
      setMatches(mapped);
      showToast(`${count} yeni eşleşme adayı bulundu.`, "success");
      setCurrentPage("matchmaker");
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : "Eşleştirme başlatılamadı. Lütfen tekrar deneyin.", "error");
    }
  };

  // --- MATCHMAKER ACTIONS ---
  const handleAcceptMatch = async () => {
    const token = getAccessToken();
    if (!token || !selectedMatchId) return;
    const match = matches.find((m) => m.id === selectedMatchId);
    try {
      const res = await matchesApi.accept(token, selectedMatchId);
      setMatches((prev) => prev.map((m) => (m.id === selectedMatchId ? { ...m, status: res.status } : m)));
      setShowSuccessModal(true);
      if (match) {
        pushNotification({
          type: "match_accepted",
          title: "Eşleşme kabul edildi",
          body: `${match.name} ile olan eşleştirme kabul edildi.`,
        });
      }
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : "Eşleşme kabul edilemedi. Lütfen tekrar deneyin.", "error");
    }
  };

  const handleRejectMatch = async (reasonCategory: string, reasonText: string) => {
    const token = getAccessToken();
    if (!token || !selectedMatchId) return;
    try {
      await matchesApi.reject(token, selectedMatchId, { reasonCategory, reasonText: reasonText || undefined });
      setMatches((prev) => prev.map((m) => (m.id === selectedMatchId ? { ...m, status: "rejected" } : m)));
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : "Eşleşme reddedilemedi. Lütfen tekrar deneyin.", "error");
    }
  };

  // A3: yalnızca süresi dolmuş (expired) eşleşmeler için -- backend eskisini expired
  // bırakıp aynı veriyle yeni bir 'pending' match (yeni id, yeni 30 günlük expires_at)
  // açıyor. Tam liste yeniden çekiliyor ki yeni kayıt (ve onun gerçek skor/CO2/CBAM'ı,
  // backend yeniden hesapladığı için seed'deki eski değerlerden farklı olabilir) görünsün.
  const handleRetryMatch = async () => {
    const token = getAccessToken();
    if (!token || !selectedMatchId) return;
    try {
      const res = await matchesApi.retry(token, selectedMatchId);
      const refreshed = await matchesApi.list(token);
      const mapped = refreshed.data.map(mapMatch);
      setMatches(mapped);
      setSelectedMatchId(res.matchId);
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : "Eşleşme yeniden talep edilemedi. Lütfen tekrar deneyin.", "error");
    }
  };

  const handleVerifyOsbFacility = async (id: string) => {
    const token = getAccessToken();
    if (!token) return;
    const facility = osbVerificationList.find((v) => v.id === id);
    try {
      await adminApi.approveVerification(token, id);
      setOsbVerificationList((prev) => prev.map((v) => (v.id === id ? { ...v, status: "approved" } : v)));
      if (facility) {
        pushNotification({
          type: "facility_verified",
          title: "Tesis doğrulandı",
          body: `${facility.name} tesisi başarıyla doğrulandı.`,
        });
      }
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : "Tesis doğrulanamadı. Lütfen tekrar deneyin.", "error");
    }
  };

  const handleRejectOsbFacility = async (id: string, reason: string) => {
    const token = getAccessToken();
    if (!token) return;
    const facility = osbVerificationList.find((v) => v.id === id);
    try {
      await adminApi.rejectVerification(token, id, reason);
      setOsbVerificationList((prev) => prev.map((v) => (v.id === id ? { ...v, status: "rejected" } : v)));
      if (facility) {
        pushNotification({
          type: "facility_verified",
          title: "Tesis doğrulaması reddedildi",
          body: `${facility.name} tesisinin doğrulama talebi reddedildi.`,
        });
      }
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : "Reddedilemedi. Lütfen tekrar deneyin.", "error");
    }
  };

  const handleCreateApiKey = async (name: string, userId: string): Promise<string | null> => {
    const token = getAccessToken();
    if (!token) return null;
    try {
      const res = await adminApi.createApiKey(token, { name, userId });
      const refreshed = await adminApi.listApiKeys(token);
      setApiKeys(refreshed.data);
      return res.key;
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : "API anahtarı üretilemedi. Lütfen tekrar deneyin.", "error");
      return null;
    }
  };

  const handleRevokeApiKey = async (id: string) => {
    const token = getAccessToken();
    if (!token) return;
    try {
      await adminApi.revokeApiKey(token, id);
      setApiKeys((prev) => prev.map((k) => (k.id === id ? { ...k, revokedAt: new Date().toISOString() } : k)));
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : "API anahtarı iptal edilemedi. Lütfen tekrar deneyin.", "error");
    }
  };

  const handleDownloadOsbMonthlyReport = (period: string, format: "pdf" | "xlsx"): void => {
    const token = getAccessToken();
    if (!token) return;
    osbDashboardApi
      .downloadMonthlyReport(token, period, format)
      .catch((err) =>
        showToast(err instanceof ApiError ? err.message : "Rapor indirilemedi. Lütfen tekrar deneyin.", "error")
      );
  };

  // --- ADMİN İŞLEMLERİ ---
  const handleRemoveUser = () => {
    // Backend yalnızca POST /admin/users ve PATCH /admin/users/:id'yi uyguluyor --
    // admin.controller.ts içinde hiçbir DELETE endpoint'i yok, yani kullanıcı "silme"
    // işleminin çağıracağı gerçek bir şey yok. Sahte bir silme davranışı yerine dürüstçe
    // gösteriliyor -- AuthModal'ın "şifremi unuttum" için kullandığı aynı yaklaşım
    // (o da backend'de henüz uygulanmamıştı).
    showToast("Kullanıcı silme işlevi backend'de henüz desteklenmiyor (DELETE /admin/users/:id mevcut değil).", "info");
  };

  const handleApproveReview = async (id: string) => {
    const token = getAccessToken();
    if (!token) return;
    const item = reviewQueue.find((r) => r.id === id);
    try {
      // ApproveReviewDto bir materialClass gerektiriyor, ancak AdminView'in review-queue
      // arayüzü yalnızca Onayla/Reddet butonları sunuyor (sınıf seçici yok) -- bu yüzden
      // detay endpoint'inden çekilen AI'ın kendi en iyi önerisi onaylanan sınıf olarak
      // kullanılıyor, yani "uzman AI'ın en iyi tahminini kabul ediyor". Gerçek bir sınıf
      // değiştirme arayüzü bu kapsamın dışında.
      const detail = await reviewQueueApi.detail(token, id);
      const top1 = detail.aiSuggestion?.[0]?.[0];
      if (!top1) {
        showToast("AI önerisi bulunamadı, bu kayıt otomatik onaylanamıyor.", "info");
        return;
      }
      await reviewQueueApi.approve(token, id, { materialClass: top1 });
      setReviewQueue((prev) => prev.map((r) => (r.id === id ? { ...r, status: "approved" } : r)));
      if (item) {
        pushNotification({
          type: "match_accepted",
          title: "Uzman onayı tamamlandı",
          body: `${item.matchName} kaydı "${top1}" olarak onaylandı.`,
        });
      }
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : "Onaylanamadı. Lütfen tekrar deneyin.", "error");
    }
  };

  const handleRejectReview = async (id: string) => {
    const token = getAccessToken();
    if (!token) return;
    try {
      await reviewQueueApi.reject(token, id, { notes: "Uzman tarafından reddedildi." });
      setReviewQueue((prev) => prev.map((r) => (r.id === id ? { ...r, status: "rejected" } : r)));
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : "Reddedilemedi. Lütfen tekrar deneyin.", "error");
    }
  };

  const handleSaveWeights = async (newWeights: WeightsConfig) => {
    const token = getAccessToken();
    if (!token) return;
    try {
      // Frontend yüzde (0-100) tutuyor, backend kesir (0-1) + toplam tam 1.000 istiyor.
      // Yeni versiyon otomatik aktifleşmiyor (docs/04) -- create + activate iki ayrı çağrı.
      const created = await adminApi.createWeights(token, {
        material: newWeights.material / 100,
        quality: newWeights.quality / 100,
        environmental: newWeights.environmental / 100,
        logistics: newWeights.logistics / 100,
        economic: newWeights.economic / 100,
      });
      await adminApi.activateWeights(token, created.id);
      setWeights(newWeights);
      showToast("Ağırlıklar kaydedildi ve yeni versiyon aktif edildi.", "success");
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : "Ağırlıklar kaydedilemedi. Lütfen tekrar deneyin.", "error");
    }
  };

  const handleCreateCarbonFactor = async (dto: {
    materialClass: string;
    factorType: string;
    co2PerKg: number;
    source: string;
  }) => {
    const token = getAccessToken();
    if (!token) return;
    try {
      await adminApi.createCarbonFactor(token, dto);
      const refreshed = await adminApi.listCarbonFactors(token);
      setCarbonFactors(refreshed);
      showToast("Karbon faktörü eklendi.", "success");
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : "Karbon faktörü eklenemedi. Lütfen tekrar deneyin.", "error");
    }
  };

  const handleUpdateConfig = async (changes: Record<string, unknown>) => {
    const token = getAccessToken();
    if (!token) return;
    try {
      await adminApi.updateConfig(token, changes);
      const refreshed = await adminApi.getConfig(token);
      setSystemConfig(refreshed);
      showToast("Yapılandırma güncellendi.", "success");
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : "Yapılandırma güncellenemedi. Lütfen tekrar deneyin.", "error");
    }
  };

  const handleLoadAuditLogPage = async (page: number) => {
    const token = getAccessToken();
    if (!token || page < 1) return;
    try {
      const res = await adminApi.listAuditLog(token, { page, limit: 20 });
      setAuditLog(res.data as unknown as AuditLogRow[]);
      setAuditLogPage(res.meta.page);
      setAuditLogTotalPages(res.meta.totalPages);
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : "Kayıtlar yüklenemedi. Lütfen tekrar deneyin.", "error");
    }
  };

  // --- CHATBOT ACTIONS (paylaşılan: tam sayfa + köşe widget) ---
  // ÖNEMLİ: backend'in `ai` modülü tam olarak tek bir endpoint sunuyor -- POST /ai/classify,
  // dar kapsamlı, tek seferlik bir malzeme sınıflandırıcısı (materialClass/confidence/top3).
  // Backend'de genel bir sohbet/konuşma endpoint'i yok. Bunu gerçek bir backend entegrasyonu
  // gibi göstermek yerine, handleChatSend hep olduğu gibi kalıyor: anahtar kelime eşleştirmeli,
  // hazır cevaplı yerel bir sezgisel yapı. Backend'i ÇAĞIRMIYOR.
  const handleChatSend = (userMsg: string) => {
    setChatMessages((prev) => [...prev, { role: "user", content: userMsg }]);
    setChatIsTyping(true);

    setTimeout(() => {
      setChatIsTyping(false);
      const lower = userMsg.toLowerCase();
      let reply =
        "EcoMatch AI asistanı olarak sorunuzu tam olarak anlayamadım. Ancak sürdürülebilirlik, SKDM (sınırda karbon vergisi), Dijital Ürün Pasaportları (DPP) veya endüstriyel simbiyoz süreçlerimiz hakkında sorular sorabilirsiniz.";

      if (lower.includes("skdm") || lower.includes("cbam") || lower.includes("karbon")) {
        reply =
          "<strong>Sınırda Karbon Düzenleme Mekanizması (SKDM - CBAM) Hakkında:</strong> AB Yeşil Mutabakatı kapsamında, birlik dışından ithal edilen çimento, demir-çelik, alüminyum, gübre, hidrojen ve elektrik gibi ürünlerin gömülü karbon emisyonlarına göre gümrükte vergilendirilmesidir. EcoMatch üzerinde yaptığınız atık eşleştirmeleri, birincil (virgin) metal kullanımı yerine ikincil alaşım kullanımı sağladığı için gömülü karbon miktarınızı önemli ölçüde azaltır ve yasal uyumluluk raporu (CBAM Raporu) olarak çıktı alınabilir.";
      } else if (lower.includes("pasaport") || lower.includes("dpp") || lower.includes("espr")) {
        reply =
          "<strong>Dijital Ürün Pasaportu (DPP) Nedir?</strong> AB'nin Ecodesign for Sustainable Products Regulation (ESPR) yönetmeliğine göre ürünlerin malzeme kimliği, saflığı, menşei, karbon ayak izi ve geri dönüştürülebilirlik durumunu dijital olarak barındıran yapıdır. EcoMatch'te oluşturduğumuz pasaportlar, atığınızın değerini kanıtlar ve izlenebilirlik sağlayan benzersiz bir QR Kod ile üretilir.";
      } else if (
        lower.includes("simbiyoz") ||
        lower.includes("eşleştirme") ||
        lower.includes("nasıl") ||
        lower.includes("skor")
      ) {
        reply =
          "<strong>EcoMatch AI Eşleştirme Sistemi:</strong> Tesislerimizin sisteme girdiği çıktılar ile diğer tesislerin girdileri arasında anlamsal S-BERT analizi yapılır (benzerlik limiti $\\ge 0.60$). Eşleşen adaylar; <strong>Malzeme Uyumu (%30)</strong>, <strong>Kalite Uyumu (%20)</strong>, <strong>Çevresel Kazanç (%20)</strong>, <strong>Lojistik (%15)</strong> ve <strong>Ekonomik Fayda (%15)</strong> olmak üzere 5 farklı ağırlık üzerinden AHP (Analitik Hiyerarşi Süreci) algoritmasıyla puanlanarak listelenir.";
      }

      setChatMessages((prev) => [...prev, { role: "assistant", content: reply }]);
    }, 1500);
  };

  const selectedMatch = matches.find((m) => m.id === selectedMatchId) || matches[0] || null;

  if (passportRoute) {
    return <PassportView passportId={passportRoute.passportId} sig={passportRoute.sig} />;
  }

  return (
    <div className="flex-grow w-full flex flex-col relative select-none">
      {/* ================= 1. PUBLIC LANDING VIEW ================= */}
      {currentPage === "landing" && <LandingView onLogin={handleLogin} />}

      {/* ================= 2. AUTHENTICATED SYSTEM CONTAINER ================= */}
      {currentPage !== "landing" && (
        <div className="w-full min-h-screen flex relative overflow-x-hidden">
          {systemDown && (
            <div className="fixed top-0 inset-x-0 z-[60] bg-rose-600 text-white text-center text-xs font-semibold py-2 px-4">
              Sistem geçici olarak bakımda — bazı işlemler şu anda çalışmayabilir. Lütfen birazdan tekrar deneyin.
            </div>
          )}
          {/* Mobile Sidebar Backdrop Overlay */}
          {sidebarOpen && (
            <div
              onClick={() => setSidebarOpen(false)}
              className="fixed inset-0 bg-on-surface/40 backdrop-blur-sm z-40 lg:hidden transition-opacity duration-300"
            />
          )}

          {/* Left Sidebar Navigation */}
          <Sidebar
            userRole={userRole}
            currentPage={currentPage}
            setCurrentPage={setCurrentPage}
            sidebarOpen={sidebarOpen}
            setSidebarOpen={setSidebarOpen}
            onLogout={handleLogout}
            facilityName={facility?.name ?? null}
          />

          {/* Right Main Content */}
          <div className="flex-grow pl-0 lg:pl-64 flex flex-col min-h-screen w-full min-w-0">
            {/* Header */}
            <Header
              userRole={userRole}
              currentPage={currentPage}
              setSidebarOpen={setSidebarOpen}
              notifications={notifications}
              onMarkRead={handleMarkNotificationRead}
              onMarkAllRead={handleMarkAllNotificationsRead}
              socketConnected={socketConnected}
            />

            {/* View Panels */}
            <main className="flex-grow p-4 md:p-8 bg-background relative overflow-y-auto">
              {currentPage === "dashboard" && (
                <DashboardView
                  outputsCount={outputs.length}
                  inputsCount={inputs.length}
                  outputs={outputs}
                  matches={matches}
                  facility={facility}
                  facilityDocuments={facilityDocuments}
                  onUploadDocument={handleUploadFacilityDocument}
                />
              )}

              {currentPage === "materials" && (
                <MaterialsView
                  outputs={outputs}
                  inputs={inputs}
                  currentTab={currentMaterialTab}
                  setCurrentTab={setCurrentMaterialTab}
                  onShowOutputModal={() => {
                    setEditingOutput(null);
                    setShowOutputModal(true);
                  }}
                  onShowInputModal={() => {
                    setEditingInput(null);
                    setShowInputModal(true);
                  }}
                  onShowDppModal={(out) => {
                    setSelectedDppOutput(out);
                    setShowDppModal(true);
                  }}
                  onEditOutput={(out) => {
                    setEditingOutput(out);
                    setShowOutputModal(true);
                  }}
                  onDeleteOutput={handleDeleteOutput}
                  onFindMatches={handleFindMatches}
                  onEditInput={(input) => {
                    setEditingInput(input);
                    setShowInputModal(true);
                  }}
                  onDeleteInput={handleDeleteInput}
                />
              )}

              {currentPage === "matchmaker" && (
                <MatchmakerView
                  matches={matches}
                  setMatches={setMatches}
                  selectedMatchId={selectedMatchId}
                  setSelectedMatchId={setSelectedMatchId}
                  onAcceptMatch={handleAcceptMatch}
                  onRejectMatch={handleRejectMatch}
                  onRetryMatch={handleRetryMatch}
                  originLocation={facility?.location ?? null}
                />
              )}

              {currentPage === "reports" && <ReportsView matches={matches} outputs={outputs} />}

              {currentPage === "chatbot" && (
                <ChatbotView chatMessages={chatMessages} onSend={handleChatSend} isTyping={chatIsTyping} />
              )}

              {currentPage === "osb" && (
                <OsbView
                  stats={osbStats}
                  facilities={osbFacilities}
                  map={osbMap}
                  onDownloadMonthlyReport={handleDownloadOsbMonthlyReport}
                />
              )}

              {currentPage === "settings" && (
                <SettingsView
                  userEmail={userEmail}
                  facility={facility}
                  onUpdateAccount={handleUpdateAccount}
                  onUpdateFacility={handleUpdateFacility}
                  onDeleteAccount={handleDeleteAccount}
                />
              )}

              {currentPage === "admin" && (
                <AdminView
                  users={platformUsers}
                  onRemoveUser={handleRemoveUser}
                  reviewQueue={reviewQueue}
                  onApproveReview={handleApproveReview}
                  onRejectReview={handleRejectReview}
                  weights={weights}
                  onSaveWeights={handleSaveWeights}
                  apiKeys={apiKeys}
                  onCreateApiKey={handleCreateApiKey}
                  onRevokeApiKey={handleRevokeApiKey}
                  verifications={osbVerificationList}
                  onApproveVerification={handleVerifyOsbFacility}
                  onRejectVerification={handleRejectOsbFacility}
                  carbonFactors={carbonFactors}
                  onCreateCarbonFactor={handleCreateCarbonFactor}
                  systemConfig={systemConfig}
                  onUpdateConfig={handleUpdateConfig}
                  auditLog={auditLog}
                  auditLogPage={auditLogPage}
                  auditLogTotalPages={auditLogTotalPages}
                  onLoadAuditLogPage={handleLoadAuditLogPage}
                />
              )}
            </main>
          </div>
        </div>
      )}

      {/* ================= FLOATING CHAT WIDGET ================= */}
      {currentPage !== "landing" && currentPage !== "chatbot" && (
        <ChatWidget chatMessages={chatMessages} onSend={handleChatSend} isTyping={chatIsTyping} />
      )}

      {/* ================= MODAL WINDOWS ================= */}
      <AddOutputModal
        isOpen={showOutputModal}
        onClose={() => {
          setShowOutputModal(false);
          setEditingOutput(null);
        }}
        onSubmit={handleAddOutputSubmit}
        editingOutput={editingOutput}
        onUpdate={handleUpdateOutputSubmit}
      />

      <AddInputModal
        isOpen={showInputModal}
        onClose={() => {
          setShowInputModal(false);
          setEditingInput(null);
        }}
        onSubmit={handleAddInputSubmit}
        editingInput={editingInput}
        onUpdate={handleUpdateInputSubmit}
      />

      <DppModal
        isOpen={showDppModal}
        onClose={() => setShowDppModal(false)}
        output={selectedDppOutput}
        facility={facility}
      />

      <SuccessModal
        isOpen={showSuccessModal}
        onClose={() => setShowSuccessModal(false)}
        selectedMatch={selectedMatch}
      />
    </div>
  );
}
