// ═══════════════════════════════════════════════════════════════
//  OSB Dashboard Testleri — KPI'lar, tesis listesi, harita,
//  aylık rapor (PDF/XLSX), RBAC (Faz 3.1/3.2, AD4)
// ═══════════════════════════════════════════════════════════════

import { randomUUID } from 'crypto';
import { TEST_DATA, state, assert, api, section, prisma, BASE_URL } from './helpers.js';

const FAR_FUTURE = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

async function registerInOsb(label, sector) {
    const email = `osb-${label}-${TEST_DATA.runId}@ecomatch-test.com`;
    // taxId benzersizliği runId + label'a bağlı sabit bir basamak yerine Date.now() + rastgele
    // ekten türetiliyor -- iki farklı test dosyasının aynı basamak sayımıyla (örn. "buyer".length
    // === 5, iot.test.js'in sabit "95" öneki) çakışması gibi kırılgan bir örüntüden kaçınıyor.
    const taxId = `${Date.now()}${Math.floor(Math.random() * 900 + 100)}`;
    const res = await api('POST', '/auth/register', {
        name: `E2E OSB ${label} Fabrikası ${TEST_DATA.runId}`,
        taxId,
        sector,
        email,
        password: 'Password123!',
        contactName: `OSB ${label}`,
        phone: '+90 555 444 55 66',
        location: { lat: 40.2, lng: 29.05 },
        osbId: state.osbId,
    });
    return { email, res };
}

export const testOsbDashboard = async () => {
    section('13. OSB DASHBOARD MODÜLÜ (/v1/osb/*)');

    // ── Kurulum: aynı OSB'ye bağlı iki tesis (tedarikçi + tüketici) ──
    const supplier = await registerInOsb('supplier', 'metal');
    assert(supplier.res.status === 201, 'OSB tedarikçi tesisi kaydı 201 döndürdü');
    const supplierToken = supplier.res.access_token;
    const supplierFacilityId = supplier.res.facility?.id;

    const buyer = await registerInOsb('buyer', 'construction');
    assert(buyer.res.status === 201, 'OSB tüketici tesisi kaydı 201 döndürdü');
    const buyerToken = buyer.res.access_token;
    state.osbBuyerFacilityId = buyer.res.facility?.id;
    // VerifiedFacilityGuard doğrulanmamış tesisin materyal oluşturmasını engelliyor --
    // aşağıda POST /materials/inputs çağıracağız, bu yüzden alıcı da doğrulanmalı.
    await prisma.facility.update({ where: { id: state.osbBuyerFacilityId }, data: { verified: true } });

    // Tedarikçinin kendi kullanıcısı OSB_MANAGER'a terfi ettiriliyor (review-queue.test.js'teki
    // EXPERT terfi kalıbıyla aynı -- doğrudan DB, ayrı bir self-servis endpoint yok).
    state.osbManagerUserId = supplier.res.user?.id;
    state.osbManagerFacilityId = supplierFacilityId;
    await prisma.user.update({ where: { id: state.osbManagerUserId }, data: { role: 'OSB_MANAGER' } });
    // totalFacilities formülü verified=true şart koşuyor (docs/05) -- tam onay akışı zaten
    // admin.test.js'te test ediliyor, burada doğrudan DB ile kısayol.
    await prisma.facility.update({ where: { id: supplierFacilityId }, data: { verified: true } });
    const managerLogin = await api('POST', '/auth/login', { email: supplier.email, password: 'Password123!' });
    state.osbManagerToken = managerLogin.access_token;

    // ── Tamamlanmış bir eşleşme (KPI'ların gerçek sayı üretmesi için co2Saved/cbamImpact elle set) ──
    const output = await api('POST', '/materials/outputs', {
        description: `OSB dashboard testi çıktısı ${randomUUID()}`,
        materialClass: 'metal',
        quantityKg: 1000,
        stock: 1000,
    }, supplierToken);
    const input = await api('POST', '/materials/inputs', {
        description: `OSB dashboard testi girdisi ${randomUUID()}`,
        materialClass: 'metal',
        quantityKg: 200,
    }, buyerToken);

    const completedMatch = await prisma.match.create({
        data: {
            outputId: output.outputId,
            inputId: input.inputId,
            totalScore: 80,
            breakdown: { material: 80, quality: 80, environmental: 80, logistics: 80, economic: 80 },
            demandQty: 200,
            co2Saved: 120,
            cbamImpact: 60,
            status: 'PENDING',
            expiresAt: FAR_FUTURE,
        },
    });
    await api('POST', `/matches/${completedMatch.id}/accept`, null, supplierToken);
    const consumerAccept = await api('POST', `/matches/${completedMatch.id}/accept`, null, buyerToken);
    assert(consumerAccept.bodyStatus === 'completed', 'Kurulum: eşleşme completed durumuna getirildi');

    // Simbiyoz oranı paydasına giren, reddedilmiş bir eşleşme daha
    const output2 = await api('POST', '/materials/outputs', {
        description: `OSB dashboard testi ikinci çıktı ${randomUUID()}`,
        materialClass: 'metal',
        quantityKg: 500,
        stock: 500,
    }, supplierToken);
    const rejectedMatch = await prisma.match.create({
        data: {
            outputId: output2.outputId,
            inputId: input.inputId,
            totalScore: 70,
            breakdown: { material: 70, quality: 70, environmental: 70, logistics: 70, economic: 70 },
            demandQty: 100,
            status: 'PENDING',
            expiresAt: FAR_FUTURE,
        },
    });
    await api('POST', `/matches/${rejectedMatch.id}/reject`, { reasonCategory: 'quantity_mismatch' }, supplierToken);

    // ── GET /v1/osb/stats ──
    const statsRes = await api('GET', '/osb/stats', null, state.osbManagerToken);
    assert(statsRes.status === 200, `GET /v1/osb/stats 200 döner (alınan: ${statsRes.status})`, statsRes);
    assert(statsRes.totalFacilities >= 1, `totalFacilities en az 1 (alınan: ${statsRes.totalFacilities})`);
    assert(statsRes.activeMatchesLast30d >= 1, 'activeMatchesLast30d az önce tamamlanan eşleşmeyi sayıyor');
    assert(statsRes.monthlyCo2SavedKg >= 120, `monthlyCo2SavedKg en az 120 (alınan: ${statsRes.monthlyCo2SavedKg})`);
    assert(statsRes.monthlyCbamSavingEur >= 60, `monthlyCbamSavingEur en az 60 (alınan: ${statsRes.monthlyCbamSavingEur})`);
    assert(statsRes.symbiosisRate > 0 && statsRes.symbiosisRate <= 1, 'symbiosisRate 0-1 aralığında (pending paydada yok, docs/05)');

    // ── GET /v1/osb/facilities ──
    const facilitiesRes = await api('GET', '/osb/facilities', null, state.osbManagerToken);
    assert(facilitiesRes.status === 200, `GET /v1/osb/facilities 200 döner (alınan: ${facilitiesRes.status})`);
    assert(Array.isArray(facilitiesRes.data), 'facilities data bir dizi');
    assert(facilitiesRes.data.some((f) => f.id === supplierFacilityId), 'Kurulan tedarikçi tesisi listede görünüyor');

    const filteredRes = await api('GET', '/osb/facilities?sector=metal', null, state.osbManagerToken);
    assert((filteredRes.data || []).every((f) => f.sector === 'metal'), '?sector= filtresi doğru çalışıyor');

    // ── GET /v1/osb/map ──
    const mapRes = await api('GET', '/osb/map', null, state.osbManagerToken);
    assert(mapRes.status === 200, `GET /v1/osb/map 200 döner (alınan: ${mapRes.status})`);
    assert(Array.isArray(mapRes.pins) && mapRes.pins.length >= 2, 'map pins en az 2 tesisi içeriyor');
    assert(Array.isArray(mapRes.matchLines) && mapRes.matchLines.length >= 1, 'map matchLines tamamlanmış eşleşmeyi içeriyor');
    assert(mapRes.matchLines[0].from?.lat !== undefined, 'matchLines koordinat içeriyor');

    // ── GET /v1/osb/reports/monthly ──
    const period = new Date().toISOString().slice(0, 7);
    const monthlyJson = await api('GET', `/osb/reports/monthly?period=${period}`, null, state.osbManagerToken);
    assert(monthlyJson.status === 200, `Aylık rapor (JSON) 200 döner (alınan: ${monthlyJson.status})`);
    assert(monthlyJson.completedMatches >= 1, 'Aylık rapor completedMatches en az 1');
    assert(Array.isArray(monthlyJson.topWasteProducers), 'topWasteProducers bir dizi');
    assert(Array.isArray(monthlyJson.topActiveBuyers), 'topActiveBuyers bir dizi');
    assert(monthlyJson.topWasteProducers.some((f) => f.facilityId === supplierFacilityId), 'Tedarikçi topWasteProducers içinde görünüyor');

    const pdfRes = await fetch(`${BASE_URL}/osb/reports/monthly?period=${period}&format=pdf`, {
        headers: { Authorization: `Bearer ${state.osbManagerToken}` },
    });
    assert(pdfRes.status === 200, `Aylık rapor (PDF) 200 döner (alınan: ${pdfRes.status})`);
    assert(pdfRes.headers.get('content-type')?.includes('application/pdf'), 'content-type application/pdf');
    const pdfBuffer = Buffer.from(await pdfRes.arrayBuffer());
    assert(pdfBuffer.subarray(0, 4).toString() === '%PDF', 'Dönen içerik gerçek bir PDF');

    const xlsxRes = await fetch(`${BASE_URL}/osb/reports/monthly?period=${period}&format=xlsx`, {
        headers: { Authorization: `Bearer ${state.osbManagerToken}` },
    });
    assert(xlsxRes.status === 200, `Aylık rapor (XLSX) 200 döner (alınan: ${xlsxRes.status})`);
    assert(
        xlsxRes.headers.get('content-type')?.includes('spreadsheetml'),
        'content-type xlsx (spreadsheetml)',
    );
    const xlsxBuffer = Buffer.from(await xlsxRes.arrayBuffer());
    // XLSX de bir ZIP konteyneri -- magic bytes PK
    assert(xlsxBuffer.subarray(0, 2).toString() === 'PK', 'Dönen içerik gerçek bir XLSX (ZIP magic bytes)');

    const invalidPeriod = await api('GET', '/osb/reports/monthly?period=2026-13', null, state.osbManagerToken);
    assert(invalidPeriod.status === 400, `Geçersiz period 400 döner (alınan: ${invalidPeriod.status})`);

    // ── NEGATİF SENARYOLAR ──
    section('13.1 OSB DASHBOARD NEGATİF SENARYOLARI');

    const unauthStats = await api('GET', '/osb/stats');
    assert(unauthStats.status === 401, 'Kimlik doğrulamasız erişim engellendi (401)');

    const nonManagerStats = await api('GET', '/osb/stats', null, buyerToken);
    assert(nonManagerStats.status === 403, `osb_manager olmayan kullanıcı engellendi (403, alınan: ${nonManagerStats.status})`);
    assert(nonManagerStats.error === 'INSUFFICIENT_ROLE', 'Hata kodu INSUFFICIENT_ROLE');
};
