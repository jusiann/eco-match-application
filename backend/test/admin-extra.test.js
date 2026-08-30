// ═══════════════════════════════════════════════════════════════
//  Admin Ek Endpoint Testleri — Carbon Factors (2.9), Kullanıcı
//  Yönetimi, Sistem Yapılandırması, Denetim Kaydı (numarasız),
//  Süresi Dolan Eşleşme Cron'u (2.7, A3) & Retry (2.8)
// ═══════════════════════════════════════════════════════════════

import { randomUUID } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { TEST_DATA, state, assert, api, section, prisma, BACKEND_DIR } from './helpers.js';

export const testAdminExtra = async () => {
    section('12. ADMIN EK ENDPOINT\'LERİ (carbon-factors, users, config, audit-log)');

    // ── Carbon Factors (Faz 2.9) ──
    const listBeforeRes = await api('GET', '/admin/carbon-factors', null, state.adminToken);
    assert(listBeforeRes.status === 200, `GET /v1/admin/carbon-factors 200 döner (alınan: ${listBeforeRes.status})`);
    const beforeCount = (listBeforeRes.data || []).filter((f) => f.materialClass === 'METAL' && f.factorType === 'transport').length;

    const newTransportFactor = await api('POST', '/admin/carbon-factors', {
        materialClass: 'metal',
        factorType: 'transport',
        co2PerKg: 0.12,
        source: 'E2E Test Kaynağı',
    }, state.adminToken);
    assert(newTransportFactor.status === 201, `Yeni (daha önce hiç olmayan) faktör 201 döner (alınan: ${newTransportFactor.status})`);

    const listAfterRes = await api('GET', '/admin/carbon-factors', null, state.adminToken);
    const afterCount = (listAfterRes.data || []).filter((f) => f.materialClass === 'METAL' && f.factorType === 'transport').length;
    assert(afterCount === beforeCount + 1, 'Yeni transport faktörü listeye eklendi');

    // Zaten AKTİF olan metal/virgin faktörünün üzerine yeni bir kayıt eklemek eskisini kapatmalı (AD3)
    const oldVirgin = (listAfterRes.data || []).find((f) => f.materialClass === 'METAL' && f.factorType === 'virgin' && f.validTo === null);
    assert(!!oldVirgin, 'Seed\'den gelen aktif metal/virgin faktörü bulundu');

    const newVirginFactor = await api('POST', '/admin/carbon-factors', {
        materialClass: 'metal',
        factorType: 'virgin',
        co2PerKg: 2.4,
        source: 'E2E Test Güncellemesi',
    }, state.adminToken);
    assert(newVirginFactor.status === 201, `Aktif faktörün üzerine yeni kayıt 201 döner (alınan: ${newVirginFactor.status})`);

    const dbOldVirgin = await prisma.carbonFactor.findUnique({ where: { id: oldVirgin.id } });
    assert(dbOldVirgin.validTo !== null, 'Eski aktif faktörün valid_to\'su artık dolu (retroaktiflik yok, AD3)');

    const activeVirginRows = await prisma.carbonFactor.findMany({ where: { materialClass: 'METAL', factorType: 'virgin', validTo: null } });
    assert(activeVirginRows.length === 1, 'Aynı anda tam olarak TEK bir aktif metal/virgin faktörü var');

    const invalidMaterialClass = await api('POST', '/admin/carbon-factors', { materialClass: 'unobtanium', factorType: 'virgin', co2PerKg: 1, source: 'x' }, state.adminToken);
    assert(invalidMaterialClass.status === 400, `Geçersiz materialClass 400 döner (alınan: ${invalidMaterialClass.status})`);

    const forbiddenCarbonFactor = await api('GET', '/admin/carbon-factors', null, state.accessToken);
    assert(forbiddenCarbonFactor.status === 403, `Sıradan kullanıcı carbon-factors\'a erişemez (403, alınan: ${forbiddenCarbonFactor.status})`);

    // ── Kullanıcı Yönetimi (numarasız) ──
    section('12.1 KULLANICI YÖNETİMİ (/v1/admin/users)');

    const usersListRes = await api('GET', '/admin/users', null, state.adminToken);
    assert(usersListRes.status === 200, `GET /v1/admin/users 200 döner (alınan: ${usersListRes.status})`);
    assert(Array.isArray(usersListRes.data), 'data bir dizi');

    const newUserEmail = `osb-manager-${TEST_DATA.runId}@ecomatch-test.com`;
    const createUserRes = await api('POST', '/admin/users', {
        email: newUserEmail,
        password: 'Password123!',
        role: 'OSB_MANAGER',
        facilityId: state.facilityId,
        contactName: 'OSB Yöneticisi',
    }, state.adminToken);
    assert(createUserRes.status === 201, `POST /v1/admin/users 201 döner (alınan: ${createUserRes.status})`, createUserRes);
    assert(!!createUserRes.userId, 'Yeni kullanıcı id\'si döndü');

    const newUserLogin = await api('POST', '/auth/login', { email: newUserEmail, password: 'Password123!' });
    assert(newUserLogin.status === 200 || newUserLogin.status === 201, 'Admin eliyle oluşturulan kullanıcı doğrudan giriş yapabiliyor (emailVerified=true)');
    assert(newUserLogin.user?.role === 'OSB_MANAGER', 'Yeni kullanıcının rolü doğru atanmış');

    const dupEmailUser = await api('POST', '/admin/users', { email: newUserEmail, password: 'Password123!', role: 'EXPERT', facilityId: state.facilityId }, state.adminToken);
    assert(dupEmailUser.status === 409, `Aynı e-posta ile tekrar kullanıcı oluşturma 409 döner (alınan: ${dupEmailUser.status})`);

    const updateUserRes = await api('PATCH', `/admin/users/${createUserRes.userId}`, { role: 'EXPERT' }, state.adminToken);
    assert(updateUserRes.status === 200, `PATCH /v1/admin/users/:id 200 döner (alınan: ${updateUserRes.status})`);
    const dbUpdatedUser = await prisma.user.findUnique({ where: { id: createUserRes.userId } });
    assert(dbUpdatedUser.role === 'EXPERT', 'Kullanıcının rolü PATCH ile gerçekten değişti');

    const invalidFacilityUser = await api('POST', '/admin/users', { email: `x-${randomUUID()}@test.com`, password: 'Password123!', role: 'EXPERT', facilityId: randomUUID() }, state.adminToken);
    assert(invalidFacilityUser.status === 400, `Mevcut olmayan facilityId 400 döner (alınan: ${invalidFacilityUser.status})`);

    // ── Sistem Yapılandırması (numarasız) ──
    section('12.2 SİSTEM YAPILANDIRMASI (/v1/admin/config)');

    const configRes = await api('GET', '/admin/config', null, state.adminToken);
    assert(configRes.status === 200, `GET /v1/admin/config 200 döner (alınan: ${configRes.status})`);
    assert(configRes['match.threshold'] === 0.6, 'match.threshold beklenen değerde (0.60, K-01)');
    assert(configRes['match.hitl_threshold'] === 0.8, 'match.hitl_threshold beklenen değerde (0.80)');

    const originalDailyLimit = configRes['chat.daily_limit'];
    const updateConfigRes = await api('PATCH', '/admin/config', { 'chat.daily_limit': 75 }, state.adminToken);
    assert(updateConfigRes.status === 200, `PATCH /v1/admin/config 200 döner (alınan: ${updateConfigRes.status})`, updateConfigRes);

    const configAfterUpdate = await api('GET', '/admin/config', null, state.adminToken);
    assert(configAfterUpdate['chat.daily_limit'] === 75, 'Güncellenen değer gerçekten kalıcı oldu');

    // Eski değere geri al (diğer testleri etkilememesi için)
    await api('PATCH', '/admin/config', { 'chat.daily_limit': originalDailyLimit }, state.adminToken);

    const unknownKeyRes = await api('PATCH', '/admin/config', { 'not.a.real.key': 1 }, state.adminToken);
    assert(unknownKeyRes.status === 400, `Bilinmeyen system_config anahtarı 400 döner (alınan: ${unknownKeyRes.status})`);

    // ── Denetim Kaydı (numarasız) ──
    section('12.3 DENETİM KAYDI (/v1/admin/audit-log)');

    const auditRes = await api('GET', '/admin/audit-log', null, state.adminToken);
    assert(auditRes.status === 200, `GET /v1/admin/audit-log 200 döner (alınan: ${auditRes.status})`);
    assert(Array.isArray(auditRes.data), 'data bir dizi');
    assert((auditRes.data || []).some((a) => a.entity === 'output' && a.action === 'create'), 'Bu test paketinin oluşturduğu çıktı kayıtları audit_log\'da görünüyor');

    const auditFilteredRes = await api('GET', '/admin/audit-log?entity=output', null, state.adminToken);
    assert((auditFilteredRes.data || []).every((a) => a.entity === 'output'), '?entity= filtresi doğru çalışıyor');

    const forbiddenAudit = await api('GET', '/admin/audit-log', null, state.accessToken);
    assert(forbiddenAudit.status === 403, `Sıradan kullanıcı audit-log'a erişemez (403, alınan: ${forbiddenAudit.status})`);

    // ── Süresi Dolan Eşleşme Cron'u (Faz 2.7, A3) & Retry (Faz 2.8) ──
    section('12.4 SÜRESİ DOLAN EŞLEŞME CRON\'U VE RETRY');

    const expOutput = await api('POST', '/materials/outputs', { description: 'Expiry cron testi çıktısı', materialClass: 'metal', quantityKg: 100, stock: 100 }, state.accessToken);
    const expInput = await api('POST', '/materials/inputs', { description: 'Expiry cron testi girdisi', materialClass: 'metal', quantityKg: 50 }, state.consumerToken);
    const expiredMatch = await prisma.match.create({
        data: {
            outputId: expOutput.outputId,
            inputId: expInput.inputId,
            totalScore: 60,
            breakdown: { material: 60, quality: 60, environmental: 60, logistics: 60, economic: 60 },
            demandQty: 50,
            status: 'PENDING',
            expiresAt: new Date(Date.now() - 24 * 60 * 60 * 1000), // 1 gün önce doldu
        },
    });

    const cronRes = await api('POST', '/admin/cron/expire-matches', null, state.adminToken);
    assert(cronRes.status === 201, `expire-matches cron tetikleme 201 döner (alınan: ${cronRes.status})`, cronRes);
    assert(cronRes.count >= 1, `En az 1 eşleşme süresi doldu olarak işaretlendi (alınan: ${cronRes.count})`);

    const dbExpiredMatch = await prisma.match.findUnique({ where: { id: expiredMatch.id } });
    assert(dbExpiredMatch.status === 'EXPIRED', 'Eşleşme gerçekten EXPIRED oldu (A3)');

    const supplierExpiryNotifs = await api('GET', '/notifications', null, state.accessToken);
    assert((supplierExpiryNotifs.data || []).some((n) => n.type === 'match_expired' && n.payload?.match_id === expiredMatch.id), 'Tedarikçiye match_expired bildirimi gitti');
    const consumerExpiryNotifs = await api('GET', '/notifications', null, state.consumerToken);
    assert((consumerExpiryNotifs.data || []).some((n) => n.type === 'match_expired' && n.payload?.match_id === expiredMatch.id), 'Tüketiciye de match_expired bildirimi gitti');

    // Expired eşleşme artık kabul edilemez
    const acceptExpired = await api('POST', `/matches/${expiredMatch.id}/accept`, null, state.accessToken);
    assert(acceptExpired.status === 409, `Süresi dolmuş eşleşme kabul edilemez (409, alınan: ${acceptExpired.status})`);

    // Retry -- yeni bir eşleşme açar, eskisi expired kalır
    const retryRes = await api('POST', `/matches/${expiredMatch.id}/retry`, null, state.accessToken);
    assert(retryRes.status === 201, `POST /v1/matches/:id/retry 201 döner (alınan: ${retryRes.status})`, retryRes);
    assert(!!retryRes.matchId && retryRes.matchId !== expiredMatch.id, 'Retry YENİ bir match id döndürüyor');

    const dbNewMatch = await prisma.match.findUnique({ where: { id: retryRes.matchId } });
    assert(dbNewMatch.status === 'PENDING', 'Yeni eşleşme PENDING durumunda açıldı');
    assert(dbNewMatch.outputId === expiredMatch.outputId && dbNewMatch.inputId === expiredMatch.inputId, 'Yeni eşleşme aynı çıktı/girdi çiftini taşıyor');
    assert(dbNewMatch.expiresAt.getTime() > Date.now(), 'Yeni eşleşmenin geçerlilik süresi ileride bir tarih');

    const dbOldMatchStillExpired = await prisma.match.findUnique({ where: { id: expiredMatch.id } });
    assert(dbOldMatchStillExpired.status === 'EXPIRED', 'Eski eşleşme EXPIRED olarak kalır (audit izi, A3)');

    // Sadece expired eşleşmeler retry edilebilir
    const retryNonExpired = await api('POST', `/matches/${dbNewMatch.id}/retry`, null, state.accessToken);
    assert(retryNonExpired.status === 409, `PENDING bir eşleşmeyi retry etmek 409 döner (alınan: ${retryNonExpired.status})`);

    // ── Haftalık Geri Besleme Export'u (Faz 2.12) ──
    // review-queue.test.js ve matches.test.js zaten reddedilmiş eşleşmeler ve
    // onaylanmış/reddedilmiş inceleme kayıtları oluşturmuştu -- bu export onların üzerinden çalışıyor.
    section('12.5 HAFTALIK GERİ BESLEME EXPORT\'U (Faz 2.12)');

    const exportRes = await api('POST', '/admin/cron/weekly-feedback-export', null, state.adminToken);
    assert(exportRes.status === 201, `weekly-feedback-export tetikleme 201 döner (alınan: ${exportRes.status})`, exportRes);
    assert(exportRes.rejections >= 1, `En az 1 reddedilen eşleşme export edildi (alınan: ${exportRes.rejections})`);
    assert(exportRes.humanReviewed >= 1, `En az 1 uzman incelemesi export edildi (alınan: ${exportRes.humanReviewed})`);

    // process.cwd() DEĞİL BACKEND_DIR kullanılıyor -- sunucu her zaman backend/ kökünden
    // yazıyor, testin kendi process.cwd()'i npm'in nereden tetiklendiğine göre kayabilir (K-30).
    const rejectionsPath = path.join(BACKEND_DIR, 'training', 'feedback', 'rejections.jsonl');
    const humanReviewedPath = path.join(BACKEND_DIR, 'training', 'human_reviewed.jsonl');
    assert(fs.existsSync(rejectionsPath), 'training/feedback/rejections.jsonl dosyası gerçekten oluştu');
    assert(fs.existsSync(humanReviewedPath), 'training/human_reviewed.jsonl dosyası gerçekten oluştu');

    const rejectionLines = fs.readFileSync(rejectionsPath, 'utf8').trim().split('\n').filter(Boolean);
    const rejectionEntry = JSON.parse(rejectionLines[0]);
    assert(typeof rejectionEntry.match_id === 'string' && typeof rejectionEntry.category === 'string', 'rejections.jsonl satırları docs/07 şeklinde ({match_id, category, created_at})');

    const humanReviewedLines = fs.readFileSync(humanReviewedPath, 'utf8').trim().split('\n').filter(Boolean);
    const reviewedEntry = JSON.parse(humanReviewedLines[0]);
    assert(
        'text' in reviewedEntry && 'ai_prediction' in reviewedEntry && 'ai_confidence' in reviewedEntry && 'human_label' in reviewedEntry,
        'human_reviewed.jsonl satırları docs/07 şeklinde ({text, ai_prediction, ai_confidence, human_label, notes})',
    );

    const forbiddenExport = await api('POST', '/admin/cron/weekly-feedback-export', null, state.accessToken);
    assert(forbiddenExport.status === 403, `Sıradan kullanıcı export'u tetikleyemez (403, alınan: ${forbiddenExport.status})`);
};
