// NEXT_PUBLIC_API_URL backend'in KÖKÜ (ör. http://localhost:3001) -- /v1 prefix'i
// burada, tek yerde ekleniyor (main.ts: app.setGlobalPrefix('v1', {exclude:['health','health/ready']})).
// /health uçları bu prefix'e girmez, bu yüzden ayrı bir sabit tutuyoruz.
//
// "/" (veya boş string) = SAME-ORIGIN modu: tüm istekler göreli yol olarak gider
// (/v1/..., /health/ready, socket.io için /socket.io/) ve tarayıcı bunları sayfanın
// kendi origin'ine yollar. Docker imajı bu değerle derleniyor (web/Dockerfile ARG) --
// nginx /v1, /health ve /socket.io'yu backend'e proxy'liyor, böylece CORS da
// çapraz-origin cookie sorunu da hiç oluşmuyor. Değişken hiç tanımlı değilse
// (yerel `npm run dev`) backend'in Docker'daki host portuna düşülür.
//
// NOT: NEXT_PUBLIC_* değerleri `next build` sırasında bundle'a GÖMÜLÜR; imaj
// derlendikten sonra bu değeri konteyner ortam değişkeniyle değiştiremezsiniz.
// Backend'i başka bir adrese taşırsanız imajı yeniden derlemeniz gerekir --
// same-origin modunda bu gerekmez, hedefi nginx tarafında BACKEND_ORIGIN belirler.
const API_ORIGIN = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001").trim().replace(/\/+$/, "");
const API_BASE = `${API_ORIGIN}/v1`;
export const HEALTH_BASE = API_ORIGIN;

export class ApiError extends Error {
  status: number;
  code?: string;
  details?: unknown;
  constructor(message: string, status: number, code?: string, details?: unknown) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

async function request<T>(
  path: string,
  options: { method?: string; body?: unknown; token?: string; idempotent?: boolean } = {}
): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: options.method || "GET",
    // Refresh token'ı taşıyan httpOnly cookie (K-18) yalnızca credentials:'include' ile
    // cross-origin (frontend farklı porttan çalışıyor) gönderilip alınabiliyor.
    credentials: "include",
    headers: {
      // Gövde yokken Content-Type: application/json GÖNDERİLMEZ. Fastify'ın varsayılan
      // JSON ayrıştırıcısı "başlık application/json ama gövde boş" durumunu hata sayıp
      // 500 döndürüyor -- gövdesiz POST uçlarımız var (auth/refresh, auth/logout,
      // matches/:id/accept, admin/weights/:id/activate ...). Bunlardan en kritiği
      // auth/refresh: 500 alınca sayfa her yenilendiğinde oturum kaybediliyordu.
      // Backend tarafında da boş gövde artık {} olarak kabul ediliyor (main.ts), bu
      // yalnızca ikinci savunma hattı.
      ...(options.body !== undefined ? { "Content-Type": "application/json" } : {}),
      ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
      // Backend'in IdempotencyInterceptor'ı yalnızca @Idempotent() ile işaretlenmiş POST'ları
      // ve yalnızca bu başlık mevcut olduğunda tekilleştiriyor -- her zaman opsiyonel, ama
      // create/accept/reject gibi mutasyon çağrılarında bunu göndermek, tekrarlanan bir
      // isteğin (örn. kararsız ağ bağlantısı) yeni kayıt oluşturmak yerine orijinal sonucu
      // döndürmesini sağlıyor.
      ...(options.idempotent
        ? {
            "Idempotency-Key":
              typeof crypto !== "undefined" && "randomUUID" in crypto
                ? crypto.randomUUID()
                : `${Date.now()}-${Math.random().toString(36).slice(2)}`,
          }
        : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  const data = await res.json().catch(() => null);

  if (!res.ok) {
    // HttpExceptionFilter formatı: { error: 'CODE', message: '...', details?: {...} }
    const message = data?.message || "Sunucuyla iletişim kurulamadı.";
    throw new ApiError(message, res.status, data?.error, data?.details);
  }

  return data as T;
}

// Rol eşlemesi (prisma UserRole -- @map değerleri küçük harf ama JWT payload'ında
// ve API yanıtlarında büyük harf enum adı kullanılıyor, bkz. auth.service.ts `role: user.role`).
export type BackendRole = "USER" | "FACILITY_ADMIN" | "EXPERT" | "OSB_MANAGER" | "ADMIN";

// Register/login artık refresh_token'ı body'de DÖNDÜRMÜYOR -- controller onu
// destructure edip httpOnly cookie'ye yazıyor (K-18), body'de sadece kalanı kalıyor.
export interface AuthResponse {
  success: boolean;
  message: string;
  access_token: string;
  user: { id: string; email: string; role: BackendRole; emailVerified?: boolean };
  facility: { id: string; name: string; verified?: boolean };
}

export interface RefreshResponse {
  success: boolean;
  access_token: string;
}

export interface MeResponse {
  success: boolean;
  user: { id: string; email: string; role: BackendRole; createdAt: string };
  facility: { id: string; name: string; sector: string; taxId: string; verified: boolean };
}

export interface RegisterPayload {
  name: string;
  taxId: string;
  sector: string;
  email: string;
  password: string;
  contactName: string;
  phone: string;
  osbId?: string;
  location: { lat: number; lng: number };
}

export interface LoginPayload {
  email: string;
  password: string;
}

export const authApi = {
  register: (dto: RegisterPayload) =>
    request<AuthResponse>("/auth/register", { method: "POST", body: dto }),

  login: (dto: LoginPayload) =>
    request<AuthResponse>("/auth/login", { method: "POST", body: dto }),

  // Refresh token httpOnly cookie'den okunur (path: /v1/auth) -- body'de bir şey
  // gönderilmez, credentials:'include' cookie'yi otomatik taşır.
  refresh: () => request<RefreshResponse>("/auth/refresh", { method: "POST" }),

  me: (token: string) => request<MeResponse>("/auth/me", { token }),

  updateProfile: (token: string, dto: { name?: string; email?: string; password?: string }) =>
    request<{ success: boolean; message: string }>("/auth/update-profile", {
      method: "PUT",
      token,
      body: dto,
    }),

  logout: (token: string) =>
    request<{ success: boolean; message: string }>("/auth/logout", { method: "POST", token }),

  deleteAccount: (token: string) =>
    request<{ success: boolean; message: string }>("/auth/delete-account", {
      method: "DELETE",
      token,
    }),
};

// ─────────────────────────────────────────────────────────────────────────
// Aşağıdaki tüm list endpoint'lerinin ortak sayfalama şekli
// (materials/matches/admin/review-queue/notifications/reports hepsi
// tam olarak bu { data, meta } zarfını döndürür — bkz. her *.service.ts'in `paginate()`'i).
// ─────────────────────────────────────────────────────────────────────────
export interface PageMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}
export interface Paginated<T> {
  data: T[];
  meta: PageMeta;
}

function buildQuery(params: Record<string, string | number | boolean | undefined>): string {
  const qs = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null) qs.set(key, String(value));
  }
  const s = qs.toString();
  return s ? `?${s}` : "";
}

// PDF/XLSX/PNG döndüren uçlar request<T>()'in JSON varsayımına uymuyor; ayrıca
// hepsi JwtAuthGuard arkasında olduğundan düz bir <a href> ile açılamıyorlar
// (bağlantı Authorization başlığı taşımaz -> 401). Bu yüzden fetch edip blob
// olarak indiriyoruz.
async function downloadFile(path: string, token: string, filename: string, fallbackMessage: string): Promise<void> {
  const res = await fetch(`${API_BASE}${path}`, {
    credentials: "include",
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    const data = await res.json().catch(() => null);
    throw new ApiError(data?.message || fallbackMessage, res.status, data?.error, data?.details);
  }

  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  // Firefox, belgeye eklenmemiş bir <a> üzerindeki click()'i yok sayıyor.
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Tarayıcı indirmeyi başlatmadan revoke edilirse indirme iptal olabiliyor --
  // bir sonraki tick'e ertelemek yeterli.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

// ── Materials ───────────────────────────────────────────────────────────
// NOT: Prisma, Decimal kolonlarını (quantityKg, stock, co2Saved, ...) JSON
// yanıtında sayı değil STRING olarak serileştiriyor (decimal.js'in toJSON'ı) --
// aşağıdaki tipler bunu yansıtıyor; çağıranlar matematik işleminden önce
// Number() ile dönüştürmeli.

export const MATERIAL_CLASSES = ["metal", "plastic", "organic", "chemical", "textile", "glass", "paper", "other"];
export const FREQUENCIES = ["daily", "weekly", "monthly", "one_time"];

export interface OutputRow {
  id: string;
  facilityId: string;
  materialClass: string | null;
  description: string;
  composition: Record<string, number> | null;
  quantityKg: string;
  stock: string;
  frequency: string | null;
  availability: boolean;
  pendingReview: boolean;
  embeddingPending: boolean;
  createdAt: string | null;
}

export interface InputRow {
  id: string;
  facilityId: string;
  materialClass: string | null;
  description: string;
  specs: Record<string, unknown> | null;
  quantityKg: string;
  frequency: string | null;
  active: boolean;
  pendingReview: boolean;
  embeddingPending: boolean;
  createdAt: string | null;
}

export interface CreateOutputPayload {
  description: string;
  materialClass?: string;
  composition?: Record<string, number>;
  quantityKg: number;
  stock?: number;
  frequency?: string;
}

// Yeni oluşturulan pasaport id/qr/pdf'ini yalnızca createOutput'un yanıtı taşır --
// GET /materials/outputs ilişkili MaterialPassport satırını İÇERMİYOR, bu yüzden
// bir pasaport id'si yalnızca mevcut oturumda oluşturulan kayıtlar için bilinir.
export interface CreateOutputResponse {
  outputId: string;
  passportId: string;
  qrCode: string;
  pdfUrl: string;
  embeddingPending: boolean;
  pendingReview: boolean;
}

export interface CreateInputPayload {
  description: string;
  materialClass?: string;
  specs?: Record<string, unknown>;
  quantityKg: number;
  frequency?: string;
}

export interface CreateInputResponse {
  inputId: string;
  embeddingPending: boolean;
  pendingReview: boolean;
}

// GET /materials/passport/:id/json'un döndürdüğü pasaport gövdesi
// (dpp.service.ts#buildPassportData). Şemada karşılığı olmayan alanlar bilinçli
// olarak null/boş bırakılıyor -- uydurma veri yerine "bilinmiyor" gösteriliyor.
export interface PassportData {
  dpp_version: string;
  passport_id: string | null;
  product_id: string;
  issuer: {
    facility_name: string;
    tax_id: string;
    location: { lat: number; lng: number; osb: string | null } | null;
  };
  material: {
    class: string | null;
    description: string;
    composition: Record<string, number> | null;
    quantity_kg: number;
    hazardous: boolean;
  };
  origin: { process: string | null; production_date: string; batch: string | null };
  traceability: { created_at: string | null; updated_at: string | null; chain_of_custody: unknown[] };
  compliance: { espr_compliant: boolean; cbam_ready: boolean; issues: string[]; certifications: string[] };
  signature: { algorithm: string; value: string | null };
}

export const materialsApi = {
  createOutput: (token: string, dto: CreateOutputPayload) =>
    request<CreateOutputResponse>("/materials/outputs", { method: "POST", token, body: dto, idempotent: true }),

  listOutputs: (token: string, page = 1, limit = 100) =>
    request<Paginated<OutputRow>>(`/materials/outputs${buildQuery({ page, limit })}`, { token }),

  getOutput: (token: string, id: string) => request<OutputRow>(`/materials/outputs/${id}`, { token }),

  updateOutput: (
    token: string,
    id: string,
    dto: Partial<Omit<CreateOutputPayload, "description">> & { description?: string }
  ) => request<{ success: boolean; message: string }>(`/materials/outputs/${id}`, { method: "PATCH", token, body: dto }),

  deleteOutput: (token: string, id: string) =>
    request<{ success: boolean; message: string }>(`/materials/outputs/${id}`, { method: "DELETE", token }),

  createInput: (token: string, dto: CreateInputPayload) =>
    request<CreateInputResponse>("/materials/inputs", { method: "POST", token, body: dto, idempotent: true }),

  listInputs: (token: string, page = 1, limit = 100) =>
    request<Paginated<InputRow>>(`/materials/inputs${buildQuery({ page, limit })}`, { token }),

  updateInput: (
    token: string,
    id: string,
    dto: Partial<Omit<CreateInputPayload, "description">> & { description?: string }
  ) => request<{ success: boolean; message: string }>(`/materials/inputs/${id}`, { method: "PATCH", token, body: dto }),

  deleteInput: (token: string, id: string) =>
    request<{ success: boolean; message: string }>(`/materials/inputs/${id}`, { method: "DELETE", token }),

  // Public (sig doğrulamalı, bkz. materials.controller.ts @Public()) -- yalnızca
  // createOutput'un yanıtından bilinen qrCode/pdfUrl linkleri kullanılabiliyorsa
  // çağırmaya gerek yok; sig'i kaybolmuş/başka oturumdan gelen bir passportId için
  // tarayıcı üzerinden doğrudan açılabilecek düz bağlantılar.
  passportJsonUrl: (passportId: string, sig: string) => `${API_BASE}/materials/passport/${passportId}/json?sig=${encodeURIComponent(sig)}`,
  passportPdfUrl: (passportId: string, sig: string) => `${API_BASE}/materials/passport/${passportId}/pdf?sig=${encodeURIComponent(sig)}`,

  // QR kodu okutan kişi giriş yapmış olmayabilir -- bu uç @Public(), yetki yerine
  // HMAC imzası (sig) doğrulanıyor. Bu yüzden token almıyor.
  getPassportJson: (passportId: string, sig: string) =>
    request<PassportData>(`/materials/passport/${passportId}/json?sig=${encodeURIComponent(sig)}`),

  // Sahip (auth) -- image/png binary döner (materials.controller.ts#getPassportQr),
  // request<T>()'in JSON varsayımına uymuyor (bkz. reportsApi.pdfUrl'deki aynı not),
  // bu yüzden burada ayrıca fetch edip object URL'e çeviriyoruz. Çağıran, döndürülen
  // URL'i kullanım bitince URL.revokeObjectURL() ile serbest bırakmalı.
  async passportQrObjectUrl(token: string, passportId: string): Promise<string> {
    const res = await fetch(`${API_BASE}/materials/passport/${passportId}/qr`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      const data = await res.json().catch(() => null);
      throw new ApiError(data?.message || "QR kodu alınamadı.", res.status, data?.error, data?.details);
    }
    const blob = await res.blob();
    return URL.createObjectURL(blob);
  },
};

// ── Matchmaking ─────────────────────────────────────────────────────────

export interface MatchCounterparty {
  osbName: string | null;
  sectorLabel: string;
  approximateLocation?: { lat: number; lng: number } | null;
}

export interface MatchBreakdown {
  material: number;
  quality: number;
  environmental: number;
  logistics: number;
  economic: number;
}

// GET /matches ve GET /matches/:id'nin döndürdüğü şekil (gizlilik kuralı: status
// === 'completed' olana kadar karşı taraf adı/iletişimi yok, bkz. matches.service.ts#serialize)
export interface MatchRow {
  id: string;
  status: "pending" | "accepted" | "completed" | "rejected" | "expired" | string;
  role: "supplier" | "consumer";
  // status='accepted' iki taraf da kabul edene kadar sürer -- bu, GÖRÜNTÜLEYEN
  // tarafın kendi payını zaten yapıp yapmadığını ayırt eder ("sıra sizde" vs
  // "karşı taraf bekleniyor").
  viewerAccepted: boolean;
  totalScore: number;
  breakdown: MatchBreakdown;
  co2Saved: string | null;
  costSaving: string | null;
  cbamImpact: string | null;
  distanceKm: number | null;
  counterparty: MatchCounterparty;
  expiresAt: string;
  createdAt: string | null;
}

// GET /matches/find/:outputId'nin döndürdüğü şekil (aday üretimi, yan etki olarak
// PENDING Match satırları oluşturur). Çıktı henüz sınıflandırılmadıysa 202 +
// {error:'PENDING_EXPERT_REVIEW'} döner.
export interface FindCandidatesResponse {
  matches?: Array<{
    matchId: string;
    totalScore: number;
    breakdown: MatchBreakdown;
    distanceKm: number | null;
    co2Saved: number;
    costSaving: number;
    cbamImpact: number;
    quantityRatio: number;
    partialMatch: boolean;
    counterparty: MatchCounterparty;
    expiresAt: string;
  }>;
  message: string | null;
  error?: "PENDING_EXPERT_REVIEW";
}

export interface MatchContact {
  companyName: string;
  contactName: string | null;
  email: string | null;
  phone: string | null;
}

export const matchesApi = {
  find: (token: string, outputId: string) => request<FindCandidatesResponse>(`/matches/find/${outputId}`, { token }),

  list: (token: string, params?: { page?: number; limit?: number; status?: string }) =>
    request<Paginated<MatchRow>>(`/matches${buildQuery(params ?? {})}`, { token }),

  get: (token: string, id: string) => request<MatchRow>(`/matches/${id}`, { token }),

  accept: (token: string, id: string) =>
    request<{ success: boolean; status: "accepted" | "completed"; message: string }>(`/matches/${id}/accept`, {
      method: "POST",
      token,
      idempotent: true,
    }),

  reject: (token: string, id: string, dto: { reasonCategory: string; reasonText?: string }) =>
    request<{ success: boolean; message: string }>(`/matches/${id}/reject`, {
      method: "POST",
      token,
      body: dto,
      idempotent: true,
    }),

  // Gizlilik kuralı: karşı tarafın iletişim bilgileri yalnızca status === 'completed'
  // (karşılıklı kabul) olduğunda açılır -- daha erken çağrılırsa backend 404 değil
  // 403 CONTACT_NOT_AVAILABLE döner (matches.service.ts#getContact).
  contact: (token: string, id: string) =>
    request<MatchContact>(`/matches/${id}/contact`, { token }),

  // Yalnızca SÜRESİ DOLMUŞ (expired) eşleşmeler yeniden denenebilir (Faz 2.8/A3) --
  // eski satır audit izi olarak expired kalır, aynı veriyle yeni bir 30 günlük
  // pencere açılır; skor yeniden hesaplanmaz.
  retry: (token: string, id: string) =>
    request<{ success: boolean; matchId: string; message: string }>(`/matches/${id}/retry`, {
      method: "POST",
      token,
      idempotent: true,
    }),
};

// ── Facilities ──────────────────────────────────────────────────────────

export interface FacilityMe {
  id: string;
  name: string;
  sector: string;
  taxId: string;
  osbId: string | null;
  verified: boolean;
  location: { lat: number; lng: number } | null;
  createdAt?: string;
}

export interface FacilityDocumentRow {
  id: string;
  documentType: string;
  status: "PENDING" | "APPROVED" | "REJECTED" | string;
  rejectionReason: string | null;
  createdAt: string | null;
  reviewedAt: string | null;
}

export interface FacilityDocumentsResponse {
  success: boolean;
  verified: boolean;
  documents: FacilityDocumentRow[];
}

export const DOCUMENT_TYPES = ["tax_certificate", "operating_permit"] as const;

export const facilitiesApi = {
  // Yanıt düz bir tesis nesnesi DEĞİL, {success, facility} zarfı
  // (facilities.service.ts#getMe) -- zarf burada tek yerde açılıyor, böylece
  // çağıranlar FacilityMe ile çalışmaya devam ediyor. Zarf açılmadığında
  // facility.verified/name undefined kalıyor ve "tesisiniz doğrulanmadı"
  // uyarısı doğrulanmış tesislerde bile görünüyordu.
  getMe: async (token: string): Promise<FacilityMe> => {
    const res = await request<{ success: boolean; facility: FacilityMe }>("/facilities/me", { token });
    return res.facility;
  },

  // PATCH güncellenmiş tesisi DEĞİL, yalnızca {success, message} döndürüyor --
  // güncel veriyi görmek için ardından getMe çağrılmalı.
  updateMe: (token: string, dto: { name?: string; sector?: string; location?: { lat: number; lng: number } }) =>
    request<{ success: boolean; message: string }>("/facilities/me", { method: "PATCH", token, body: dto }),

  // Yanıt bir dizi DEĞİL -- {success, verified, documents} zarfı (bkz. facilities.service.ts#listDocuments).
  listDocuments: (token: string) => request<FacilityDocumentsResponse>("/facilities/me/documents", { token }),

  // multipart/form-data (facilities.service.ts#uploadDocument: request.file() + fields.documentType) --
  // request<T>() JSON body'ye sabitlendiği için burada ayrı, FormData gönderen bir fetch var.
  async uploadDocument(
    token: string,
    file: File,
    documentType: (typeof DOCUMENT_TYPES)[number]
  ): Promise<{ success: boolean; message: string; documentId: string; status: string }> {
    const form = new FormData();
    form.append("file", file);
    form.append("documentType", documentType);
    const res = await fetch(`${API_BASE}/facilities/me/documents`, {
      method: "POST",
      credentials: "include",
      headers: { Authorization: `Bearer ${token}` },
      body: form,
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      throw new ApiError(data?.message || "Belge yüklenemedi.", res.status, data?.error, data?.details);
    }
    return data;
  },
};

// ── Admin ───────────────────────────────────────────────────────────────

export interface AdminUserRow {
  id: string;
  email: string;
  role: string;
  contactName: string | null;
  phone: string | null;
  emailVerified: boolean;
  facilityId: string;
  createdAt: string | null;
}

export interface FacilityVerificationRow {
  id: string;
  facilityId: string;
  status: "PENDING" | "APPROVED" | "REJECTED" | string;
  createdAt: string | null;
  facility: { id: string; name: string; taxId: string; sector: string };
}

export interface CarbonFactorRow {
  id: string;
  materialClass: string;
  factorType: string;
  co2PerKg: string;
  source: string;
  validFrom: string;
  validTo: string | null;
}

export const adminApi = {
  // Tesis doğrulama (yalnızca ADMIN rolü -- bkz. admin.controller.ts @Roles(ADMIN)).
  // OSB_MANAGER ile yapılan çağrılar burada 403 alır; backend'de bugün OSB'ye özel
  // bir doğrulama endpoint'i yok.
  listVerifications: (token: string) => request<FacilityVerificationRow[]>("/admin/verifications", { token }),
  approveVerification: (token: string, id: string) =>
    request<{ success: boolean; message: string }>(`/admin/verifications/${id}/approve`, { method: "POST", token }),
  rejectVerification: (token: string, id: string, reason: string) =>
    request<{ success: boolean; message: string }>(`/admin/verifications/${id}/reject`, {
      method: "POST",
      token,
      body: { reason },
    }),

  listCarbonFactors: (token: string) => request<CarbonFactorRow[]>("/admin/carbon-factors", { token }),
  createCarbonFactor: (
    token: string,
    dto: { materialClass: string; factorType: string; co2PerKg: number; source: string; validFrom?: string }
  ) => request<{ success: boolean; message: string }>("/admin/carbon-factors", { method: "POST", token, body: dto }),

  // NOT: backend'de DELETE /admin/users/:id yok -- yalnızca create + update
  // (role/contactName/phone) var. "Kullanıcı sil" işleminin çağıracağı gerçek bir endpoint yok.
  listUsers: (token: string, page = 1, limit = 100) =>
    request<Paginated<AdminUserRow>>(`/admin/users${buildQuery({ page, limit })}`, { token }),
  createUser: (
    token: string,
    dto: { email: string; password: string; role: string; facilityId: string; contactName?: string; phone?: string }
  ) => request<{ success: boolean; userId: string; message: string }>("/admin/users", { method: "POST", token, body: dto }),
  updateUser: (token: string, id: string, dto: { role?: string; contactName?: string; phone?: string }) =>
    request<{ success: boolean; message: string }>(`/admin/users/${id}`, { method: "PATCH", token, body: dto }),

  getConfig: (token: string) => request<Record<string, unknown>>("/admin/config", { token }),
  updateConfig: (token: string, body: Record<string, unknown>) =>
    request<{ success: boolean; message: string }>("/admin/config", { method: "PATCH", token, body }),

  listAuditLog: (token: string, params?: { page?: number; limit?: number; entity?: string; entityId?: string }) =>
    request<Paginated<Record<string, unknown>>>(`/admin/audit-log${buildQuery(params ?? {})}`, { token }),

  // ── AHP Ağırlıkları (Faz 3.5, AD2) -- yeni eco-match backend'inde implemente
  // edildi (eski dongu-net-application'da yoktu). Değerler 0-1 arası KESİR, toplamı
  // tam 1.000 olmalı, aksi hâlde 422 WEIGHTS_SUM_INVALID. Yeni versiyon otomatik
  // aktifleşmez -- create sonrası ayrıca activate çağrılmalı.
  listWeights: (token: string) => request<WeightsRow[]>("/admin/weights", { token }),
  createWeights: (
    token: string,
    dto: { material: number; quality: number; environmental: number; logistics: number; economic: number }
  ) => request<WeightsRow>("/admin/weights", { method: "POST", token, body: dto }),
  activateWeights: (token: string, id: string) =>
    request<{ success: boolean; message: string }>(`/admin/weights/${id}/activate`, { method: "POST", token }),

  // ── API Anahtarları (Faz 3.6) -- IoT sensörlerinin /iot/sensor-data'ya kimlik
  // doğrulaması için kullandığı X-Api-Key'i admin burada üretir. Anahtarın ham değeri
  // yalnızca createApiKey'in yanıtında BİR KEZ görünür (bkz. admin.service.ts notu).
  listApiKeys: (token: string) => request<{ data: ApiKeyRow[] }>("/admin/api-keys", { token }),
  createApiKey: (token: string, dto: { name: string; userId: string; scopes?: string[]; expiresAt?: string }) =>
    request<{ success: boolean; apiKeyId: string; key: string; message: string }>("/admin/api-keys", {
      method: "POST",
      token,
      body: dto,
    }),
  revokeApiKey: (token: string, id: string) =>
    request<{ success: boolean; message: string }>(`/admin/api-keys/${id}`, { method: "DELETE", token }),
};

export interface ApiKeyRow {
  id: string;
  userId: string;
  name: string;
  scopes: string[];
  lastUsed: string | null;
  expiresAt: string | null;
  createdAt: string | null;
  revokedAt: string | null;
}

export interface WeightsRow {
  id: string;
  version: number;
  material: number;
  quality: number;
  environmental: number;
  logistics: number;
  economic: number;
  active: boolean;
  createdAt?: string;
}

// ── Admin / Review Queue (HITL) ────────────────────────────────────────
// Roller: ADMIN veya EXPERT (review-queue.controller.ts @Roles(ADMIN, EXPERT)) --
// /admin/*'in geri kalanının aksine bu, yalnızca admin'e özel DEĞİL.

export interface ReviewQueueRow {
  id: string;
  outputId: string | null;
  matchId: string | null;
  confidence: string;
  reason: string;
  aiSuggestion: Array<[string, number]> | null;
  status: "PENDING" | "APPROVED" | "REJECTED" | string;
  createdAt: string | null;
  output?: { id: string; description: string; facility: { name: string; sector: string } };
}

export const reviewQueueApi = {
  list: (token: string, params?: { page?: number; limit?: number; sector?: string; minConfidence?: number }) =>
    request<Paginated<ReviewQueueRow>>(`/admin/review-queue${buildQuery(params ?? {})}`, { token }),

  detail: (token: string, id: string) =>
    request<ReviewQueueRow & { previousRecords: Array<{ id: string; description: string; materialClass: string | null; createdAt: string | null }> }>(
      `/admin/review-queue/${id}`,
      { token }
    ),

  approve: (token: string, id: string, dto: { materialClass: string; notes?: string }) =>
    request<{ success: boolean; message: string }>(`/admin/review-queue/${id}/approve`, { method: "POST", token, body: dto }),

  reject: (token: string, id: string, dto: { notes: string }) =>
    request<{ success: boolean; message: string }>(`/admin/review-queue/${id}/reject`, { method: "POST", token, body: dto }),
};

// ── OSBs (public) ──────────────────────────────────────────────────────

export interface OsbRow {
  id: string;
  name: string;
  city: string;
}

export const osbsApi = {
  list: () => request<OsbRow[]>("/osbs"),
};

// ── Reports ─────────────────────────────────────────────────────────────
// json formatı normal request<T>() üzerinden gider. pdf formatı application/pdf'i
// doğrudan FastifyReply üzerinden akıtıyor ve request<T>()'in JSON varsayımına
// uymuyor -- ayrıca controller tamamen @UseGuards(JwtAuthGuard) arkasında, yani
// düz bir <a href>/window.open() Authorization başlığı taşıyamadığı için 401 alır.
// Bu yüzden PDF'ler downloadFile() ile fetch edilip blob olarak indiriliyor.

export const reportsApi = {
  environmentalJson: (token: string, matchId: string) => request<Record<string, unknown>>(`/reports/environmental/${matchId}?format=json`, { token }),
  cbamJson: (token: string, matchId: string) => request<Record<string, unknown>>(`/reports/cbam/${matchId}?format=json`, { token }),
  dppReport: (token: string, passportId: string) => request<Record<string, unknown>>(`/reports/dpp/${passportId}`, { token }),
  list: (token: string, page = 1, limit = 20) => request<Paginated<Record<string, unknown>>>(`/reports${buildQuery({ page, limit })}`, { token }),

  // NOT: CBAM raporu yalnızca status === 'COMPLETED' eşleşmeler için üretilebilir
  // (reports.service.ts -> 403 REPORT_NOT_AVAILABLE). Çevresel etki raporunun
  // böyle bir durum kısıtı yok, tesisin sahip olduğu her eşleşme için çalışır.
  downloadPdf: (token: string, kind: "environmental" | "cbam", matchId: string) =>
    downloadFile(
      `/reports/${kind}/${matchId}?format=pdf`,
      token,
      `ecomatch-${kind}-${matchId}.pdf`,
      "Rapor indirilemedi."
    ),
};

// ── Notifications ───────────────────────────────────────────────────────

export interface NotificationRow {
  id: string;
  type: string;
  title: string;
  body: string | null;
  payload: Record<string, unknown> | null;
  readAt: string | null;
  createdAt: string | null;
}

export interface NotificationPrefEntry {
  inApp: boolean;
  email: boolean;
  push: boolean;
}

export const notificationsApi = {
  list: (token: string, params?: { page?: number; limit?: number; unread?: boolean }) =>
    request<Paginated<NotificationRow>>(`/notifications${buildQuery(params ?? {})}`, { token }),
  unreadCount: (token: string) => request<{ count: number }>("/notifications/unread-count", { token }),
  getPrefs: (token: string) => request<Record<string, NotificationPrefEntry>>("/notifications/prefs", { token }),
  updatePrefs: (token: string, body: Record<string, NotificationPrefEntry>) =>
    request<{ success: boolean; message: string }>("/notifications/prefs", { method: "PATCH", token, body }),
  markAllRead: (token: string) => request<{ success: boolean; message: string }>("/notifications/read-all", { method: "PATCH", token }),
  markRead: (token: string, id: string) =>
    request<{ success: boolean; message: string }>(`/notifications/${id}/read`, { method: "PATCH", token }),
};

// ── AI ──────────────────────────────────────────────────────────────────
// POST /ai/classify -- dar kapsamlı, tek seferlik bir malzeme sınıflandırıcısı
// (-> {materialClass, confidence, top3, requiresHumanReview}). Backend'de ayrıca
// gerçek bir sohbet ucu (POST /chat, SSE + GET /chat/history) da VAR ama şu an
// dummy bir ClaudeClientService tarafından besleniyor (K-31) -- henüz burada
// istemci yazılmadı; ChatbotView'ın serbest metin soru-cevabı (handleChatSend)
// bu yüzden hâlâ yerel bir sezgisel yapı, backend'e bağlı DEĞİL -- bkz. page.tsx.

export interface ClassifyResponse {
  materialClass: string;
  confidence: number;
  top3: Array<[string, number]>;
  requiresHumanReview: boolean;
}

export const aiApi = {
  classify: (token: string, description: string) =>
    request<ClassifyResponse>("/ai/classify", { method: "POST", token, body: { description } }),
};

// ── OSB Dashboard ───────────────────────────────────────────────────────
// Rol: osb_manager (osb-dashboard.controller.ts @Roles(OSB_MANAGER)). Kullanıcının
// hangi OSB'yi yönettiği ayrı bir tabloda değil, kendi tesisinin osb_id'sinde --
// tesisi bir OSB'ye bağlı değilse 400 OSB_NOT_ASSIGNED (bkz. getManagedOsbId).

export interface OsbStats {
  totalFacilities: number;
  activeMatchesLast30d: number;
  monthlyCo2SavedKg: number;
  monthlyCbamSavingEur: number;
  symbiosisRate: number; // 0-1 kesir, yüzde için *100
  avgMatchDurationHours: number | null;
}

export interface OsbFacilityRow {
  id: string;
  name: string;
  sector: string;
  verified: boolean;
  createdAt: string | null;
}

export interface OsbMapPin {
  id: string;
  name: string;
  sector: string;
  lat: number | null;
  lng: number | null;
}

export interface OsbMapLine {
  matchId: string;
  from: { lat: number | null; lng: number | null } | null;
  to: { lat: number | null; lng: number | null } | null;
}

export interface OsbMapResponse {
  pins: OsbMapPin[];
  matchLines: OsbMapLine[];
}

export interface OsbMonthlyReportSummary {
  period: string;
  osb: string;
  completedMatches: number;
  totalCo2SavedKg: number;
  totalCbamSavingEur: number;
  topWasteProducers: Array<{ facilityId: string; name: string; quantityKg: number }>;
  topActiveBuyers: Array<{ facilityId: string; name: string; dealCount: number }>;
}

export const osbDashboardApi = {
  stats: (token: string) => request<OsbStats>("/osb/stats", { token }),

  facilities: (token: string, sector?: string) =>
    request<{ data: OsbFacilityRow[] }>(`/osb/facilities${buildQuery({ sector })}`, { token }),

  map: (token: string) => request<OsbMapResponse>("/osb/map", { token }),

  monthlyReportJson: (token: string, period: string) =>
    request<OsbMonthlyReportSummary>(`/osb/reports/monthly${buildQuery({ period, format: "json" })}`, { token }),

  // pdf/xlsx binary döner (osb-dashboard.controller.ts#monthlyReport) ve JwtAuthGuard
  // arkasında -- düz bir <a href> olamaz (token taşımaz), bkz. downloadFile().
  downloadMonthlyReport: (token: string, period: string, format: "pdf" | "xlsx") =>
    downloadFile(
      `/osb/reports/monthly${buildQuery({ period, format })}`,
      token,
      `osb-rapor-${period}.${format}`,
      "Rapor indirilemedi."
    ),
};

// ── Health ──────────────────────────────────────────────────────────────
// /health uçları /v1 prefix'inin dışında (main.ts: setGlobalPrefix exclude), bu yüzden
// API_BASE değil HEALTH_BASE kullanılıyor. Public, kimlik gerektirmez.

export const healthApi = {
  ready: async (): Promise<{ ok: boolean }> => {
    try {
      const res = await fetch(`${HEALTH_BASE}/health/ready`);
      return { ok: res.ok };
    } catch {
      return { ok: false };
    }
  },
};
