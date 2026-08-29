// ═══════════════════════════════════════════════════════════════
//  OSB Modülü Testleri — Herkese açık listeleme ve yapı doğrulama
// ═══════════════════════════════════════════════════════════════

import { TEST_DATA, state, assert, api, section, prisma } from './helpers.js';

export const testOsbs = async () => {
    section('1. OSB MODÜLÜ (GET /v1/osbs)');

    // DB'de en az bir test OSB kaydı olduğundan emin olun
    let osbRecord = await prisma.osb.findFirst();
    if (!osbRecord) {
        osbRecord = await prisma.osb.create({
            data: {
                name: TEST_DATA.osb.name,
                city: TEST_DATA.osb.city,
            },
        });
        console.log(`  [Kurulum] DB'de test OSB oluşturuldu: ${osbRecord.name} (${osbRecord.id})`);
    }

    // ── Herkese Açık GET /v1/osbs ──
    const res = await api('GET', '/osbs');

    assert(res.status === 200, `GET /v1/osbs 200 OK döndü (alınan: ${res.status})`, res);
    assert(Array.isArray(res.data), 'GET /v1/osbs bir dizi döndürür');

    const osbsList = res.data || [];
    assert(osbsList.length > 0, `En az 1 OSB döndürüldü (${osbsList.length} adet bulundu)`);

    const sampleOsb = osbsList.find((o) => o.id === osbRecord.id) || osbsList[0];
    assert(!!sampleOsb.id, 'OSB öğesi id (UUID) içeriyor');
    assert(typeof sampleOsb.name === 'string' && sampleOsb.name.length > 0, 'OSB öğesi name alanı içeriyor');
    assert(typeof sampleOsb.city === 'string' && sampleOsb.city.length > 0, 'OSB öğesi city alanı içeriyor');
    assert(sampleOsb.region === undefined, 'OSB öğesi dahili PostGIS bölge geometrisini sızdırmıyor');

    state.osbId = sampleOsb.id;
    console.log(`  [Durum] state.osbId kaydedildi = ${state.osbId}`);
};
