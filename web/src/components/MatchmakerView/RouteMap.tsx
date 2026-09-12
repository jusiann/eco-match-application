"use client";

import React, { useEffect, useRef } from "react";
import L from "leaflet";

interface RouteMapProps {
  origin: { lat: number; lng: number } | null;
  destination: { lat: number; lng: number } | null;
  destinationLabel: string;
  distanceKm: number | null;
}

// Leaflet'in varsayılan marker PNG'leri bundler altında kırık path'lere
// düşüyor (yaygın bilinen sorun) -- ek asset/config yerine basit, uygulamanın
// renk paletine uyan bir DivIcon (nokta + halka) kullanıyoruz.
function pinIcon(color: string): L.DivIcon {
  return L.divIcon({
    className: "",
    html: `<div style="width:14px;height:14px;border-radius:50%;background:${color};border:2.5px solid #fffdf8;box-shadow:0 0 0 2px ${color}"></div>`,
    iconSize: [14, 14],
    iconAnchor: [7, 7],
  });
}

// Gerçek harita (Leaflet + OpenStreetMap tile'ları) -- origin (kendi tesisiniz)
// ve destination (karşı tarafın yaklaşık konumu, K-23: 1 ondalık yuvarlanmış,
// ~11km hassasiyet) arasında bir rota çizgisi gösterir. İkisi de gerçek/yaklaşık
// koordinat, eskisi gibi dekoratif/sabit pozisyon değil.
export default function RouteMap({ origin, destination, destinationLabel, distanceKm }: RouteMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!containerRef.current || !origin || !destination) return;

    const map = L.map(containerRef.current, {
      zoomControl: false,
      scrollWheelZoom: false,
    });

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: 18,
    }).addTo(map);

    const originLatLng = L.latLng(origin.lat, origin.lng);
    const destLatLng = L.latLng(destination.lat, destination.lng);

    L.marker(originLatLng, { icon: pinIcon("#1e5f46") }).addTo(map).bindTooltip("Tesisiniz");
    L.marker(destLatLng, { icon: pinIcon("#0f7a6c") }).addTo(map).bindTooltip(destinationLabel);

    // Rota gelene kadar (veya hiç gelmezse) kuş uçuşu düz çizgi -- harita hiç boş
    // kalmasın. Gerçek rota gelince bunun yerini alır.
    const straightLine = L.polyline([originLatLng, destLatLng], {
      color: "#1e5f46",
      weight: 2,
      dashArray: "6 4",
    }).addTo(map);
    map.fitBounds(straightLine.getBounds(), { padding: [28, 28], maxZoom: 11 });

    let cancelled = false;

    // OSRM'in genel demo sunucusu -- ücretsiz, API anahtarsız, ama SLA'sız/limitli
    // (bkz. project-osrm.org/docs -- "Do not use for production"). Gözlemlenen: aynı
    // sorgu bazen tek seferde 400 InvalidQuery dönüp hemen ardından 200 dönebiliyor
    // (geçici/flaky, sunucu tarafı) -- bu yüzden tek denemede pes etmeden önce bir
    // kez daha deniyoruz. Yine de başarısız olursa düz çizgi kalır (aşağıdaki catch).
    async function fetchRoute(): Promise<{ routes?: Array<{ geometry: { coordinates: [number, number][] } }> }> {
      const url = `https://router.project-osrm.org/route/v1/driving/${origin!.lng},${origin!.lat};${destination!.lng},${destination!.lat}?overview=full&geometry=geojson`;
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          const res = await fetch(url);
          if (res.ok) return res.json();
        } catch {
          // ağ hatası -- bir sonraki denemeye düş
        }
        if (attempt === 0) await new Promise((r) => setTimeout(r, 600));
      }
      throw new Error("OSRM: 2 deneme de başarısız");
    }

    fetchRoute()
      .then((data) => {
        if (cancelled) return;
        const coords = data.routes?.[0]?.geometry?.coordinates;
        if (!coords || coords.length < 2) return; // rota bulunamadı -- düz çizgi kalır

        const routeLatLngs = coords.map(([lng, lat]) => L.latLng(lat, lng));
        const routeLine = L.polyline(routeLatLngs, { color: "#1e5f46", weight: 3 }).addTo(map);
        map.removeLayer(straightLine);
        map.fitBounds(routeLine.getBounds(), { padding: [28, 28], maxZoom: 12 });
      })
      // Rota servisi ulaşılamazsa sessizce düz çizgide kal -- harita hiç
      // gösterilmemesindense yaklaşık bir çizgi göstermek daha iyi (aynı
      // "AI/servis çökerse sessizce geriye düş" ilkesi, bkz. ai-client.service.ts).
      .catch(() => {});

    return () => {
      cancelled = true;
      map.remove();
    };
  }, [origin?.lat, origin?.lng, destination?.lat, destination?.lng, destinationLabel]);

  if (!origin || !destination) {
    return (
      <div className="w-full h-full flex items-center justify-center text-xs text-on-surface-variant text-center p-4">
        Konum bilgisi mevcut değil{distanceKm !== null ? ` (mesafe: ${distanceKm} km)` : ""}.
      </div>
    );
  }

  return <div ref={containerRef} className="w-full h-full" />;
}
