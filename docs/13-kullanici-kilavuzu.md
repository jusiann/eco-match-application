# Bölüm 13: Kullanıcı Kılavuzu (Rol Bazlı Son Kullanıcı El Kitabı)

> **Belge No:** EM-USR-2026-V1  
> **Yarışma:** TEKNOFEST 2026 — Sıfır Atık ve Döngüsel Ekonomi  
> **Takım:** VectorMatch (#1003771)  
> **İlgili Şartname Maddesi:** Madde 10.3 (Başlık 3: Kullanıcı Kılavuzu)  
> **Uygulama Adresi:** `http://localhost:8080` (Tüm roller için tek giriş noktası)

---

## 1. Giriş ve Genel Bakış

EcoMatch; organize sanayi bölgelerinde bir tesisin atık ve yan ürünlerini diğer bir tesisin hammadde ihtiyacıyla eşleştiren, karbon tasarrufunu hesaplayan ve Dijital Ürün Pasaportu (DPP) üreten akıllı endüstriyel simbiyoz platformudur.

Platform, farklı sorumluluklara sahip 4 temel aktör rolü üzerinden çalışır:
1. **Tesis Yetkilisi:** Atık (çıktı) ve hammadde (girdi) yönetimi, eşleşme arama, kabul/red.
2. **OSB Yöneticisi:** Bölgesel döngüsellik takibi, harita analizi, aylık resmi raporlar.
3. **HITL Uzmanı:** Düşük güven skorlu (< 0.80) yapay zekâ sınıflandırmalarını denetleme.
4. **Sistem Yöneticisi:** Tesis doğrulama, AHP skorlama ağırlıkları, IoT API anahtarları.

---

## 2. Tesis Yetkilisi Kullanım Rehberi

### 2.1. Kayıt Olma ve Giriş
1. Tarayıcınızda `http://localhost:8080` adresine gidin.
2. Sağ üstteki **"Giriş Yap / Kayıt Ol"** bağlantısına tıklayın.
3. Tesisinizin resmî bilgilerini doldurun:
   - **Tesis Adı:** (Örn: *Doku Tekstil A.Ş.*)
   - **Vergi No (10 Haneli):** (Örn: *1234567890*)
   - **Sektör:** Açılır menüden sektörünüzü seçin (*Tekstil, Metalurji, Kimya vb.*)
   - **Bağlı Bulunan OSB:** (Örn: *Bursa Nilüfer OSB*)
   - **Harita Konumu:** Tesisinizin koordinatlarını harita üzerinden işaretleyin.
4. **Onay Süreci Uyarısı:** Kayıt sonrası tesisiniz Sistem Yöneticisi tarafından onaylanana kadar ana ekranda *"Tesisiniz Doğrulama Bekliyor"* uyarısı görüntülenir. Onay tamamlanana kadar malzeme ekleme yetkisi kısıtlıdır.

---

### 2.2. Çıktı (Atık / Yan Ürün) İlanı Verme
Tesisinizde açığa çıkan atığı sisteme kaydetmek için:

```
┌──────────────────────────────────────────────────────────────────────────┐
│  YENİ ÇIKTI (ATIK / YAN ÜRÜN) KAYDI                                     │
├──────────────────────────────────────────────────────────────────────────┤
│  Malzeme Tanımı: [ Tekstil boyahanesi arıtma çamuru, selüloz lifli    ]  │
│  Miktar (kg/ay): [ 24000            ]  Fiziksel Hal: [ Katı/Çamur ▼ ]    │
│  Bileşim (%):    [ Nem: %30, Lif: %60, Kül: %10                      ]    │
│                                                                          │
│  [ Yapay Zekâ ile Sınıflandır ]  →  [ AI Güven Skoru: %94 (ORGANİK) ]   │
│                                                                          │
│  [ İptal ]                                       [ Kaydet ve DPP Üret ] │
└──────────────────────────────────────────────────────────────────────────┘
```

1. Sol menüden **"Malzemelerim"** sekmesine gelin ve **"Yeni Çıktı Ekle"** butonuna basın.
2. **Malzeme Tanımı:** Serbest metin olarak malzemenizi açıklayın (*"Tekstil boyahanesi çıkışı arıtma çamuru..."*).
3. **Yapay Zekâ Analizi:** Sistem, siz yazarken arka plandaki SBERT modelini tetikler:
   - AI güven skoru **$\ge \%80$** ise kategori otomatik seçilir ve yeşil onay rozeti belirir.
   - AI güven skoru **$<\%80$** ise sistem uyarı verir: *"Kayıt otomatik olarak Uzman İnceleme Kuyruğuna (HITL) yönlendirilecektir."*
4. **Miktar ve Periyot:** Aylık çıkış miktarını kilogram (kg) cinsinden girin.
5. **Kaydet Butonu:** Kaydettiğiniz anda sistem arka planda **Dijital Ürün Pasaportunu (DPP)** ve benzersiz kriptografik **QR Kodu** otomatik oluşturur.

---

### 2.3. Girdi (Hammadde İhtiyacı) Tanımlama
Tesisinizde hammadde olarak ikame edebileceğiniz ikincil malzeme talebi oluşturmak için:
1. **"Malzemelerim"** $\to$ **"Yeni Girdi Ekle"** butonuna tıklayın.
2. Aradığınız malzemenin sınıfını, kabul edilebilir teknik toleransları (ör. maksimum %15 nem oranı) ve aylık ihtiyaç miktarınızı (kg) girin.

---

### 2.4. Eşleşme Arama ve Skor Kartı İnceleme
1. Sol menüden **"Eşleştirmelerim"** ekranına gidin.
2. Çıktı malzemenizin yanındaki **"Eşleştirmeleri Bul"** butonuna tıklayın.
3. Sistem en uygun 10 adayı 5 faktörlü AHP algoritmasıyla skorlayarak listeler:

```
┌──────────────────────────────────────────────────────────────────────────┐
│  EŞLEŞME ADAYI #1: Uludağ Çimento A.Ş. (Bursa Nilüfer OSB)               │
├──────────────────────────────────────────────────────────────────────────┤
│  Genel Eşleşme Skoru: %88.4   |   Mesafe: 8.4 km (Düşük Karbon Ayak İzi) │
│                                                                          │
│  [ Malzeme: %92 ]  [ Kalite: %85 ]  [ Çevre: %90 ]  [ Lojistik: %88 ]     │
│                                                                          │
│  Potansiyel Net CO2 Tasarrufu: 34.30 tCO2e/ay                            │
│  Tahmini CBAM (SKDM) Avantajı: 2.915,16 EUR/ay                           │
│                                                                          │
│  [ Haritada Gör ]                [ Teklifi Reddet ]   [ Eşleşmeyi Kabul Et ]
└──────────────────────────────────────────────────────────────────────────┘
```

- **Gizlilik İlkesi:** Eşleşme teklifi henüz iki tarafça kabul edilmediği sürece, karşı tesisin telefon ve yetkili kişi bilgileri gizlenir (*"Bursa OSB'de bir çimento fabrikası"* şeklinde genel gösterilir).

---

### 2.5. Eşleşme Kabulü ve İletişimin Açılması
1. Şartları uygun bulursanız **"Eşleşmeyi Kabul Et"** butonuna basın.
2. Karşı taraf da teklifi kabul ettiğinde eşleşme durumu `completed` (tamamlandı) haline gelir.
3. Sistem her iki tarafa gerçek zamanlı WebSocket bildirimi gönderir ve **"İletişim Bilgileri"** kartı açılır (Yetkili adı, şirket e-postası, doğrudan santral telefonu).
4. Eşleşme onaylandığı andan itibaren taraflar ortak **Çevresel Etki ve CBAM Raporunu** PDF olarak indirebilir.

---

### 2.6. Dijital Ürün Pasaportu (DPP) ve QR Kod Doğrulama
1. **Pasaportu Görüntüleme:** Çıktı listesindeki **"DPP"** butonuna basarak pasaport detayını inceleyin.
2. **QR Kod İndirme:** Sevkiyat kasalarına veya ambalajlarına yapıştırılmak üzere QR kodu PNG veya PDF etiket olarak indirin.
3. **Saha Doğrulaması:** Mobil kamera veya barkod okuyucu ile QR kod tarandığında tarayıcıda doğrudan `http://localhost:8080/dpp/<id>?sig=...` sayfası açılır; oturum açma zorunluluğu olmadan malzemenin menşei, test sonuçları ve karbon ayak izi doğrulanabilir.

---

## 3. OSB Yöneticisi Kullanım Rehberi

### 3.1. OSB Gösterge Paneli (Dashboard)
1. OSB yöneticisi hesabıyla giriş yapın (`mehmet@bursaniluferosb.gov.tr`).
2. Sol menüden **"OSB Paneli"** sekmesini seçin.
3. Bölgenize ait kümülatif göstergeler kartlar halinde listelenir:
   - **Kayıtlı Tesis Sayısı:** Bölgedeki aktif ve onaylı sanayi tesisleri.
   - **Aktif Simbiyoz Sayısı:** Gerçekleşen atık-hammadde transferleri.
   - **Aylık Toplam CO2 Tasarrufu (tCO2e):** Bölge genelinde önlenen sera gazı.
   - **Simbiyoz Verimlilik Oranı (%):** Önlenen katı atık yüzdesi.

### 3.2. Bölgesel Simbiyoz Haritası
- Ekranda yer alan Leaflet tabanlı interaktif haritada, bölgenizdeki tesisler sektörlerine göre renkli pinlerle gösterilir.
- Tamamlanan eşleşmeler, tesisler arasında çizilen animasyonlu yeşil akış çizgileriyle görselleştirilir; çizgiye tıklandığında transfer edilen malzeme cinsi ve aylık tonaj bilgisi açılır.

### 3.3. Resmi Rapor İndirme
- Sağ üstteki **"Aylık Rapor Üret"** butonuna tıklayarak bölgenin o aya ait tüm simbiyoz verilerini içeren resmî **PDF Çevresel Etki Raporunu** veya Bakanlık bildirim formatına uygun **XLSX (Excel)** tablosunu indirin.

---

## 4. HITL (İnsan Denetimi) Uzmanı Kullanım Rehberi

### 4.1. İnceleme Kuyruğu (`Review Queue`)
1. Uzman hesabıyla giriş yapın (`kaan@ecomatch.app`).
2. Sol menüden **"Uzman İnceleme Kuyruğu"** sekmesine tıklayın.
3. Yapay zekâ sınıflandırma güven skoru %80'in altında kaldığı için beklemeye alınan atık kayıtları listelenir.

### 4.2. Değerlendirme ve Onay Ekranı
1. İncelenecek kaydın yanındaki **"İncele"** butonuna tıklayın.
2. Ekranda kullanıcının yazdığı serbest açıklama ve yapay zekânın önerdiği en olası 3 kategori olasılıklarıyla gösterilir:
   - *1. Tahmin:* Organik (%68)
   - *2. Tahmin:* Kimyasal (%22)
   - *3. Tahmin:* Diğer (%10)
3. **Onay / Düzeltme:** 
   - Doğru kategoriyi seçin ve gerekçe notunuzu ekleyin.
   - **"Onayla ve Yayına Al"** butonuna basın.
4. Yapılan seçim anında `training/human_reviewed.jsonl` dosyasına eklenerek modelin bir sonraki sürüm eğitimine aktarılır; malzeme ise onaylı olarak eşleştirme havuzuna dahil edilir.

---

## 5. Sistem Yöneticisi (Admin) Kullanım Rehberi

### 5.1. Tesis Doğrulama
1. Admin hesabıyla giriş yapın (`ayse@ecomatch.app`).
2. **"Admin Paneli"** $\to$ **"Tesis Doğrulama"** sekmesine gidin.
3. Yeni kayıt olan tesislerin Vergi Kimlik Numarası (VKN), unvanı ve yüklediği sanayi sicil belgelerini inceleyin.
4. Bilgiler doğruysa **"Tesisi Doğrula"** butonuna tıklayın. Tesis yetkilisine sistem erişim onayı gönderilir.

### 5.2. AHP Skorlama Ağırlıklarını Düzenleme
Platformun eşleştirme algoritmasında kullandığı 5 temel faktörün ağırlıklarını güncelleyebilirsiniz:
- **Malzeme Uyumu:** Varsayılan %30
- **Kalite / Spek Uyumu:** Varsayılan %20
- **Çevresel Etki (CO2):** Varsayılan %20
- **Lojistik Mesafe:** Varsayılan %15
- **Ekonomik Tasarruf:** Varsayılan %15
- *Kural:* Toplam her zaman %100 olmak zorundadır. Yapılan her değişiklik yeni bir versiyon numarasıyla `weights_config` tablosuna kaydedilir ve anında yürürlüğe girer (kod deploy gerektirmez).

### 5.3. IoT Cihazları ve API Anahtarları
- Tesislerin dijital kantar veya silo seviye sensörlerinin EcoMatch'e otomatik stok bildirmesi için güvenli `API Key` üretin.
- Üretilen anahtar SHA-256 ile şifrelenir; cihazlar `x-api-key` HTTP başlığı ile stok verilerini güncelleyebilir.
