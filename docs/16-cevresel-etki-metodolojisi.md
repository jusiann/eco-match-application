# Bölüm 16: Çevresel Etki Metodolojisi ve Ölçülebilir Göstergeler

> **Belge No:** EM-ENV-2026-V1  
> **Yarışma:** TEKNOFEST 2026 — Sıfır Atık ve Döngüsel Ekonomi  
> **Takım:** VectorMatch (#1003771)  
> **İlgili Şartname Maddesi:** Madde 10.9 (Çevresel Etki Metodolojisi ve Ölçülebilir Göstergeler)  
> **Hedef:** Endüstriyel simbiyozun sağladığı atık azaltımı ve karbon tasarrufunun bilimsel standartlara dayalı olarak ölçülmesi, raporlanması ve doğrulanması.

---

## 1. Giriş ve Kapsam

EcoMatch platformu; endüstriyel tesislerin ortaya çıkardığı atık, yan ürün ve ikincil malzemeleri diğer tesislerin üretim süreçlerine hammadde olarak kazandıran yapay zekâ destekli bir endüstriyel simbiyoz ve döngüsel ekonomi altyapısıdır. 

Platformun temel çevresel faydası, birincil (virgin) hammadde çıkarımı, işlenmesi ve bertarafı (düzenli depolama / yakma) kaynaklı sera gazı emisyonlarının önüne geçilmesidir. Bu doküman; platform üzerinde gerçekleşen her bir simbiyotik eşleşmenin çevresel etkisini hesaplamada kullanılan **varsayımları**, **metodolojik çerçeveyi**, **resmî veri kaynaklarını** ve **ölçülebilir temel performans göstergelerini (KPI)** tanımlamaktadır.

---

## 2. Metodolojik Çerçeve ve Standartlar

Hesaplama algoritmamız uluslararası kabul görmüş Yaşam Döngüsü Değerlendirmesi (LCA) ve Sera Gazı Muhasebesi standartları ile tam uyumlu olarak kurgulanmıştır:

1. **ISO 14040:2006 & ISO 14044:2006:** Çevre Yönetimi — Yaşam Döngüsü Değerlendirmesi (İlkeler ve Çerçeve / Gereksinimler ve Kılavuzlar)
2. **ISO 14067:2018:** Sera Gazları — Ürünlerin Karbon Ayak İzi (Hesaplama İlkeleri)
3. **GHG Protocol (Sera Gazı Protokolü):** Kurumsal ve Ürün Değer Zinciri (Kapsam 1, Kapsam 2 ve Kapsam 3 Kategori 1 "Satın Alınan Mal ve Hizmetler", Kategori 4/9 "Taşımacılık ve Dağıtım", Kategori 5 "Üretim Atıkları")
4. **AB Döngüsel Ekonomi Eylem Planı ve ESPR (Ecodesign for Sustainable Products Regulation):** Dijital Ürün Pasaportu (DPP) çevresel veri gereksinimleri
5. **AB Sınırda Karbon Düzenleme Mekanizması (CBAM - Regulation EU 2023/956):** İkincil malzeme kullanımının karbon maliyet tasarrufu

---

## 3. Varsayım, Yöntem ve Veri Kaynağı Üçlüsü

Şartname Madde 10.9 kapsamında zorunlu tutulan analitik üçlü sistemimizde şu şekilde yapılandırılmıştır:

### 3.1. Varsayımlar (Assumptions)
- **İkame Eşdeğerliği (Displacement Assumption):** Alıcı tesisin kabul ettiği her 1 kg ikincil malzeme (atık/yan ürün), tesisin satın alacağı 1 kg birincil hammaddenin üretim ihtiyacını ikame eder (teknik tolerans ve bileşim saflığı `composition` katsayısıyla ağırlıklandırılır).
- **Sistem Sınırları (System Boundaries - "Cradle-to-Gate"):** Beşikten-kapıya yaklaşımı uygulanır. Atık üreten tesisin atık çıkış noktasından, alıcı tesisin giriş kapısına kadar olan lojistik ve işleme süreçleri sınır kabul edilir. Atık çıktısının önceki üretim süreci emisyonları ilk üreticiye tahsis edilmiştir (Cut-off Allocation kuralı).
- **Lojistik Rotası:** Tesisler arası mesafe PostGIS uzamsal motoru (`ST_Distance`) ile düz hat (öklid) olarak ölçülür ve karayolu şebekesi dolaylılık faktörü olan $1.25$ katsayısı ile gerçek rota mesafesine normalize edilir:
  $$D_{\text{rota}} = D_{\text{kuş uçuşu}} \times 1.25$$
- **Taşıma Aracı Tipi:** Organize Sanayi Bölgeleri arasındaki atık nakliyesinde Türkiye filosu ortalaması olan 16-32 tonluk EURO 5 ve EURO 6 dizel ağır vasıta (kamyon/tır) filosu varsayılmaktadır.

### 3.2. Veri Kaynakları (Data Sources)
Emisyon faktörlerimiz ulusal ve uluslararası resmî envanterlerden derlenmiştir:
- **T.C. Çevre, Şehircilik ve İklim Değişikliği Bakanlığı (ÇŞİDB):** Ulusal Sera Gazı Emisyon Envanteri Raporu (2024 / 1990-2022 Serisi).
- **TÜİK (Türkiye İstatistik Kurumu):** Ulaştırma ve Çevre İstatistikleri Veritabanı (Karayolu Taşımacılığı Yakıt Tüketim Katsayıları).
- **IPCC (Hükümetlerarası İklim Değişikliği Paneli):** 2006 IPCC Guidelines for National Greenhouse Gas Inventories & 2019 Refinement (Cilt 3: Endüstriyel Süreçler ve Ürün Kullanımı - IPPU).
- **Ecoinvent v3.10:** Küresel Yaşam Döngüsü Envanteri (LCI) Veritabanı (Sistem modeli: Allocation, cut-off by classification).
- **DEFRA / DESNZ (Birleşik Krallık Enerji Güvenliği Bakanlığı):** Hükümet Sera Gazı Dönüşüm Faktörleri (Yük Taşımacılığı Katsayıları, 2023).

---

## 4. Matematiksel Formülasyon ve Hesaplama Yöntemi

Platformdaki her bir onaylanmış eşleşme için `scoring.service.ts` ve `reports.service.ts` bileşenlerinde icra edilen formüller şunlardır:

### 4.1. Kaçınılan Birincil Üretim Emisyonu ($\Delta E_{\text{üretim}}$)
Atığın ikame ettiği birincil hammadde ile bu atığın ikincil olarak işlenmesi arasındaki net fark:

$$\Delta E_{\text{üretim}} = Q_{\text{kg}} \times \left( EF_{\text{virgin}} - EF_{\text{secondary}} \right) \times 10^{-3} \quad [\text{tCO}_2\text{e}]$$

Burada:
- $Q_{\text{kg}}$: Eşleşen malzeme miktarı (kilogram).
- $EF_{\text{virgin}}$: Birincil hammadde üretim emisyon faktörü ($\text{kg CO}_2\text{e} / \text{kg malzeme}$).
- $EF_{\text{secondary}}$: Atığın toplanması, ön işlenmesi ve geri kazanımı emisyon faktörü ($\text{kg CO}_2\text{e} / \text{kg malzeme}$).
- $10^{-3}$: Kilogramdan tona ($1000 \text{ kg} = 1 \text{ ton}$) dönüşüm katsayısı.

### 4.2. Lojistik Kaynaklı Ek Emisyon ($E_{\text{lojistik}}$)
Atığın iki tesis arasındaki nakliyesi sırasında açığa çıkan sera gazı emisyonu:

$$E_{\text{lojistik}} = \left( \frac{Q_{\text{kg}}}{1000} \right) \times D_{\text{rota}} \times EF_{\text{transport}} \times 10^{-3} \quad [\text{tCO}_2\text{e}]$$

Burada:
- $D_{\text{rota}}$: Tesisler arası düzeltilmiş karayolu mesafesi ($\text{km}$).
- $EF_{\text{transport}}$: Karayolu yük taşıma emisyon katsayısı ($0.096 \text{ kg CO}_2\text{e} / \text{ton}\cdot\text{km}$ — Kaynak: DEFRA/TÜİK Dizel Kamyon Ortalaması).

### 4.3. Net Sera Gazı Emisyon Tasarrufu ($E_{\text{net}}$)
Gerçekleşen çevresel net kazanım:

$$E_{\text{net}} = \Delta E_{\text{üretim}} - E_{\text{lojistik}} \quad [\text{tCO}_2\text{e}]$$

> *Kural:* Bir eşleşmenin onaylanabilmesi için $E_{\text{net}} > 0$ olmak zorundadır. Nakliye emisyonu tasarrufu aşarsa sistem çevresel faktör skorunu ($F_{\text{çevre}}$) sıfırlar.

### 4.4. CBAM (Sınırda Karbon Düzenleme Mekanizması) Mali Tasarrufu
Avrupa Birliği CBAM düzenlemesi kapsamında Türk sanayicisinin sınırda ödemekten muaf tutulacağı potansiyel karbon sertifikası maliyeti:

$$\text{CBAM}_{\text{Tasarruf}} = E_{\text{net}} \times P_{\text{karbon}} \quad [\text{EUR}]$$

Burada:
- $P_{\text{karbon}}$: 2026 yılı CBAM referans karbon sertifikası fiyatı (**$85 \text{ EUR} / \text{tCO}_2\text{e}$**).

### 4.5. Ton Cinsinden Atık Azaltımı ve Simbiyoz Oranı (SR)
- **Doğrudan Önlenen Atık (Ton):**
  $$\text{Önlenen Atık} = \frac{Q_{\text{kg}}}{1000} \quad [\text{Ton}]$$
- **Organize Sanayi Bölgesi Simbiyoz Oranı (SR):**
  $$\text{Simbiyoz Oranı (SR)} = \frac{\sum Q_{\text{tamamlanan\_eşleşmeler}}}{\sum Q_{\text{toplam\_çıktı\_kayıtları}}} \times 100 \quad [\%]$$

---

## 5. Malzeme Bazlı Emisyon Faktörleri Tablosu

Sistemdeki `carbon_factors` veritabanı tablosunda tanımlanmış ve versiyonlanmış 7 temel malzeme kategorisinin resmî katsayıları:

| Malzeme Sınıfı | Birincil Üretim ($EF_{\text{virgin}}$) | İkincil / Geri Kazanım ($EF_{\text{secondary}}$) | Net Birim Tasarruf ($\text{kg CO}_2\text{e}/\text{kg}$) | Birincil Veri Kaynağı | İkincil Veri Kaynağı |
|---|:---:|:---:|:---:|---|---|
| **Metal** *(Çelik/Alüminyum/Bakır)* | 6.50 | 1.10 | **5.40** | IPCC IPPU & Ecoinvent v3.10 | Ecoinvent v3.10 (Secondary metallurgy) |
| **Tekstil** *(Pamuk/Sentetik Lif)* | 5.50 | 1.20 | **4.30** | Ecoinvent v3.10 & ISO 14067 | ÇŞİDB Geri Kazanım Envanteri |
| **Kimyasal** *(Solvent/Asit/Yağ)* | 4.20 | 1.50 | **2.70** | IPCC Cilt 3 Kategori 2B | Ecoinvent v3.10 (Re-refining) |
| **Plastik** *(PET/HDPE/PP/LDPE)* | 3.50 | 0.85 | **2.65** | PlasticsEurope & Ecoinvent | Ecoinvent v3.10 (Mechanical recycling) |
| **Kâğıt / Karton** | 1.80 | 0.60 | **1.20** | FEFCO & Ecoinvent v3.10 | Ecoinvent v3.10 (De-inking/pulper) |
| **Organik** *(Gıda/Posası/Çamur)* | 1.85 | 0.42 | **1.43** | IPCC Waste Composting | TÜİK Biyometanizasyon/Kompost |
| **Diğer** *(Karma / Mineral / Cam)*| 2.50 | 0.80 | **1.70** | Ecoinvent v3.10 | Ecoinvent v3.10 |

---

## 6. Somut Endüstriyel Vaka Hesaplamaları (Pilot Senaryolar)

Sistemin demo veri setinde (`013_demo_seed_data.sql`) yer alan ve canlı platformda çalışan 3 gerçekçi endüstriyel senaryonun ayrıntılı hesaplaması:

### Senaryo 1: Tekstil Boyahane Arıtma Çamuru $\to$ Çimento Klinkeri Katkısı
- **Çıktı Sahibi:** Doku Tekstil A.Ş. (Bursa Nilüfer OSB)
- **Alıcı:** Uludağ Yapı ve Çimento A.Ş. (Bursa Nilüfer OSB)
- **Malzeme Miktarı:** 24.000 kg/ay (24 Ton)
- **Mesafe:** 8.4 km ($D_{\text{rota}} = 8.4 \times 1.25 = 10.5 \text{ km}$)
- **Hesaplama:**
  - $\Delta E_{\text{üretim}} = 24.000 \times (1.85 - 0.42) \times 10^{-3} = 34.32 \text{ tCO}_2\text{e}$
  - $E_{\text{lojistik}} = 24 \times 10.5 \times 0.096 \times 10^{-3} = 0.024 \text{ tCO}_2\text{e}$
  - $E_{\text{net}} = 34.32 - 0.024 = \mathbf{34.296 \text{ tCO}_2\text{e/ay}}$
  - **Yıllık Önlenen Sera Gazı:** $\approx 411.5 \text{ tCO}_2\text{e}$
  - **Aylık CBAM Finansal Tasarrufu:** $34.296 \times 85 = \mathbf{2.915,16 \text{ EUR}}$
  - **Yıllık CBAM Tasarrufu:** $\approx 35.000 \text{ EUR}$
  - **Önlenen Katı Atık:** **24 Ton/ay (288 Ton/yıl)**

### Senaryo 2: Alüminyum Plaka ve Talaş Hurda $\to$ İkincil Metalurji
- **Çıktı Sahibi:** Pars Makina ve Otomotiv (Kocaeli Dilovası OSB)
- **Alıcı:** Körfez İkincil Döküm A.Ş. (Kocaeli Dilovası OSB)
- **Malzeme Miktarı:** 5.000 kg (5 Ton)
- **Mesafe:** 12.0 km ($D_{\text{rota}} = 15.0 \text{ km}$)
- **Hesaplama:**
  - $\Delta E_{\text{üretim}} = 5.000 \times (6.50 - 1.10) \times 10^{-3} = 27.00 \text{ tCO}_2\text{e}$
  - $E_{\text{lojistik}} = 5 \times 15.0 \times 0.096 \times 10^{-3} = 0.007 \text{ tCO}_2\text{e}$
  - $E_{\text{net}} = 27.00 - 0.007 = \mathbf{26.993 \text{ tCO}_2\text{e}}$
  - **CBAM Finansal Tasarrufu:** $26.993 \times 85 = \mathbf{2.294,40 \text{ EUR}}$
  - **Önlenen Metalik Atık:** **5 Ton**

### Senaryo 3: Endüstriyel LDPE Ambalaj Filmi $\to$ Plastik Granül İmalatı
- **Çıktı Sahibi:** Akdeniz Kimya ve Ambalaj (Ankara İvedik OSB)
- **Alıcı:** Başkent Döngüsel Polimer (Ankara Sincan OSB)
- **Malzeme Miktarı:** 10.000 kg (10 Ton)
- **Mesafe:** 22.0 km ($D_{\text{rota}} = 27.5 \text{ km}$)
- **Hesaplama:**
  - $\Delta E_{\text{üretim}} = 10.000 \times (3.50 - 0.85) \times 10^{-3} = 26.50 \text{ tCO}_2\text{e}$
  - $E_{\text{lojistik}} = 10 \times 27.5 \times 0.096 \times 10^{-3} = 0.026 \text{ tCO}_2\text{e}$
  - $E_{\text{net}} = 26.50 - 0.026 = \mathbf{26.474 \text{ tCO}_2\text{e}}$
  - **CBAM Finansal Tasarrufu:** $26.474 \times 85 = \mathbf{2.250,29 \text{ EUR}}$
  - **Önlenen Plastik Atık:** **10 Ton**

---

## 7. Ölçülebilir Göstergeler (KPI) ve Raporlama

EcoMatch yönetim panellerinde gerçek zamanlı olarak izlenen ve aylık resmi raporlara yansıtılan temel metrikler:

| Gösterge (KPI) | Birim | Hesaplama Yöntemi | İzleme Sıklığı |
|---|:---:|---|:---:|
| **Toplam Önlenen Atık** | Ton | $\sum Q_{\text{matched}} / 1000$ | Anlık |
| **Kümülatif CO2 Tasarrufu** | tCO2e | $\sum E_{\text{net}}$ | Anlık |
| **CBAM Karbon Maliyeti Avantajı** | EUR | $\sum \text{CBAM}_{\text{Tasarruf}}$ | Anlık / Aylık |
| **Simbiyoz Verimlilik Oranı** | % | $(\sum Q_{\text{tamamlanan}} / \sum Q_{\text{toplam}}) \times 100$ | Aylık |
| **Ortalama Eşleşme Mesafesi** | km | $\text{Ortalama}(D_{\text{rota}})$ | Aylık |
| **Tesis Başına Karbon İntensitesi** | tCO2e/tesis| $\sum E_{\text{net}} / N_{\text{aktif\_tesis}}$ | Aylık |

---

## 8. Veri Bütünlüğü, Versiyonlama ve Geçmişe Yürümeme (Non-Retroactivity)

1. **Zaman Damgalı Katsayı Versiyonlama:**
   - Veritabanındaki `carbon_factors` tablosu `valid_from` ve `valid_to` zaman damgalarını barındırır.
   - Bilimsel katsayılar güncellendiğinde eski kayıt silinmez; `valid_to` tarihi kapatılarak yeni katsayı yeni bir satır olarak eklenir.
2. **Kayıt Anı Dondurma İlkesi (Immutability):**
   - Bir eşleşme onaylandığı ve rapor oluşturulduğu anda o gün geçerli olan emisyon faktörü rapora kalıcı olarak kaydedilir. Gelecekte bir katsayı değiştiğinde geriye dönük olarak eski raporların değerleri **kesinlikle değiştirilemez**. Bu yaklaşım bağımsız denetim ve resmi teftişlerde veri tutarlılığını garanti eder.
3. **Şeffaf Doğrulama İzi:**
   - Üretilen her PDF ve JSON raporunda formülasyonda kullanılan emisyon faktörü ve referans alınan resmî kaynak açıkça basılır.
