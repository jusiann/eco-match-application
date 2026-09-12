# 11 · Demo Veri Seti

> Kaynak: `backend/prisma/migrations/013_demo_seed_data.sql` — sıfır bir Docker volume'ünde
> (`docker compose up` veya `docker compose down -v && up`) otomatik uygulanır. Bu dosya o
> migration'ın ürettiği veriyi kullanıcıya anlatan bir referanstır; migration'ın kendi
> başındaki yorumlar tasarım kararlarının ("neden") kaynağıdır.

## Giriş bilgileri

Tüm demo hesapları **aynı şifreyi** kullanır:

```
Ecomatch2026!
```

| E-posta | Rol | Tesis |
|---|---|---|
| `aylin@dokutekstil.com.tr` | Tesis Yöneticisi | Doku Tekstil A.Ş. (Bursa Nilüfer OSB) |
| `ali@yapigrup.com.tr` | Tesis Yöneticisi | Yapı Grup A.Ş. (Bursa Nilüfer OSB) |
| `mert@gebzemetal.com.tr` | Tesis Yöneticisi | Gebze Metal A.Ş. (Gebze OSB) |
| `veli@dilovasialuminyum.com.tr` | Tesis Yöneticisi | Dilovası Alüminyum San. Tic. A.Ş. (Dilovası OSB) |
| `emre@kocaelikimya.com.tr` | Tesis Yöneticisi | Kocaeli Kimya Sanayi A.Ş. (Gebze OSB) |
| `seda@anadolukimya.com.tr` | Tesis Yöneticisi | Anadolu Kimya Geri Dönüşüm A.Ş. (Dilovası OSB) |
| `burak@marmaraambalaj.com.tr` | Tesis Yöneticisi | Marmara Ambalaj Plastik A.Ş. (Bursa Nilüfer OSB) |
| `cem@kemalpasaplastik.com.tr` | Tesis Yöneticisi | Kemalpaşa Plastik Dönüşüm Ltd. Şti. (İzmir Kemalpaşa OSB) |
| `elif@anadolukagit.com.tr` | Tesis Yöneticisi | Anadolu Kağıt Geri Dönüşüm A.Ş. (Bursa Nilüfer OSB) |
| `onur@trakyakagit.com.tr` | Tesis Yöneticisi | Trakya Kağıt Sanayi A.Ş. (Çorlu Deri ve Sanayi OSB) |
| `zeynep@anadoluderi.com.tr` | Tesis Yöneticisi | Anadolu Deri İşleme A.Ş. — **doğrulanmamış** (S1/AD1 demo) |
| `mehmet@bursaniluferosb.gov.tr` | OSB Yöneticisi | Bursa Nilüfer OSB Yönetim Ofisi |
| `ayse@ecomatch.app` | Sistem Admini | EcoMatch Operasyon Merkezi |
| `kaan@ecomatch.app` | Uzman (HITL) | EcoMatch Operasyon Merkezi |

## Eşleşmeler (match_status'un beş durumu da örnekleniyor)

| Senaryo | Arz → Talep | Durum | Skor | CO2 | CBAM |
|---|---|---|---|---|---|
| Organik çamur | Doku Tekstil → Yapı Grup | **completed** | 85 | ~1144 kg | ~€97 |
| Alüminyum hurda | Gebze Metal → Dilovası Alüminyum | **accepted** (tek taraf onayladı) | 85 | ~13200 kg | ~€1122 |
| Solvent atığı | Kocaeli Kimya → Anadolu Kimya | **pending** (dokunulmamış aday) | 70 | ~775 kg | ~€66 |
| PET/PP kırığı | Kemalpaşa Plastik → Marmara Ambalaj | **rejected** (A1: kalite yetersiz) | 47 | ~4100 kg | ~€349 |
| Kağıt/karton | Anadolu Kağıt → Trakya Kağıt | **expired** (A3: 30 gün doldu) | 50 | ~2800 kg | ~€238 |

Skor/CO2/CBAM/lojistik sayıları **elle yazılmadı** — migration içinde
`scoring.service.ts`'in formülleriyle birebir aynı SQL ifadeleriyle, gerçek PostGIS mesafesi
ve gerçek embedding vektörleri kullanılarak hesaplandı. Bir eşleşmenin detayını açtığınızda
gördüğünüz her sayı, backend'in canlı `GET /v1/matches/find/:outputId` çağrısında üreteceğiyle
aynı formülden geliyor.

## Ek demo unsurları

- **Anadolu Deri İşleme A.Ş.** bilerek doğrulanmamış bırakıldı — Aylin ile giriş yaptığınızda
  görmediğiniz "Tesisiniz henüz doğrulanmadı" banner'ını (S1) ve Ayşe'nin admin panelindeki
  bekleyen doğrulama kuyruğunu (AD1) görmek için `zeynep@anadoluderi.com.tr` ile girin.
- **Doku Tekstil'in ikinci çıktısı** ("Boya artığı, karışık") bilinçli olarak sınıflandırılamadı
  — Kaan'ın (`kaan@ecomatch.app`) admin panelindeki "Onay Kuyruğu (HITL)" sekmesinde %62 güven
  skoruyla bekliyor (A2).
- **Kocaeli Kimya'nın çıktısı** bileşim toplamı kasıtlı olarak 105 (hatalı) — o pasaportun
  ESPR uyum durumu `false` ve `composition_sum_invalid` uyarısı taşıyor (E8).
- **`GET /v1/osbs`** artık 5 gerçek OSB döndürüyor (Bursa Nilüfer, Gebze, Dilovası, İzmir
  Kemalpaşa, Çorlu) — kayıt formundaki OSB dropdown'u ve OSB paneli artık boş değil.

## Veriyi sıfırlama

```bash
docker compose down -v && docker compose up --build
```

Bu, hem backend'in Postgres volume'ünü hem AI mikroservisinin kendi scratch DB'sini siler;
`013_demo_seed_data.sql` bir sonraki açılışta yeniden, aynı sonuçla uygulanır (migration
tamamen deterministik — rastgele hiçbir değer yok).
