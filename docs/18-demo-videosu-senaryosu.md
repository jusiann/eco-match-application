# Bölüm 18: Demo Videosu Senaryosu ve Çekim Kılavuzu

> **Belge No:** EM-VID-2026-V1  
> **Yarışma:** TEKNOFEST 2026 — Sıfır Atık ve Döngüsel Ekonomi  
> **Takım:** VectorMatch (#1003771)  
> **İlgili Şartname Maddesi:** Madde 10.3 (Başlık 7: Demo Videosu)  
> **Süre:** 05:00 Dakika  
> **Hedef:** Jüri heyetine platformun çalışır durumunu, 4 aktör rolünü, YZ eşleştirme motorunu, DPP ve CBAM raporlama kabiliyetlerini canlı ekran kaydıyla kanıtlamak.

---

## 1. Demo Video Bağlantıları

> **YouTube (Liste Dışı / 1080p HD):**  
> `https://www.youtube.com/watch?v=EcoMatch-TEKNOFEST-2026` *(Yükleme sonrası link buraya eklenecektir)*
>
> **Google Drive / Bulut Yedek Linki:**  
> `https://drive.google.com/file/d/EcoMatch-Demo-Video/view?usp=sharing` *(MP4 1080p ham dosya)*

---

## 2. Dakika Dakika Çekim Planı ve Seslendirme Metni (00:00 - 05:00)

### [00:00 - 00:45] Giriş, Problem ve Mimari Tanıtımı
- **Görsel:**
  - EcoMatch açılış logosu ve TEKNOFEST 2026 VectorMatch takım kimliği.
  - Terminal ekranı: `docker compose up --build` komutunun tek satırda 5 servisi (`web`, `backend`, `ai-service`, `db`, `pgvector`) ayağa kaldırışının hızlandırılmış görüntüsü.
  - Tarayıcıda `http://localhost:8080` adresinin açılması.
- **Seslendirme (Voiceover):**
  *"Merhaba. TEKNOFEST 2026 Sıfır Atık ve Döngüsel Ekonomi yarışması için geliştirdiğimiz EcoMatch platformuna hoş geldiniz. Sanayide bir tesisin atığı, diğer bir tesisin hammaddesidir. EcoMatch; organize sanayi bölgelerinde endüstriyel simbiyozu yapay zekâ ile otomatikleştiren, karbon emisyonu tasarrufunu hesaplayan ve Dijital Ürün Pasaportu üreten milli bir altyapıdır. Sistemimiz tamamen Docker üzerinde tek komutla bağımsız olarak çalışabilmektedir."*

---

### [00:45 - 01:50] 1. Rol: Tesis Yetkilisi — Atık Kaydı, AI Sınıflandırma ve DPP
- **Görsel:**
  - `aylin@dokutekstil.com.tr` hesabıyla giriş yapılması.
  - "Malzemelerim" $\to$ "Yeni Çıktı Ekle" ekranı.
  - Açıklama alanına: *"Tekstil boyahanesi çıkışı arıtma çamuru, selüloz lifli, nem %30"* yazılması.
  - Arka planda SBERT modelinin anında çalışarak **"AI Güven Skoru: %94 - ORGANİK"** etiketini yeşil rozetle ekrana getirmesi.
  - Formun kaydedilmesi ve sistemin saniyeler içinde **Dijital Ürün Pasaportu (DPP)** ile kriptografik **QR Kodu** üretmesi.
  - QR kodun telefondan taranarak kamusal `/dpp/:id` ekranının doğrulandığının gösterilmesi.
- **Seslendirme:**
  *"Doku Tekstil yetkilisi olarak sisteme boyahane arıtma çamurumuzu tanımlıyoruz. Yapay zekâ modelimiz metni anında anlamsal olarak analiz ederek %94 güven skoru ile 'Organik' kategorisine yerleştirdi. Kayıtla birlikte AB ESPR regülasyonuna tam uyumlu Dijital Ürün Pasaportumuz ve doğrulanabilir QR kodumuz otomatik olarak oluşturuldu."*

---

### [01:50 - 02:50] 2. Rol: 5 Faktörlü Eşleştirme Motoru ve Kabul Akışı
- **Görsel:**
  - "Eşleştirmeleri Bul" butonuna basılması.
  - pgvector HNSW araması ve 5 faktörlü AHP skor kartının açılması.
  - En üstteki adayın gösterilmesi: *Uludağ Çimento A.Ş. — Eşleşme Skoru: %88.4, Mesafe: 8.4 km, Net CO2 Tasarrufu: 34.30 tCO2e/ay, CBAM Avantajı: 2.915 EUR/ay.*
  - Tesis yetkilisinin "Kabul Et" butonuna basması.
  - Oturumdan çıkılıp alıcı tesis olan `ali@yapigrup.com.tr` ile giriş yapılması.
  - Gelen teklifin incelenip karşı taraftan da "Kabul Et" butonuna basılması.
  - Eşleşmenin `completed` durumuna geçmesi, gerçek zamanlı WebSocket bildiriminin düşmesi ve daha önce gizli olan firma telefon ve yetkili iletişim bilgilerinin iki tarafa da açılması.
- **Seslendirme:**
  *"Eşleştirme motorumuz pgvector üzerinde 768 boyutlu kosinüs benzerliğini, PostGIS ile coğrafi mesafeyi ve kimyasal uyumu tek bir sorguda birleştirdi. 8.4 km mesafedeki çimento fabrikasıyla aylık 34 tonluk CO2 tasarrufu sağlayan eşleşmeyi bulduk. Karşılıklı kabul işlemi tamamlandığında gizlilik filtresi kalktı ve doğrudan iletişim bilgileri taraflarla paylaşıldı."*

---

### [02:50 - 03:45] 3. Rol: OSB Yöneticisi — Bölgesel Göstergeler ve Resmi Raporlama
- **Görsel:**
  - `mehmet@bursaniluferosb.gov.tr` hesabıyla giriş.
  - "OSB Paneli" dashboard ekranı: Toplam tesis sayısı, aktif eşleşmeler, bölge kümülatif CO2 tasarrufu KPI sayaçları.
  - Leaflet interaktif haritasında tesis pinleri ve aralarındaki yeşil hareketli simbiyoz akış hatlarının gösterilmesi.
  - "Aylık Rapor İndir" butonuna tıklanarak resmi formatlı PDF ve Excel (XLSX) raporlarının bilgisayara indirilip açılması.
- **Seslendirme:**
  *"Bursa Nilüfer OSB Yöneticisi panelinde bölge genelindeki tüm döngüsel malzeme akışlarını interaktif harita üzerinden anlık izliyoruz. Sistem, Bakanlık standartlarına uygun olarak hesaplanan aylık çevresel etki ve CBAM karbon raporlarını tek tıkla PDF ve Excel olarak üretiyor."*

---

### [03:45 - 04:30] 4. Rol: HITL Uzmanı — Düşük Güven Skorlu Kayıtların Denetimi
- **Görsel:**
  - `kaan@ecomatch.app` uzman hesabıyla giriş.
  - "Uzman İnceleme Kuyruğu" ekranı.
  - Yapay zekâ güven skoru %80'in altında kaldığı için beklemeye alınan bir malzemenin açılması.
  - Sistemin uzman için ürettiği Top-3 kategori olasılıklarının (%68 Organik, %22 Kimyasal, %10 Diğer) gösterilmesi.
  - Uzmanın doğru kategoriyi işaretleyip onaylaması; onaylanan verinin `training/human_reviewed.jsonl` dosyasına yazıldığının terminalden gösterilmesi.
- **Seslendirme:**
  *"Sistemimizin en güçlü yönlerinden biri İnsan Denetimi (HITL) mekanizmasıdır. Modelin güven skoru %80'in altında kaldığında malzeme doğrudan yayına alınmaz, alan uzmanının kuyruğuna düşer. Uzmanın yaptığı her düzeltme, modelimizin bir sonraki sürümü için sürekli öğrenme verisi olarak kaydedilir."*

---

### [04:30 - 05:00] Kapanış ve Şartname Uyumluluk Özeti
- **Görsel:**
  - Swagger API dokümantasyonu (`http://localhost:8080/api/docs`), mimari diyagramlar ve `docs/` kütüphanesinin gösterilmesi.
  - Kapanış jeneriği: VectorMatch Takımı, TEKNOFEST 2026.
- **Seslendirme:**
  *"EcoMatch; açık kaynaklı MIT lisansı, dışa kapalı güvenli veri mimarisi, bilimsel LCA emisyon metodolojisi ve çalışan eksiksiz mikroservis yapısıyla TEKNOFEST 2026 şartnamesinin tüm maddelerini tam olarak karşılamaktadır. Sanayimizin yeşil dönüşümüne güç vermeye hazırız. Teşekkür ederiz."*

---

## 3. Video Kayıt ve Prodüksiyon Yönergeleri
1. **Çözünürlük ve Format:** 1920x1080 (Full HD), 60 fps, MP4 formatı (H.264 video kodeki, AAC ses).
2. **Kayıt Aracı:** OBS Studio veya Camtasia (sistem sesleri ve mikrofon gürültü filtresi devrede).
3. **Görsel Temizlik:** Tarayıcı yer imleri çubuğu gizlenmeli, tarayıcı penceresi %100 ölçekte tam ekran olmalıdır.
4. **Zaman Uyumu:** Video süresi kesinlikle **05:00 dakikayı aşmamalıdır** (Şartname kuralı).
