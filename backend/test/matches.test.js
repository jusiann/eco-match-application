// ═══════════════════════════════════════════════════════════════
//  Eşleşmeler (Matches) Modülü Testleri — Durum Makinesi,
//  Gizlilik Koruması, Yetersiz Stok (E7), Reddetme Akışı,
//  İletişim Bilgisi Erişimi, Idempotency-Key & Negatif Senaryolar
// ═══════════════════════════════════════════════════════════════

import { randomUUID } from 'crypto';
import { TEST_DATA, state, assert, api, section, prisma } from './helpers.js';

const FAR_FUTURE = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

async function makeOutput(token, quantityKg, stock) {
    const res = await api('POST', '/materials/outputs', {
        description: `Match testi çıktısı ${randomUUID()}`,
        materialClass: 'metal',
        quantityKg,
        stock,
    }, token);
    return res.outputId;
}

async function makeInput(token, quantityKg) {
    const res = await api('POST', '/materials/inputs', {
        description: `Match testi girdisi ${randomUUID()}`,
        materialClass: 'metal',
        quantityKg,
    }, token);
    return res.inputId;
}

async function makeMatch(outputId, inputId, demandQty) {
    return prisma.match.create({
        data: {
            outputId,
            inputId,
            totalScore: 75,
            breakdown: { material: 75, quality: 75, environmental: 75, logistics: 75, economic: 75 },
            demandQty,
            status: 'PENDING',
            expiresAt: FAR_FUTURE,
        },
    });
}

export const testMatches = async () => {
    section('6. EŞLEŞMELER (MATCHES) MODÜLÜ (/v1/matches/*)');

    // ── Kurulum: İkinci ("tüketici") tesis kaydı ve yönetici onayı ──
    const consumerEmail = `consumer-${TEST_DATA.runId}@ecomatch-test.com`;
    const consumerRegister = await api('POST', '/auth/register', {
        name: `E2E Tüketici Fabrikası ${TEST_DATA.runId}`,
        taxId: `97${TEST_DATA.runId.padStart(8, '0')}`,
        sector: 'construction',
        email: consumerEmail,
        password: 'Password123!',
        contactName: 'Tüketici Yetkili',
        phone: '+90 555 000 00 00',
        location: { lat: 39.92, lng: 32.85 },
    });
    assert(consumerRegister.status === 201, `Tüketici tesisi kaydı 201 döndürdü (alınan: ${consumerRegister.status})`);

    state.consumerToken = consumerRegister.access_token;
    state.consumerFacilityId = consumerRegister.facility?.id;

    const consumerDocForm = new FormData();
    consumerDocForm.append('documentType', 'tax_certificate');
    consumerDocForm.append('file', new Blob(['%PDF-1.4 consumer doc'], { type: 'application/pdf' }), 'doc.pdf');
    const consumerUpload = await api('POST', '/facilities/me/documents', consumerDocForm, state.consumerToken);
    assert(consumerUpload.status === 201, 'Tüketici tesisi belge yükleme 201 döndürdü');

    const pendingForConsumer = await api('GET', '/admin/verifications', null, state.adminToken);
    const consumerVerification = (pendingForConsumer.data || []).find((v) => v.facilityId === state.consumerFacilityId);
    assert(!!consumerVerification, 'Tüketici tesisi doğrulaması yönetici onay kuyruğunda bulundu');
    const consumerApprove = await api('POST', `/admin/verifications/${consumerVerification.id}/approve`, null, state.adminToken);
    assert(consumerApprove.status === 201, 'Tüketici tesisi onaylandı');

    // ═══ Senaryo A: Karşılıklı Onay -> Tamamlandı, Gizlilik, İletişim ═══
    section('6.1 KARŞILIKLI ONAY -> TAMAMLANDI (MUTUAL ACCEPT -> COMPLETED)');

    const outputA = await makeOutput(state.accessToken, 1000, 1000);
    const inputA = await makeInput(state.consumerToken, 500);
    const matchA = await makeMatch(outputA, inputA, 500);

    // Gizlilik: Her iki taraf da onaylamadan önce karşı tarafın gerçek unvanını göremez
    const listSupplierSide = await api('GET', '/matches', null, state.accessToken);
    const supplierView = (listSupplierSide.data || []).find((m) => m.id === matchA.id);
    assert(!!supplierView, 'Eşleşme A tedarikçinin /v1/matches listesinde görünüyor');
    assert(supplierView.role === 'supplier', 'Tedarikçi tarafının rolü doğru şekilde "supplier" olarak etiketlendi');
    assert(supplierView.counterparty && 'osbName' in supplierView.counterparty, 'counterparty nesnesinde osbName alanı mevcut');
    assert(!('companyName' in (supplierView.counterparty || {})), 'counterparty tamamlanmadan önce companyName bilgisini SIZDIRMIYOR (S3 gizlilik kuralı)');
    assert(!JSON.stringify(supplierView).includes(consumerEmail), 'Eşleşme listesi yanıtı tamamlanmadan önce karşı tarafın e-postasını asla sızdırmıyor');

    const listConsumerSide = await api('GET', '/matches', null, state.consumerToken);
    const consumerView = (listConsumerSide.data || []).find((m) => m.id === matchA.id);
    assert(consumerView?.role === 'consumer', 'Tüketici tarafının rolü doğru şekilde "consumer" olarak etiketlendi');

    // Taraf olmayan üçüncü bir tesis bu eşleşmeyi göremez ve işlem yapamaz
    const bystanderGet = await api('GET', `/matches/${matchA.id}`, null, state.adminToken);
    assert(bystanderGet.status === 404, `Taraf olmayan tesis için GET /v1/matches/:id 404 döndürdü, kayıt sızdırılmadı (alınan: ${bystanderGet.status})`);
    const bystanderAccept = await api('POST', `/matches/${matchA.id}/accept`, null, state.adminToken);
    assert(bystanderAccept.status === 404, `Taraf olmayan tesisin onayı 404 ile engellendi (alınan: ${bystanderAccept.status})`);

    // Tamamlanmadan önce iletişim bilgisi kilitlidir
    const contactBeforeComplete = await api('GET', `/matches/${matchA.id}/contact`, null, state.accessToken);
    assert(contactBeforeComplete.status === 403, `İletişim bilgisi tamamlanmadan önce kilitli (403, alınan: ${contactBeforeComplete.status})`);
    assert(contactBeforeComplete.error === 'CONTACT_NOT_AVAILABLE', 'Hata kodu CONTACT_NOT_AVAILABLE');

    // Tedarikçi ilk onayı verir: pending -> accepted
    const supplierAccept = await api('POST', `/matches/${matchA.id}/accept`, null, state.accessToken);
    assert(supplierAccept.status === 201, `Tedarikçi onayı 201 döndürdü (alınan: ${supplierAccept.status})`, supplierAccept);
    assert(supplierAccept.bodyStatus === 'accepted', 'İlk taraf onayladıktan sonra yanıt gövdesi "accepted" durumu bildiriyor');
    const dbAfterFirstAccept = await prisma.match.findUnique({ where: { id: matchA.id } });
    assert(dbAfterFirstAccept.status === 'ACCEPTED', 'İlk taraf onayladıktan sonra DB durumu ACCEPTED oldu');
    assert(dbAfterFirstAccept.acceptedBySupplierAt !== null, 'accepted_by_supplier_at alanı atandı');
    assert(dbAfterFirstAccept.acceptedByConsumerAt === null, 'accepted_by_consumer_at alanı halen null');

    // Aynı tarafın tekrar onay vermesi engellenir
    const supplierAcceptAgain = await api('POST', `/matches/${matchA.id}/accept`, null, state.accessToken);
    assert(supplierAcceptAgain.status === 409, `Aynı tarafın iki kez onaylaması 409 döndürdü (alınan: ${supplierAcceptAgain.status})`);
    assert(supplierAcceptAgain.error === 'INVALID_STATE_TRANSITION', 'Hata kodu INVALID_STATE_TRANSITION');

    // Tüketici de onay verir: accepted -> completed, stok düşer
    const consumerAccept = await api('POST', `/matches/${matchA.id}/accept`, null, state.consumerToken);
    assert(consumerAccept.status === 201, `Tüketici onayı 201 döndürdü (alınan: ${consumerAccept.status})`, consumerAccept);
    assert(consumerAccept.bodyStatus === 'completed', 'Her iki taraf da onaylayınca yanıt gövdesi "completed" durumu bildiriyor');
    const dbAfterComplete = await prisma.match.findUnique({ where: { id: matchA.id } });
    assert(dbAfterComplete.status === 'COMPLETED', 'Her iki taraf da onaylayınca DB durumu COMPLETED oldu');
    const dbOutputAfterComplete = await prisma.output.findUnique({ where: { id: outputA } });
    assert(Number(dbOutputAfterComplete.stock) === 500, 'Çıktı stoku demandQty kadar düşürüldü (1000 - 500 = 500), E7');

    // Tamamlanmış eşleşmede tekrar onay verilmesi engellenir
    const acceptAfterComplete = await api('POST', `/matches/${matchA.id}/accept`, null, state.accessToken);
    assert(acceptAfterComplete.status === 409, `Tamamlanmış eşleşmeyi tekrar onaylama 409 döndürdü (alınan: ${acceptAfterComplete.status})`);

    // İletişim bilgisi artık her iki taraf için de açılmıştır
    const contactAfterComplete = await api('GET', `/matches/${matchA.id}/contact`, null, state.accessToken);
    assert(contactAfterComplete.status === 200, `İletişim bilgisi tamamlanma sonrası erişilebilir (alınan: ${contactAfterComplete.status})`, contactAfterComplete);
    assert(contactAfterComplete.email === consumerEmail, 'Tedarikçi tamamlanma sonrası tüketicinin gerçek e-postasını görebiliyor');

    const contactFromConsumerSide = await api('GET', `/matches/${matchA.id}/contact`, null, state.consumerToken);
    assert(contactFromConsumerSide.status === 200, 'İletişim bilgisi tüketici tarafı için de erişilebilir');

    // ═══ Senaryo B: Yetersiz Stok (E7) ═══
    section('6.2 YETERSİZ STOK (INSUFFICIENT STOCK - E7)');

    const outputB = await makeOutput(state.accessToken, 100, 100);
    const inputB = await makeInput(state.consumerToken, 500);
    const matchB = await makeMatch(outputB, inputB, 500); // talep (500) > stok (100)

    const supplierAcceptB = await api('POST', `/matches/${matchB.id}/accept`, null, state.accessToken);
    assert(supplierAcceptB.status === 201, 'Düşük stoklu eşleşmede ilk onay yine de başarılı olur (stok yalnızca tamamlanmada kontrol edilir)');

    const consumerAcceptB = await api('POST', `/matches/${matchB.id}/accept`, null, state.consumerToken);
    assert(consumerAcceptB.status === 409, `Yetersiz stokla tamamlayıcı onay 409 döndürdü (alınan: ${consumerAcceptB.status})`, consumerAcceptB);
    assert(consumerAcceptB.error === 'INSUFFICIENT_STOCK', 'Hata kodu INSUFFICIENT_STOCK');

    const dbMatchB = await prisma.match.findUnique({ where: { id: matchB.id } });
    assert(dbMatchB.status === 'ACCEPTED', 'Eşleşme ACCEPTED durumunda kalır, yetersiz stokta sessizce tamamlanmaz');
    const dbOutputB = await prisma.output.findUnique({ where: { id: outputB } });
    assert(Number(dbOutputB.stock) === 100, 'Tamamlanma engellendiğinde çıktı stokuna dokunulmaz');

    // ═══ Senaryo C: Reddetme Akışı ═══
    section('6.3 REDDETME AKIŞI (REJECT FLOW)');

    const outputC = await makeOutput(state.accessToken, 200, 200);
    const inputC = await makeInput(state.consumerToken, 150);
    const matchC = await makeMatch(outputC, inputC, 150);

    const rejectInvalidCategory = await api('POST', `/matches/${matchC.id}/reject`, { reasonCategory: 'not_a_real_category' }, state.accessToken);
    assert(rejectInvalidCategory.status === 400, `Geçersiz reasonCategory 400 ile reddedildi (alınan: ${rejectInvalidCategory.status})`);

    const rejectMissingCategory = await api('POST', `/matches/${matchC.id}/reject`, {}, state.accessToken);
    assert(rejectMissingCategory.status === 400, `Eksik reasonCategory 400 ile reddedildi (alınan: ${rejectMissingCategory.status})`);

    const secretReasonText = 'Bu metin karşı tarafa asla gösterilmemeli';
    const rejectRes = await api('POST', `/matches/${matchC.id}/reject`, {
        reasonCategory: 'price_too_low',
        reasonText: secretReasonText,
    }, state.accessToken);
    assert(rejectRes.status === 201, `Geçerli ret işlemi 201 döndürdü (alınan: ${rejectRes.status})`, rejectRes);

    const dbMatchC = await prisma.match.findUnique({ where: { id: matchC.id } });
    assert(dbMatchC.status === 'REJECTED', 'DB durumu REJECTED oldu');
    assert(dbMatchC.rejectionReasonCategory === 'price_too_low', 'rejection_reason_category doğru kaydedildi');
    assert(dbMatchC.rejectionReasonText === secretReasonText, 'rejection_reason_text DB\'de saklandı (dahili/denetim amaçlı)');

    const matchCDetail = await api('GET', `/matches/${matchC.id}`, null, state.consumerToken);
    assert(!JSON.stringify(matchCDetail).includes(secretReasonText), 'reasonText API üzerinden ASLA ifşa edilmez, yalnızca kategori döner (A1 gizlilik kuralı)');

    const acceptAfterReject = await api('POST', `/matches/${matchC.id}/accept`, null, state.accessToken);
    assert(acceptAfterReject.status === 409, `Reddedilmiş eşleşmede onay 409 döndürdü (alınan: ${acceptAfterReject.status})`);

    const contactAfterReject = await api('GET', `/matches/${matchC.id}/contact`, null, state.accessToken);
    assert(contactAfterReject.status === 403, `Reddedilmiş eşleşmede iletişim kilitli kalır (alınan: ${contactAfterReject.status})`);

    // ═══ Senaryo D: Onayda Idempotency-Key Kullanımı ═══
    section('6.4 ONAYDA TEKİLLİK ANAHTARI (IDEMPOTENCY-KEY ON ACCEPT)');

    const outputD = await makeOutput(state.accessToken, 300, 300);
    const inputD = await makeInput(state.consumerToken, 100);
    const matchD = await makeMatch(outputD, inputD, 100);

    const idemKey = randomUUID();
    const firstAccept = await api('POST', `/matches/${matchD.id}/accept`, null, state.accessToken, { headers: { 'Idempotency-Key': idemKey } });
    const secondAccept = await api('POST', `/matches/${matchD.id}/accept`, null, state.accessToken, { headers: { 'Idempotency-Key': idemKey } });

    assert(firstAccept.status === 201, `İlk tekil (idempotent) onay 201 döndürdü (alınan: ${firstAccept.status})`);
    assert(secondAccept.status === 201, `AYNI Idempotency-Key ile yinelenen onay da 409 değil 201 döndürdü (alınan: ${secondAccept.status})`, secondAccept);
    assert(secondAccept.message === firstAccept.message, 'Yinelenen yanıt gövdesi ilkiyle aynıdır (önbellekten sunuldu, işleyici yeniden çalışmadı)');

    const dbMatchD = await prisma.match.findUnique({ where: { id: matchD.id } });
    assert(dbMatchD.status === 'ACCEPTED', 'İki özdeş isteğe rağmen temel durum yalnızca BİR KEZ ilerledi');

    // Idempotency anahtarı OLMADAN yapılan gerçek bir tekrar onayı reddedilmelidir
    const thirdAcceptNoKey = await api('POST', `/matches/${matchD.id}/accept`, null, state.accessToken);
    assert(thirdAcceptNoKey.status === 409, `Idempotency-Key başlığı olmadan gerçek bir tekrar onayı doğru şekilde reddedildi (alınan: ${thirdAcceptNoKey.status})`);

    // ── NEGATİF SENARYOLAR ──
    section('6.5 EŞLEŞMELER NEGATİF SENARYOLARI');

    const unauthList = await api('GET', '/matches');
    assert(unauthList.status === 401, 'Kimlik doğrulamasız eşleşme listesi engellendi (401)');

    const notFoundMatch = await api('GET', '/matches/00000000-0000-0000-0000-000000000000', null, state.accessToken);
    assert(notFoundMatch.status === 404, `Mevcut olmayan eşleşme id'si 404 döndürdü (alınan: ${notFoundMatch.status})`);

    const filteredList = await api('GET', '/matches?status=completed', null, state.accessToken);
    assert(filteredList.status === 200, `?status= filtresi kabul edildi (alınan: ${filteredList.status})`);
    assert((filteredList.data || []).every((m) => m.status === 'COMPLETED'), 'Filtrelenen listedeki her eşleşmenin durumu COMPLETED');

    const invalidStatusFilter = await api('GET', '/matches?status=not_a_status', null, state.accessToken);
    assert(invalidStatusFilter.status === 400, `Geçersiz ?status= değeri 400 ile reddedildi (alınan: ${invalidStatusFilter.status})`);
};
