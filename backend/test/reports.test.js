// ═══════════════════════════════════════════════════════════════
//  Raporlar (Reports) Modülü Testleri — Çevresel Etki, CBAM,
//  DPP Raporu, Geçmiş Rapor Listesi (Faz 2.6)
// ═══════════════════════════════════════════════════════════════

import { BASE_URL, TEST_DATA, state, assert, api, section, prisma } from './helpers.js';

export const testReports = async () => {
    section('11. RAPORLAR (REPORTS) MODÜLÜ (/v1/reports/*)');

    // Kendi tamamlanmış eşleşmemizi kuruyoruz -- matches.test.js'e bağımlı olmadan
    const output = await api('POST', '/materials/outputs', {
        description: 'Rapor testi için çıktı',
        materialClass: 'metal',
        quantityKg: 500,
        stock: 500,
    }, state.accessToken);
    const input = await api('POST', '/materials/inputs', {
        description: 'Rapor testi için girdi',
        materialClass: 'metal',
        quantityKg: 200,
    }, state.consumerToken);
    const match = await prisma.match.create({
        data: {
            outputId: output.outputId,
            inputId: input.inputId,
            totalScore: 80,
            breakdown: { material: 80, quality: 80, environmental: 80, logistics: 80, economic: 80 },
            demandQty: 200,
            co2Saved: 330,
            costSaving: 260,
            cbamImpact: 28.05,
            status: 'PENDING',
            expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        },
    });

    // Tamamlanmadan önce environmental rapor alınabilir (docs/04'te statü kısıtı yok)
    const envBeforeComplete = await api('GET', `/reports/environmental/${match.id}`, null, state.accessToken);
    assert(envBeforeComplete.status === 200, `Tamamlanmadan önce environmental rapor 200 döner (alınan: ${envBeforeComplete.status})`, envBeforeComplete);
    assert(envBeforeComplete.co2_saved_kg === 330, 'Rapor, eşleşmenin kendi co2Saved değerini kullanıyor');

    // CBAM ise SADECE completed eşleşme için üretilebilir
    const cbamBeforeComplete = await api('GET', `/reports/cbam/${match.id}`, null, state.accessToken);
    assert(cbamBeforeComplete.status === 403, `Tamamlanmamış eşleşmede CBAM raporu 403 döner (alınan: ${cbamBeforeComplete.status})`, cbamBeforeComplete);
    assert(cbamBeforeComplete.error === 'REPORT_NOT_AVAILABLE', 'Hata kodu REPORT_NOT_AVAILABLE');

    // Eşleşmeyi tamamlıyoruz
    await api('POST', `/matches/${match.id}/accept`, null, state.accessToken);
    const completeRes = await api('POST', `/matches/${match.id}/accept`, null, state.consumerToken);
    assert(completeRes.bodyStatus === 'completed', 'Eşleşme tamamlandı');

    // ── Environmental rapor (JSON) ──
    const envRes = await api('GET', `/reports/environmental/${match.id}`, null, state.accessToken);
    assert(envRes.status === 200, `Environmental rapor (JSON) 200 döner (alınan: ${envRes.status})`, envRes);
    assert(envRes.report_type === 'environmental', 'report_type doğru');
    assert(envRes.virgin_factor_co2_per_kg > envRes.secondary_factor_co2_per_kg, 'virgin faktör secondary\'den büyük (metal: 2.30 > 0.65)');

    const dbEnvReport = await prisma.report.findFirst({ where: { matchId: match.id, reportType: 'ENVIRONMENTAL' } });
    assert(!!dbEnvReport, 'reports tablosuna ENVIRONMENTAL satırı yazıldı (AD3: donmuş snapshot)');

    // ── Environmental rapor (PDF binary) ──
    const envPdfRes = await fetch(`${BASE_URL}/reports/environmental/${match.id}?format=pdf`, {
        headers: { Authorization: `Bearer ${state.accessToken}` },
    });
    const envPdfBuffer = Buffer.from(await envPdfRes.arrayBuffer());
    assert(envPdfRes.status === 200, `Environmental rapor (PDF) 200 döner (alınan: ${envPdfRes.status})`);
    assert(envPdfRes.headers.get('content-type')?.includes('application/pdf'), 'content-type application/pdf');
    assert(envPdfBuffer.subarray(0, 4).toString() === '%PDF', 'Gerçek bir PDF döndü');

    // ── CBAM rapor (tamamlandıktan sonra) ──
    const cbamRes = await api('GET', `/reports/cbam/${match.id}`, null, state.accessToken);
    assert(cbamRes.status === 200, `Tamamlanmış eşleşmede CBAM raporu 200 döner (alınan: ${cbamRes.status})`, cbamRes);
    assert(cbamRes.report_type === 'cbam', 'report_type doğru');
    assert(cbamRes.carbon_price_eur_per_ton === 85, 'Karbon fiyatı docs/05 sabiti (85 EUR/ton)');
    assert(typeof cbamRes.cbam_saving_eur === 'number', 'cbam_saving_eur hesaplandı');

    const dbCbamReport = await prisma.report.findFirst({ where: { matchId: match.id, reportType: 'CBAM' } });
    assert(!!dbCbamReport, 'reports tablosuna CBAM satırı yazıldı');

    // Karşı taraf da (consumer) rapor alabilir -- "Taraflardan biri"
    const cbamFromConsumer = await api('GET', `/reports/cbam/${match.id}`, null, state.consumerToken);
    assert(cbamFromConsumer.status === 200, 'Consumer tarafı da CBAM raporu alabilir');

    // ── DPP raporu (sahip kimlik doğrulamasıyla) ──
    const dppReportRes = await api('GET', `/reports/dpp/${output.passportId}`, null, state.accessToken);
    assert(dppReportRes.passport_id === output.passportId, 'DPP raporu doğru passport_id\'yi döndürüyor (sahip auth, imza gerekmiyor)');

    // ── GET /v1/reports (geçmiş, sayfalı) ──
    const listRes = await api('GET', '/reports', null, state.accessToken);
    assert(listRes.status === 200, `GET /v1/reports 200 döner (alınan: ${listRes.status})`, listRes);
    assert((listRes.data || []).some((r) => r.matchId === match.id), 'Az önce üretilen raporlar geçmiş listesinde görünüyor');

    // ── NEGATİF SENARYOLAR ──
    section('11.1 RAPORLAR NEGATİF SENARYOLARI');

    const unauthReport = await api('GET', `/reports/environmental/${match.id}`);
    assert(unauthReport.status === 401, 'Kimlik doğrulamasız rapor isteği engellendi (401)');

    if (state.adminToken) {
        const crossPartyReport = await api('GET', `/reports/environmental/${match.id}`, null, state.adminToken);
        assert(crossPartyReport.status === 404, `Taraf olmayan tesis rapor alamaz (404, alınan: ${crossPartyReport.status})`);

        const crossPartyDpp = await api('GET', `/reports/dpp/${output.passportId}`, null, state.adminToken);
        assert(crossPartyDpp.status === 404, `Başka tesisin DPP raporuna erişilemez (404, alınan: ${crossPartyDpp.status})`);
    }

    const notFoundReport = await api('GET', '/reports/environmental/00000000-0000-0000-0000-000000000000', null, state.accessToken);
    assert(notFoundReport.status === 404, `Mevcut olmayan eşleşme için rapor 404 döner (alınan: ${notFoundReport.status})`);
};
