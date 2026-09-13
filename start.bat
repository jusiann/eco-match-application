@echo off
chcp 65001 > nul
title EcoMatch - TEKNOFEST 2026 Tek Tıkla Başlatıcı

echo ===============================================================================
echo          EcoMatch Platformu - TEKNOFEST 2026 Teknik Doğrulama Ortamı
echo          Takım: VectorMatch (#1003771)  ^|  Sıfır Atık ve Döngüsel Ekonomi
echo ===============================================================================
echo.

where docker >nul 2>nul
if %errorlevel% neq 0 (
    echo [HATA] Docker kurulu bulunamadı!
    echo Lütfen Docker Desktop programını kurup başlattıktan sonra bu dosyayı tekrar çalıştırın.
    echo İndirme: https://www.docker.com/products/docker-desktop/
    echo.
    pause
    exit /b 1
)

echo [1/3] Docker motorunun çalışır durumda olduğu doğrulanıyor...
docker info >nul 2>nul
if %errorlevel% neq 0 (
    echo [UYARI] Docker Desktop başlatılmamış görünüyor. Lütfen Docker Desktop'ı açıp bekleyin.
    pause
    exit /b 1
)

echo [2/3] EcoMatch mikroservisleri derleniyor ve ayağa kaldırılıyor...
echo       (İlk başlatmada HuggingFace modeli ve veritabanı tohumları yüklenecektir)
echo.
docker compose up -d --build

if %errorlevel% neq 0 (
    echo.
    echo [HATA] Docker compose başlatılırken bir sorun oluştu.
    pause
    exit /b 1
)

echo.
echo [3/3] Servisler başarıyla başlatıldı!
echo.
echo ===============================================================================
echo   Web Arayüzü (Kullanıcı / Jüri) : http://localhost:8080
echo   API Swagger Dokümantasyonu      : http://localhost:8080/api/docs
echo   Backend Doğrudan Port          : http://localhost:3001
echo   AI Mikroservisi Port            : http://localhost:8000/docs
echo   Demo Giriş Şifresi              : Ecomatch2026!
echo ===============================================================================
echo.
echo Tarayıcınızda EcoMatch ana sayfası açılıyor...
timeout /t 3 > nul
start http://localhost:8080

echo.
echo Sistemi durdurmak için bu dizinde 'docker compose down' komutunu çalıştırabilirsiniz.
echo.
pause
