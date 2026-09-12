// ═══════════════════════════════════════════════════════════════
//  AI Proxy Testleri — POST /v1/ai/classify
//
//  Not: Şu an DUMMY bir AiClientService tarafından besleniyor (K-24) --
//  ekip arkadaşının gerçek AI servisi (MIT'nin bir eşleştirme modeli)
//  entegre edildiğinde bu dosyanın davranışı değişmemeli, çünkü sözleşme
//  şekli (docs/07) birebir korunuyor. Sadece confidence/materialClass
//  değerlerinin ANLAMLI olması garanti değil -- şekli doğru olması garanti.
// ═══════════════════════════════════════════════════════════════

import { TEST_DATA, state, assert, api, section } from './helpers.js';

export const testAi = async () => {
    section('7. AI PROXY (/v1/ai/*)');

    const description = 'Tekstil boyahanesi çıkışı arıtma çamuru, ağırlıklı olarak selüloz elyaf';

    const classifyRes = await api('POST', '/ai/classify', { description }, state.accessToken);
    assert(classifyRes.status === 201, `POST /v1/ai/classify 201 döndürdü (alınan: ${classifyRes.status})`, classifyRes);
    assert(typeof classifyRes.materialClass === 'string', 'materialClass bir string olarak döndü');
    assert(
        ['metal', 'plastic', 'organic', 'chemical', 'textile', 'glass', 'paper', 'other'].includes(classifyRes.materialClass),
        'materialClass 8 geçerli sınıftan biri',
    );
    assert(typeof classifyRes.confidence === 'number' && classifyRes.confidence >= 0 && classifyRes.confidence <= 1, 'confidence 0-1 aralığında bir sayı');
    assert(Array.isArray(classifyRes.top3) && classifyRes.top3.length === 3, 'top3 tam olarak 3 eleman içeriyor');
    assert(classifyRes.top3[0][0] === classifyRes.materialClass, 'top3\'ün ilk elemanı seçilen materialClass ile aynı');
    assert(typeof classifyRes.requiresHumanReview === 'boolean', 'requiresHumanReview bir boolean');

    // docs/07: backend eşiği kendi kontrol eder (system_config['match.hitl_threshold']=0.80, 009_seed.sql)
    const expectedReview = classifyRes.confidence < 0.8;
    assert(classifyRes.requiresHumanReview === expectedReview, 'requiresHumanReview, confidence < 0.80 kuralıyla tutarlı');

    // Dummy istemci metne göre hash tabanlı -- aynı metin aynı sonucu vermeli (determinism)
    const classifyAgainRes = await api('POST', '/ai/classify', { description }, state.accessToken);
    assert(classifyAgainRes.materialClass === classifyRes.materialClass, 'Aynı metin ikinci çağrıda da AYNI materialClass\'ı döndürüyor (dummy deterministik)');
    assert(classifyAgainRes.confidence === classifyRes.confidence, 'Aynı metin ikinci çağrıda da AYNI confidence değerini döndürüyor');

    const differentTextRes = await api('POST', '/ai/classify', { description: 'Tamamen farklı ve alakasız bir metin örneği burada' }, state.accessToken);
    assert(
        differentTextRes.materialClass !== classifyRes.materialClass || differentTextRes.confidence !== classifyRes.confidence,
        'Farklı bir metin en azından bir alanda farklı sonuç üretiyor (sabit/hardcoded bir cevap değil)',
    );

    // ── NEGATİF SENARYOLAR ──
    section('7.1 AI PROXY NEGATİF SENARYOLARI');

    const unauthClassify = await api('POST', '/ai/classify', { description });
    assert(unauthClassify.status === 401, 'Kimlik doğrulamasız classify isteği engellendi (401)');

    const missingDescription = await api('POST', '/ai/classify', {}, state.accessToken);
    assert(missingDescription.status === 400, `Eksik description 400 ile reddedildi (alınan: ${missingDescription.status})`);

    const emptyDescription = await api('POST', '/ai/classify', { description: '' }, state.accessToken);
    assert(emptyDescription.status === 400, `Boş description 400 ile reddedildi (alınan: ${emptyDescription.status})`);

    const tooLongDescription = await api('POST', '/ai/classify', { description: 'x'.repeat(5001) }, state.accessToken);
    assert(tooLongDescription.status === 400, `5000 karakteri aşan description 400 ile reddedildi (alınan: ${tooLongDescription.status})`);

    // ── Rate Limiting (Faz 2.10) ──
    // classify limiti kullanıcı bazlı 60/dk (docs/04). Bu testin kendi ayrı, hiç
    // kullanılmamış bir tesis/kullanıcısı var -- ai/classify'ı bu dosyanın başında zaten
    // birkaç kez çağırmış olan state.accessToken'ı yeniden kullanırsak sayaç şişer,
    // matches.test.js'e bağımlı bir token kullanırsak da çalışma sırasına bağımlı
    // hâle gelirdi (o dosya bu testten SONRA çalışıyor).
    section('7.2 RATE LIMITING (60/dk, KULLANICI BAZLI)');

    const rateLimitTestEmail = `ratelimit-${TEST_DATA.runId}@ecomatch-test.com`;
    const rateLimitRegister = await api('POST', '/auth/register', {
        name: `E2E Rate Limit Facility ${TEST_DATA.runId}`,
        taxId: `95${TEST_DATA.runId.padStart(8, '0')}`,
        sector: 'other',
        email: rateLimitTestEmail,
        password: 'Password123!',
        contactName: 'Rate Limit Test',
        phone: '+90 555 444 55 66',
        location: { lat: 39.0, lng: 35.0 },
    });
    state.rateLimitFacilityId = rateLimitRegister.facility?.id;
    const rateLimitToken = rateLimitRegister.access_token;

    // 65 istek TAM eşzamanlı (Promise.all) gönderilmiyor -- dummy istemciyle sorun
    // değildi (anlık dönerdi), ama gerçek AI servisi tek process/senkron encode
    // olduğundan 65-yönlü bir patlama kuyruklanıp backend'in 3s timeout'unu
    // (docs/07) aşabiliyor, bu da circuit breaker'ı gerçekten açıp bu dosyadan
    // sonraki testleri etkiliyordu. Küçük gruplar halinde göndermek NestJS
    // ThrottlerGuard'ın 60/dk sayacını (ki senkron ve AI'dan önce çalışıyor)
    // etkilemez, sadece AI servisine gerçekçi bir eşzamanlılık bindirir.
    const burst = [];
    const BURST_BATCH_SIZE = 5;
    for (let i = 0; i < 65; i += BURST_BATCH_SIZE) {
        const batch = await Promise.all(
            Array.from({ length: Math.min(BURST_BATCH_SIZE, 65 - i) }, (_, j) =>
                api('POST', '/ai/classify', { description: `Rate limit testi isteği ${i + j}` }, rateLimitToken)),
        );
        burst.push(...batch);
    }

    const succeeded = burst.filter((r) => r.status === 201).length;
    const limited = burst.filter((r) => r.status === 429);

    assert(limited.length > 0, `65 hızlı istekten en az biri 429 ile sınırlandı (${limited.length} sınırlandı, ${succeeded} başarılı)`);
    assert(succeeded <= 60, `Limit üzerinde başarılı istek geçmedi (60/dk, gerçekleşen: ${succeeded})`);

    if (limited[0]) {
        assert(limited[0].error === 'RATE_LIMIT_EXCEEDED', 'Hata kodu RATE_LIMIT_EXCEEDED');
        assert(typeof limited[0].details?.retryAfterSeconds === 'number', 'details.retryAfterSeconds sayısal bir değer içeriyor');
    }
};
