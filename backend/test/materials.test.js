// ═══════════════════════════════════════════════════════════════
//  Materyaller (Materials) Modülü Testleri — Çıktı/Girdi CRUD,
//  Sahiplik, Doğrulanmış Tesis Şartı, Aktif Eşleşme Silme Koruması,
//  DPP Üretimi, Idempotency-Key & Negatif Senaryolar
// ═══════════════════════════════════════════════════════════════

import { randomUUID } from 'crypto';
import { TEST_DATA, state, assert, api, section, prisma } from './helpers.js';

export const testMaterials = async () => {
    section('5. MATERYALLER (MATERIALS) MODÜLÜ (/v1/materials/*)');

    // ── POST /v1/materials/outputs (materialClass ile) ──
    const createOutputRes = await api('POST', '/materials/outputs', {
        description: 'Tekstil boyahanesi çıkışı arıtma çamuru, ağırlıklı olarak selüloz elyaf',
        materialClass: 'organic',
        composition: { 'selüloz': 60, 'su': 30, 'diğer': 10 },
        quantityKg: 800,
        stock: 800,
        frequency: 'daily',
    }, state.accessToken);

    assert(createOutputRes.status === 201, `POST /v1/materials/outputs 201 döndürdü (alınan: ${createOutputRes.status})`, createOutputRes);
    assert(!!createOutputRes.outputId, 'Çıktı oluşturma outputId döndürdü');
    assert(createOutputRes.embeddingPending === false, 'embeddingPending değeri false (dummy AiClient senkron embed etti, K-24)');
    assert(createOutputRes.pendingReview === false, 'materialClass sağlandığında pendingReview false olur');

    const dbOutputEmbedding = await prisma.embedding.findFirst({ where: { recordId: createOutputRes.outputId, recordType: 'OUTPUT' } });
    assert(!!dbOutputEmbedding, 'embeddings tablosuna gerçek bir satır yazıldı');
    assert(dbOutputEmbedding?.modelVersion === 'dummy-stub-v0', 'model_version dummy istemcinin adını taşıyor (gerçek servis gelince değişecek)');
    assert(!!createOutputRes.passportId, 'Çıktı oluşturma gerçek bir passportId döndürdü (DPP senkron üretildi, Faz 1.6)');
    assert(typeof createOutputRes.qrCode === 'string' && createOutputRes.qrCode.includes('/dpp/'), 'qrCode bir /dpp/:id imzalı URL\'sidir');
    assert(typeof createOutputRes.pdfUrl === 'string' && createOutputRes.pdfUrl.includes('/passport/'), 'pdfUrl imzalı pasaport PDF URL\'sidir');

    state.outputId = createOutputRes.outputId;
    state.passportId = createOutputRes.passportId;
    state.passportSig = new URL(createOutputRes.qrCode).searchParams.get('sig');

    // ── POST /v1/materials/outputs (materialClass OLMADAN -> pendingReview) ──
    const createUnclassifiedRes = await api('POST', '/materials/outputs', {
        description: 'Sınıflandırılmamış test çıktısı, uzman incelemesi bekliyor',
        quantityKg: 250,
    }, state.accessToken);

    assert(createUnclassifiedRes.status === 201, `materialClass olmadan çıktı oluşturma 201 döndürdü (alınan: ${createUnclassifiedRes.status})`);
    assert(createUnclassifiedRes.pendingReview === true, 'materialClass belirtilmediğinde pendingReview true olur');
    assert(createUnclassifiedRes.embeddingPending === true, 'pendingReview true iken embedding hiç denenmez, embeddingPending true kalır (HITL Faz 2\'yi bekliyor)');

    state.unclassifiedOutputId = createUnclassifiedRes.outputId;

    const dbUnclassified = await prisma.output.findUnique({ where: { id: state.unclassifiedOutputId } });
    assert(dbUnclassified?.materialClass === null, 'materialClass belirtilmediğinde DB\'de NULL olarak saklanır');
    assert(Number(dbUnclassified?.stock) === 250, 'stock belirtilmediğinde varsayılan olarak quantityKg değerini alır');

    const noEmbeddingForUnclassified = await prisma.embedding.findFirst({ where: { recordId: state.unclassifiedOutputId, recordType: 'OUTPUT' } });
    assert(noEmbeddingForUnclassified === null, 'Sınıfsız çıktı için embeddings tablosunda hiç satır açılmadı');

    // ── GET /v1/materials/outputs (listeleme, sayfalanmış) ──
    const listOutputsRes = await api('GET', '/materials/outputs', null, state.accessToken);
    assert(listOutputsRes.status === 200, `GET /v1/materials/outputs 200 döndürdü (alınan: ${listOutputsRes.status})`, listOutputsRes);
    assert(Array.isArray(listOutputsRes.data), 'Çıktı listesinde data dizisi var');
    assert(listOutputsRes.meta?.page === 1, 'Çıktı listesi meta.page varsayılan olarak 1\'dir');
    assert(listOutputsRes.data.length >= 2, `Oluşturulan her iki çıktı da listede mevcut (${listOutputsRes.data.length} adet bulundu)`);

    // ── GET /v1/materials/outputs/:id ──
    const getOutputRes = await api('GET', `/materials/outputs/${state.outputId}`, null, state.accessToken);
    assert(getOutputRes.status === 200, `GET /v1/materials/outputs/:id 200 döndürdü (alınan: ${getOutputRes.status})`, getOutputRes);
    assert(getOutputRes.id === state.outputId, 'Alınan çıktı id\'si eşleşiyor');
    assert(Number(getOutputRes.quantityKg) === 800, 'Alınan çıktı quantityKg değeri eşleşiyor');

    // ── PATCH /v1/materials/outputs/:id ──
    const patchOutputRes = await api('PATCH', `/materials/outputs/${state.outputId}`, { quantityKg: 950, stock: 900 }, state.accessToken);
    assert(patchOutputRes.status === 200, `PATCH /v1/materials/outputs/:id 200 döndürdü (alınan: ${patchOutputRes.status})`, patchOutputRes);

    const dbAfterPatch = await prisma.output.findUnique({ where: { id: state.outputId } });
    assert(Number(dbAfterPatch?.quantityKg) === 950, 'DB\'de çıktı quantityKg güncellendi');
    assert(dbAfterPatch?.embeddingPending === false, 'PATCH embedding\'i senkron yeniden hesapladı, embeddingPending false\'a döndü ("Embedding yeniden hesaplanır")');

    // ── DPP ÜRETİMİ (Faz 1.6) ──
    section('5.0 DPP ÜRETİMİ');

    const dbPassport = await prisma.materialPassport.findUnique({ where: { id: state.passportId } });
    assert(!!dbPassport, 'material_passports satırı gerçekten oluşmuş');
    assert(dbPassport?.dppCompliant === true, 'Kompozisyon toplamı 100 -> dpp_compliant true (E8)');
    assert(dbPassport?.passportData?.compliance?.espr_compliant === true, 'passport_data.compliance.espr_compliant true');
    assert(dbPassport?.passportData?.passport_id === state.passportId, 'passport_data içindeki passport_id gerçek id ile eşleşiyor');
    assert(dbPassport?.passportData?.signature?.value === state.passportSig, 'passport_data içindeki imza, QR/PDF URL\'lerindeki imzayla aynı');

    // Kompozisyon toplamı != 100 -> dpp_compliant false, issue işaretli (E8)
    const badCompositionRes = await api('POST', '/materials/outputs', {
        description: 'Bozuk kompozisyonlu test çıktısı, toplam 120',
        materialClass: 'chemical',
        composition: { 'a': 60, 'b': 60 },
        quantityKg: 100,
    }, state.accessToken);
    assert(badCompositionRes.status === 201, 'Bozuk kompozisyonlu çıktı yine de 201 ile kaydedilir (E8: engellenmez, işaretlenir)');
    const dbBadPassport = await prisma.materialPassport.findUnique({ where: { id: badCompositionRes.passportId } });
    assert(dbBadPassport?.dppCompliant === false, 'Kompozisyon toplamı 120 -> dpp_compliant false');
    assert(dbBadPassport?.passportData?.compliance?.issues?.includes('composition_sum_invalid'), 'issues dizisinde composition_sum_invalid var');

    // ── GET /v1/materials/passport/:id/json (public, imzalı) ──
    const passportJsonRes = await api('GET', `/materials/passport/${state.passportId}/json?sig=${state.passportSig}`);
    assert(passportJsonRes.status === 200, `Doğru imzayla passport/json 200 döner (alınan: ${passportJsonRes.status})`, passportJsonRes);
    assert(passportJsonRes.passport_id === state.passportId, 'Dönen JSON doğru passport_id içeriyor');

    const wrongSigRes = await api('GET', `/materials/passport/${state.passportId}/json?sig=deadbeef00`);
    assert(wrongSigRes.status === 403, `Yanlış imza 403 döner (alınan: ${wrongSigRes.status})`);
    assert(wrongSigRes.error === 'INVALID_SIGNATURE', 'Hata kodu INVALID_SIGNATURE');

    const noSigRes = await api('GET', `/materials/passport/${state.passportId}/json`);
    assert(noSigRes.status === 403, `İmza eksikse 403 döner (alınan: ${noSigRes.status})`);
    assert(passportJsonRes !== undefined && !passportJsonRes.headers?.get?.('www-authenticate'), 'passport/json isteği hiçbir auth token GEREKTİRMEDEN çalıştı (herkese açık)');

    // ── GET /v1/materials/passport/:id/pdf (public, imzalı, binary) ──
    const { BASE_URL } = await import('./helpers.js');
    const rawPdfRes = await fetch(`${BASE_URL}/materials/passport/${state.passportId}/pdf?sig=${state.passportSig}`);
    const pdfBuffer = Buffer.from(await rawPdfRes.arrayBuffer());
    assert(rawPdfRes.status === 200, `passport/pdf doğru imzayla 200 döner (alınan: ${rawPdfRes.status})`);
    assert(rawPdfRes.headers.get('content-type')?.includes('application/pdf'), 'content-type application/pdf');
    assert(pdfBuffer.subarray(0, 4).toString() === '%PDF', 'Dönen içerik gerçek bir PDF (magic bytes %PDF)');

    const rawPdfWrongSigRes = await fetch(`${BASE_URL}/materials/passport/${state.passportId}/pdf?sig=deadbeef00`);
    assert(rawPdfWrongSigRes.status === 403, `passport/pdf yanlış imzayla 403 döner (alınan: ${rawPdfWrongSigRes.status})`);

    // ── GET /v1/materials/passport/:id/qr (yalnızca sahip, binary PNG) ──
    const rawQrRes = await fetch(`${BASE_URL}/materials/passport/${state.passportId}/qr`, {
        headers: { Authorization: `Bearer ${state.accessToken}` },
    });
    const qrBuffer = Buffer.from(await rawQrRes.arrayBuffer());
    assert(rawQrRes.status === 200, `passport/qr sahip belirteciyle 200 döner (alınan: ${rawQrRes.status})`);
    assert(rawQrRes.headers.get('content-type')?.includes('image/png'), 'content-type image/png');
    assert(qrBuffer.subarray(1, 4).toString() === 'PNG', 'Dönen içerik gerçek bir PNG (magic bytes)');

    const rawQrUnauthRes = await fetch(`${BASE_URL}/materials/passport/${state.passportId}/qr`);
    assert(rawQrUnauthRes.status === 401, `passport/qr kimlik doğrulama olmadan 401 döner (alınan: ${rawQrUnauthRes.status})`);

    if (state.adminToken) {
        const rawQrOtherFacilityRes = await fetch(`${BASE_URL}/materials/passport/${state.passportId}/qr`, {
            headers: { Authorization: `Bearer ${state.adminToken}` },
        });
        assert(rawQrOtherFacilityRes.status === 404, `passport/qr başka tesisin belirteciyle 404 döner (alınan: ${rawQrOtherFacilityRes.status})`);
    }

    // ── Idempotency-Key (Faz 1.11) ──
    section('5.0b TEKİLLİK ANAHTARI (IDEMPOTENCY-KEY)');

    const idemKey = randomUUID();
    const idemPayload = {
        description: 'Idempotency testi için tek seferlik çıktı',
        materialClass: 'metal',
        quantityKg: 42,
    };
    const idem1 = await api('POST', '/materials/outputs', idemPayload, state.accessToken, {
        headers: { 'Idempotency-Key': idemKey },
    });
    const idem2 = await api('POST', '/materials/outputs', idemPayload, state.accessToken, {
        headers: { 'Idempotency-Key': idemKey },
    });
    assert(idem1.status === 201 && idem2.status === 201, 'Idempotency-Key ile iki istek de 201 döner');
    assert(idem1.outputId === idem2.outputId, 'Aynı Idempotency-Key ile ikinci istek AYNI outputId\'yi döner (yeni kayıt açılmadı)');

    // facilityId ile de sınırlandırıyoruz -- description tek başına global bir filtre, önceki
    // bir çalıştırmadan kalan (temizlenmemiş) bir satır varsa yanlış pozitif üretebilir.
    const outputCountForIdemDesc = await prisma.output.count({
        where: { description: idemPayload.description, facilityId: state.facilityId },
    });
    assert(outputCountForIdemDesc === 1, 'DB\'de sadece TEK bir output satırı var (tekilleştirme gerçekten çalışıyor)');

    const idem3 = await api('POST', '/materials/outputs', idemPayload, state.accessToken, {
        headers: { 'Idempotency-Key': randomUUID() },
    });
    assert(idem3.outputId !== idem1.outputId, 'FARKLI bir Idempotency-Key ile yeni bir kayıt açılır');

    // ── Sunucu tarafı benzerlik tespiti (E3 katman 3, Faz 1.11) ──
    section('5.0c SUNUCU TARAFI BENZERLİK TESPİTİ (E3)');

    const dupDesc = `E3 benzerlik testi çıktısı ${randomUUID()}`;
    const dup1 = await api('POST', '/materials/outputs', { description: dupDesc, materialClass: 'metal', quantityKg: 10 }, state.accessToken);
    assert(dup1.status === 201, `İlk kayıt 201 döner (alınan: ${dup1.status})`);

    const dup2 = await api('POST', '/materials/outputs', { description: dupDesc, materialClass: 'metal', quantityKg: 10 }, state.accessToken);
    assert(dup2.status === 409, `Aynı açıklamayla 5 dk içindeki ikinci istek 409 döner (alınan: ${dup2.status})`, dup2);
    assert(dup2.error === 'POSSIBLE_DUPLICATE', 'Hata kodu POSSIBLE_DUPLICATE');
    assert(dup2.details?.duplicateId === dup1.outputId, 'details.duplicateId ilk kaydın id\'sini gösteriyor');

    const dupCountBeforeConfirm = await prisma.output.count({ where: { description: dupDesc } });
    assert(dupCountBeforeConfirm === 1, '409 dönünce DB\'de İKİNCİ bir satır AÇILMADI');

    const dup3 = await api('POST', '/materials/outputs', { description: dupDesc, materialClass: 'metal', quantityKg: 10, confirmDuplicate: true }, state.accessToken);
    assert(dup3.status === 201, `confirmDuplicate:true ile aynı açıklama yine de 201 döner (alınan: ${dup3.status})`);
    assert(dup3.outputId !== dup1.outputId, 'confirmDuplicate ile GERÇEKTEN yeni bir kayıt açıldı');

    // 5 dakikalık pencerenin dışına çıkınca aynı açıklama artık işaretlenmemeli
    const oldDesc = `E3 eski kayıt testi ${randomUUID()}`;
    const oldOutput = await api('POST', '/materials/outputs', { description: oldDesc, materialClass: 'metal', quantityKg: 10 }, state.accessToken);
    await prisma.output.update({ where: { id: oldOutput.outputId }, data: { createdAt: new Date(Date.now() - 6 * 60 * 1000) } });
    const afterWindow = await api('POST', '/materials/outputs', { description: oldDesc, materialClass: 'metal', quantityKg: 10 }, state.accessToken);
    assert(afterWindow.status === 201, `5 dakika penceresi dışındaki aynı açıklama artık 409 değil 201 döner (alınan: ${afterWindow.status})`);

    // Girdiler (inputs) için de aynı kural geçerli
    const dupInputDesc = `E3 benzerlik testi girdisi ${randomUUID()}`;
    const dupInput1 = await api('POST', '/materials/inputs', { description: dupInputDesc, materialClass: 'metal', quantityKg: 10 }, state.accessToken);
    assert(dupInput1.status === 201, 'Girdi: ilk kayıt 201 döner');
    const dupInput2 = await api('POST', '/materials/inputs', { description: dupInputDesc, materialClass: 'metal', quantityKg: 10 }, state.accessToken);
    assert(dupInput2.status === 409, `Girdi: aynı açıklamayla ikinci istek 409 döner (alınan: ${dupInput2.status})`);
    assert(dupInput2.details?.duplicateId === dupInput1.inputId, 'Girdi: details.duplicateId ilk kaydın id\'sini gösteriyor');

    // ── POST /v1/materials/inputs ──
    const createInputRes = await api('POST', '/materials/inputs', {
        description: 'Selüloz bazlı hammadde ihtiyacı, yapı malzemesi üretimi için',
        materialClass: 'organic',
        quantityKg: 500,
        frequency: 'weekly',
    }, state.accessToken);

    assert(createInputRes.status === 201, `POST /v1/materials/inputs 201 döndürdü (alınan: ${createInputRes.status})`, createInputRes);
    assert(!!createInputRes.inputId, 'Girdi oluşturma inputId döndürdü');
    assert(createInputRes.embeddingPending === false, 'Girdi embeddingPending değeri false (dummy AiClient senkron embed etti, K-24)');

    const dbInputEmbedding = await prisma.embedding.findFirst({ where: { recordId: createInputRes.inputId, recordType: 'INPUT' } });
    assert(!!dbInputEmbedding, 'Girdi için de embeddings tablosuna gerçek bir satır yazıldı');

    state.inputId = createInputRes.inputId;

    // ── GET /v1/materials/inputs (listeleme, sayfalanmış) ──
    const listInputsRes = await api('GET', '/materials/inputs?page=1&limit=5', null, state.accessToken);
    assert(listInputsRes.status === 200, `GET /v1/materials/inputs 200 döndürdü (alınan: ${listInputsRes.status})`);
    assert(Array.isArray(listInputsRes.data), 'Girdi listesinde data dizisi var');
    assert(listInputsRes.data.some((i) => i.id === state.inputId), 'Oluşturulan girdi listede mevcut');

    // ── PATCH /v1/materials/inputs/:id ──
    const patchInputRes = await api('PATCH', `/materials/inputs/${state.inputId}`, { quantityKg: 600 }, state.accessToken);
    assert(patchInputRes.status === 200, `PATCH /v1/materials/inputs/:id 200 döndürdü (alınan: ${patchInputRes.status})`);

    const dbInputAfterPatch = await prisma.input.findUnique({ where: { id: state.inputId } });
    assert(Number(dbInputAfterPatch?.quantityKg) === 600, 'DB\'de girdi quantityKg güncellendi');

    // ── DELETE /v1/materials/inputs/:id ──
    const deleteInputRes = await api('DELETE', `/materials/inputs/${state.inputId}`, null, state.accessToken);
    assert(deleteInputRes.status === 200, `DELETE /v1/materials/inputs/:id 200 döndürdü (alınan: ${deleteInputRes.status})`);
    const deletedInput = await prisma.input.findUnique({ where: { id: state.inputId } });
    assert(deletedInput === null, 'Silme işleminden sonra girdi DB\'den kaldırıldı');

    // ── Aktif bir eşleşme varken DELETE engeli (409) ──
    section('5.1 AKTİF EŞLEŞME SİLME KORUMASI');

    const matchOutput = await api('POST', '/materials/outputs', {
        description: 'Aktif eşleşmesi olacak test çıktısı',
        materialClass: 'metal',
        quantityKg: 100,
    }, state.accessToken);
    const matchInput = await api('POST', '/materials/inputs', {
        description: 'Aktif eşleşme için test girdisi',
        materialClass: 'metal',
        quantityKg: 100,
    }, state.accessToken);

    // Eşleştirme modülü Prisma üzerinden doğrudan test kaydı oluşturuyor
    const fakeMatch = await prisma.match.create({
        data: {
            outputId: matchOutput.outputId,
            inputId: matchInput.inputId,
            totalScore: 70,
            breakdown: { material: 70, quality: 70, environmental: 70, logistics: 70, economic: 70 },
            status: 'PENDING',
            expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        },
    });

    const blockedDelete = await api('DELETE', `/materials/outputs/${matchOutput.outputId}`, null, state.accessToken);
    assert(blockedDelete.status === 409, `Aktif eşleşme nedeniyle engellenen silme işlemi 409 döndürdü (alınan: ${blockedDelete.status})`, blockedDelete);

    await prisma.match.delete({ where: { id: fakeMatch.id } });
    const unblockedDelete = await api('DELETE', `/materials/outputs/${matchOutput.outputId}`, null, state.accessToken);
    assert(unblockedDelete.status === 200, `Aktif eşleşme kaldırıldıktan sonra silme başarılı oldu (alınan: ${unblockedDelete.status})`);
    await prisma.input.deleteMany({ where: { id: matchInput.inputId } });

    // ── NEGATİF SENARYOLAR ──
    section('5.2 MATERYALLER NEGATİF SENARYOLARI');

    // 1. Yetkisiz istek
    const unauthCreate = await api('POST', '/materials/outputs', { description: 'x', quantityKg: 1 });
    assert(unauthCreate.status === 401, 'Kimlik doğrulamasız çıktı oluşturma engellendi (401)');

    // 2. Zorunlu alanlar eksik
    const missingFields = await api('POST', '/materials/outputs', { description: 'eksik alanlar' }, state.accessToken);
    assert(missingFields.status === 400, `Eksik quantityKg reddedildi (400, alınan: ${missingFields.status})`);

    // 3. Geçersiz materialClass
    const invalidClass = await api('POST', '/materials/outputs', {
        description: 'geçersiz sınıf testi', materialClass: 'radioactive', quantityKg: 10,
    }, state.accessToken);
    assert(invalidClass.status === 400, `Geçersiz materialClass reddedildi (400, alınan: ${invalidClass.status})`);

    // 4. Geçersiz frequency
    const invalidFrequency = await api('POST', '/materials/outputs', {
        description: 'geçersiz sıklık testi', materialClass: 'metal', quantityKg: 10, frequency: 'hourly',
    }, state.accessToken);
    assert(invalidFrequency.status === 400, `Geçersiz frequency (sıklık) reddedildi (400, alınan: ${invalidFrequency.status})`);

    // 5. Negatif veya sıfır miktar
    const zeroQuantity = await api('POST', '/materials/outputs', {
        description: 'sıfır miktar testi', materialClass: 'metal', quantityKg: 0,
    }, state.accessToken);
    assert(zeroQuantity.status === 400, `Sıfır quantityKg reddedildi (400, alınan: ${zeroQuantity.status})`);

    // 6. Mevcut olmayan çıktı id'si 404 döner
    const notFound = await api('GET', '/materials/outputs/00000000-0000-0000-0000-000000000000', null, state.accessToken);
    assert(notFound.status === 404, `Mevcut olmayan çıktı id'si 404 döndürdü (alınan: ${notFound.status})`);

    // 7. Çapraz tesis sahipliği: Başka tesise ait çıktıya erişilememeli
    if (state.adminToken) {
        const crossFacilityGet = await api('GET', `/materials/outputs/${state.outputId}`, null, state.adminToken);
        assert(crossFacilityGet.status === 404, `Başka bir tesise ait çıktıda çapraz tesis GET isteği 404 döndürdü, kayıt sızdırılmadı (alınan: ${crossFacilityGet.status})`);

        // 8. Doğrulanmamış tesis materyal oluşturamaz
        const unverifiedCreate = await api('POST', '/materials/outputs', {
            description: 'doğrulanmamış tesis testi', materialClass: 'metal', quantityKg: 10,
        }, state.adminToken);
        assert(unverifiedCreate.status === 403, `Doğrulanmamış tesisin çıktı oluşturması engellendi (403, alınan: ${unverifiedCreate.status})`, unverifiedCreate);
        assert(unverifiedCreate.error === 'FACILITY_NOT_VERIFIED', 'Hata kodu FACILITY_NOT_VERIFIED');
    }
};
