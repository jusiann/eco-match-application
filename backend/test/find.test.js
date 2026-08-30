// ═══════════════════════════════════════════════════════════════
//  Aday Bulma ve Skorlama Testleri — GET /v1/matches/find/:outputId
//  (Faz 1.7/1.8/1.9: pgvector benzerlik araması, 5 faktörlü skor, CBAM)
//
//  Not: AiClientService dummy (K-24) -- rastgele üretilen iki vektörün
//  benzerliği pratikte hep ~0'dır (768 boyutlu rastgele birim vektörler
//  neredeyse ortogonaldir). Bu yüzden "gerçekten aday bulundu" senaryosunu
//  deterministik test edebilmek için embeddings tablosuna DOĞRUDAN
//  bilinen bir vektör yazıyoruz -- matches.test.js'in Match fixture'larını
//  doğrudan Prisma ile açması gibi, aynı mantık.
// ═══════════════════════════════════════════════════════════════

import { TEST_DATA, state, assert, api, section, prisma } from './helpers.js';

async function setEmbedding(recordId, recordType, dimIndex) {
    const vec = new Array(768).fill(0);
    vec[dimIndex] = 1;
    const literal = `[${vec.join(',')}]`;
    await prisma.$executeRaw`
      INSERT INTO embeddings (record_id, record_type, vector, model_version)
      VALUES (${recordId}::uuid, ${recordType}::record_type, ${literal}::vector, 'test-fixture')
      ON CONFLICT (record_id, record_type) DO UPDATE SET vector = EXCLUDED.vector
    `;
}

export const testFind = async () => {
    section('8. ADAY BULMA VE SKORLAMA (GET /v1/matches/find/:outputId)');

    const output = await api('POST', '/materials/outputs', {
        description: 'Aday bulma testi için çıktı',
        materialClass: 'metal',
        composition: { demir: 100 },
        quantityKg: 1000,
        stock: 1000,
    }, state.accessToken);
    assert(output.status === 201, 'Test çıktısı oluşturuldu');

    const input = await api('POST', '/materials/inputs', {
        description: 'Aday bulma testi için girdi',
        materialClass: 'metal',
        quantityKg: 400,
    }, state.consumerToken);
    assert(input.status === 201, 'Test girdisi (tüketici tesiste) oluşturuldu');

    // İkisine de AYNI vektörü yaz -> benzerlik tam olarak 1.0, deterministik
    await setEmbedding(output.outputId, 'output', 0);
    await setEmbedding(input.inputId, 'input', 0);

    const findRes = await api('GET', `/matches/find/${output.outputId}`, null, state.accessToken);
    assert(findRes.status === 200, `GET /v1/matches/find/:outputId 200 döndürdü (alınan: ${findRes.status})`, findRes);
    assert(Array.isArray(findRes.matches), 'matches bir dizi');
    assert(findRes.matches.length >= 1, `En az bir aday bulundu (${findRes.matches?.length ?? 0} bulundu)`);

    const found = findRes.matches[0];
    assert(!!found.matchId, 'Dönen adayda matchId var');
    assert(typeof found.totalScore === 'number' && found.totalScore >= 0 && found.totalScore <= 100, 'totalScore 0-100 aralığında bir sayı');
    assert(
        ['material', 'quality', 'environmental', 'logistics', 'economic'].every((k) => typeof found.breakdown[k] === 'number'),
        'breakdown 5 faktörü de içeriyor (docs/05)',
    );
    assert(found.breakdown.material > 0, 'similarity=1.0 iken materialScore pozitif');
    assert(!('companyName' in found.counterparty), 'find sonucu da gizlilik kuralına uyuyor, companyName sızdırmıyor (S3)');
    assert(typeof found.co2Saved === 'number' && found.co2Saved > 0, 'co2Saved carbon_factors\'tan gerçek hesaplandı (metal virgin>secondary, K-24)');
    assert(typeof found.cbamImpact === 'number', 'cbamImpact hesaplandı');
    assert(!!found.expiresAt, 'expiresAt alanı mevcut');

    const dbMatch = await prisma.match.findUnique({ where: { id: found.matchId } });
    assert(!!dbMatch, 'matches tablosuna gerçek bir satır yazıldı');
    assert(dbMatch.status === 'PENDING', 'Yazılan eşleşmenin durumu PENDING');
    assert(Number(dbMatch.demandQty) === 400, 'demand_qty min(stok, talep) olarak dolduruldu (400)');

    // Self-match filtresi (E1): aynı tesisin kendi girdisi asla aday olmamalı
    const selfInput = await api('POST', '/materials/inputs', {
        description: 'Kendi tesisimin girdisi, aday olmamalı',
        materialClass: 'metal',
        quantityKg: 400,
    }, state.accessToken);
    await setEmbedding(selfInput.inputId, 'input', 0);

    await api('GET', `/matches/find/${output.outputId}`, null, state.accessToken);
    const selfMatchCount = await prisma.match.count({ where: { inputId: selfInput.inputId } });
    assert(selfMatchCount === 0, 'Aynı tesisin kendi girdisi hiçbir zaman eşleşme adayı olarak yazılmadı (E1)');

    // Pasif girdi (inputs.active=false) aday havuzuna girmemeli
    const inactiveInput = await api('POST', '/materials/inputs', {
        description: 'Pasif hale getirilecek girdi',
        materialClass: 'metal',
        quantityKg: 400,
    }, state.consumerToken);
    await setEmbedding(inactiveInput.inputId, 'input', 0);
    await prisma.input.update({ where: { id: inactiveInput.inputId }, data: { active: false } });

    await api('GET', `/matches/find/${output.outputId}`, null, state.accessToken);
    const inactiveMatchCount = await prisma.match.count({ where: { inputId: inactiveInput.inputId } });
    assert(inactiveMatchCount === 0, 'inputs.active=false olan girdi aday havuzuna hiç girmedi');

    // Eşik altı benzerlik (ortogonal vektör, similarity=0) aday olmamalı
    const belowThresholdInput = await api('POST', '/materials/inputs', {
        description: 'Eşik altı benzerlik girdisi',
        materialClass: 'metal',
        quantityKg: 400,
    }, state.consumerToken);
    await setEmbedding(belowThresholdInput.inputId, 'input', 1); // ortogonal -> similarity=0

    await api('GET', `/matches/find/${output.outputId}`, null, state.accessToken);
    const belowThresholdMatchCount = await prisma.match.count({ where: { inputId: belowThresholdInput.inputId } });
    assert(belowThresholdMatchCount === 0, 'Eşiğin (0.60) altındaki benzerlik hiçbir zaman eşleşme olarak yazılmadı');

    // Sınıflandırılmamış (pendingReview) çıktı -> 202 PENDING_EXPERT_REVIEW
    const unclassifiedOutput = await api('POST', '/materials/outputs', {
        description: 'Sınıflandırılmamış, find testinde 202 dönmeli',
        quantityKg: 100,
    }, state.accessToken);
    const findUnclassifiedRes = await api('GET', `/matches/find/${unclassifiedOutput.outputId}`, null, state.accessToken);
    assert(findUnclassifiedRes.status === 202, `Sınıflandırılmamış çıktı için find 202 döndürdü (alınan: ${findUnclassifiedRes.status})`);
    assert(findUnclassifiedRes.error === 'PENDING_EXPERT_REVIEW', 'Hata kodu PENDING_EXPERT_REVIEW');

    // Hiçbir adayı olmayan çıktı (gerçek dummy embedding, rastgele vektör) -> boş liste
    const lonelyOutput = await api('POST', '/materials/outputs', {
        description: 'Hiçbir adayı olmayacak yalnız çıktı',
        materialClass: 'glass',
        quantityKg: 50,
    }, state.accessToken);
    const findLonelyRes = await api('GET', `/matches/find/${lonelyOutput.outputId}`, null, state.accessToken);
    assert(findLonelyRes.status === 200, `Aday yokken find 200 döndürdü (alınan: ${findLonelyRes.status})`);
    assert(Array.isArray(findLonelyRes.matches) && findLonelyRes.matches.length === 0, 'Aday yokken matches boş dizi döndü');
    assert(typeof findLonelyRes.message === 'string' && findLonelyRes.message.length > 0, 'Aday yokken açıklayıcı bir message dönüyor');

    // ── NEGATİF SENARYOLAR ──
    section('8.1 ADAY BULMA NEGATİF SENARYOLARI');

    const unauthFind = await api('GET', `/matches/find/${output.outputId}`);
    assert(unauthFind.status === 401, 'Kimlik doğrulamasız find isteği engellendi (401)');

    if (state.adminToken) {
        const crossFacilityFind = await api('GET', `/matches/find/${output.outputId}`, null, state.adminToken);
        assert(crossFacilityFind.status === 404, `Başka tesisin çıktısı için find 404 döndürdü (alınan: ${crossFacilityFind.status})`);
    }

    const notFoundFind = await api('GET', '/matches/find/00000000-0000-0000-0000-000000000000', null, state.accessToken);
    assert(notFoundFind.status === 404, `Mevcut olmayan çıktı id'si için find 404 döndürdü (alınan: ${notFoundFind.status})`);
};
