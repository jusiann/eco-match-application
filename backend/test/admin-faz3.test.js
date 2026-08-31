// ═══════════════════════════════════════════════════════════════
//  Admin Faz 3 Ek Endpoint Testleri — AHP Ağırlıkları (3.5, AD2),
//  API Anahtarları (3.6)
// ═══════════════════════════════════════════════════════════════

import { state, assert, api, section, prisma } from './helpers.js';

export const testAdminFaz3 = async () => {
    section('15. AHP AĞIRLIKLARI (/v1/admin/weights) — Faz 3.5, AD2');

    const before = await prisma.weightsConfig.findFirst({ where: { active: true } });
    state.originalActiveWeightsId = before?.id ?? null;

    const listRes = await api('GET', '/admin/weights', null, state.adminToken);
    assert(listRes.status === 200, `GET /v1/admin/weights 200 döner (alınan: ${listRes.status})`);
    assert(Array.isArray(listRes.data), 'weights listesi bir dizi döndü');
    assert(listRes.data.some((w) => w.active === true), 'Listede aktif bir versiyon var');

    // ── Toplam ≠ 1 -> 422 ──
    const invalidSum = await api('POST', '/admin/weights', {
        material: 0.30, quality: 0.20, environmental: 0.20, logistics: 0.20, economic: 0.20,
    }, state.adminToken);
    assert(invalidSum.status === 422, `Toplam 1.10 -> 422 döner (alınan: ${invalidSum.status})`, invalidSum);
    assert(invalidSum.error === 'WEIGHTS_SUM_INVALID', 'Hata kodu WEIGHTS_SUM_INVALID');
    assert(invalidSum.message.includes('1.100'), 'Hata mesajı gerçek toplamı (1.100) gösteriyor');

    // ── Geçerli yeni versiyon -> 201, otomatik aktifleşmez ──
    const createRes = await api('POST', '/admin/weights', {
        material: 0.28, quality: 0.20, environmental: 0.22, logistics: 0.17, economic: 0.13,
    }, state.adminToken);
    assert(createRes.status === 201, `Geçerli yeni versiyon 201 döner (alınan: ${createRes.status})`, createRes);
    assert(typeof createRes.weightsId === 'string', 'Yanıt weightsId döndürdü');
    state.testWeightsVersionId = createRes.weightsId;

    const newRowBeforeActivate = await prisma.weightsConfig.findUnique({ where: { id: createRes.weightsId } });
    assert(newRowBeforeActivate.active === false, 'Yeni versiyon OTOMATİK aktifleşmedi (docs/04)');
    assert(newRowBeforeActivate.version > (before?.version ?? 0), 'Yeni versiyon numarası öncekinden büyük');

    // ── Aktivasyon -- eski otomatik düşer, audit'te before/after ──
    const activateRes = await api('POST', `/admin/weights/${state.testWeightsVersionId}/activate`, null, state.adminToken);
    assert(activateRes.status === 201, `Aktivasyon 201 döner (alınan: ${activateRes.status})`, activateRes);

    const activeCount = await prisma.weightsConfig.count({ where: { active: true } });
    assert(activeCount === 1, `Aynı anda TAM OLARAK bir aktif versiyon var (alınan: ${activeCount})`);
    const nowActive = await prisma.weightsConfig.findUnique({ where: { id: state.testWeightsVersionId } });
    assert(nowActive.active === true, 'Yeni versiyon şimdi aktif');
    if (before) {
        const oldRow = await prisma.weightsConfig.findUnique({ where: { id: before.id } });
        assert(oldRow.active === false, 'Eski versiyon OTOMATİK deaktive oldu (AD2, kısmi unique indeks)');
    }

    const auditRow = await prisma.auditLog.findFirst({
        where: { entity: 'weights_config', action: 'activate', entityId: state.testWeightsVersionId },
        orderBy: { createdAt: 'desc' },
    });
    assert(!!auditRow, 'audit_log\'da action=activate, entity=weights_config kaydı var (AD2)');
    assert(auditRow?.after?.id === state.testWeightsVersionId, 'audit_log.after yeni versiyonu gösteriyor');
    if (before) {
        assert(auditRow?.before?.id === before.id, 'audit_log.before eski aktif versiyonu gösteriyor');
    }

    // ── NEGATİF SENARYOLAR ──
    section('15.1 AHP AĞIRLIKLARI NEGATİF SENARYOLARI');

    const notFoundActivate = await api('POST', '/admin/weights/00000000-0000-0000-0000-000000000000/activate', null, state.adminToken);
    assert(notFoundActivate.status === 404, `Var olmayan versiyonu aktifleştirme 404 döner (alınan: ${notFoundActivate.status})`);

    const nonAdminList = await api('GET', '/admin/weights', null, state.accessToken);
    assert(nonAdminList.status === 403, `Sıradan kullanıcı weights'e erişemez (403, alınan: ${nonAdminList.status})`);

    const unauthCreate = await api('POST', '/admin/weights', { material: 0.3, quality: 0.2, environmental: 0.2, logistics: 0.15, economic: 0.15 });
    assert(unauthCreate.status === 401, `Kimlik doğrulamasız oluşturma engellendi (401, alınan: ${unauthCreate.status})`);

    // ── API Anahtarları (Faz 3.6) ──
    section('16. API ANAHTARLARI (/v1/admin/api-keys) — Faz 3.6');

    const listKeysRes = await api('GET', '/admin/api-keys', null, state.adminToken);
    assert(listKeysRes.status === 200, `GET /v1/admin/api-keys 200 döner (alınan: ${listKeysRes.status})`);
    assert(Array.isArray(listKeysRes.data), 'api-keys data bir dizi');
    assert(listKeysRes.data.every((k) => !('keyHash' in k) && !('key_hash' in k)), 'Liste yanıtı hash\'i sızdırmıyor');

    const createKeyRes = await api('POST', '/admin/api-keys', { name: 'E2E Test Sensörü', userId: state.userId }, state.adminToken);
    assert(createKeyRes.status === 201, `POST /v1/admin/api-keys 201 döner (alınan: ${createKeyRes.status})`, createKeyRes);
    assert(typeof createKeyRes.key === 'string' && createKeyRes.key.length > 20, 'Yanıt ham anahtarı (bir kez) içeriyor');
    state.testApiKeyId = createKeyRes.apiKeyId;
    state.testApiKeyRaw = createKeyRes.key;

    const dbKey = await prisma.apiKey.findUnique({ where: { id: state.testApiKeyId } });
    assert(dbKey.keyHash !== state.testApiKeyRaw, 'DB\'de SADECE hash saklanıyor, ham anahtar değil (K-15 ile aynı kural)');
    assert(dbKey.revokedAt === null, 'Yeni anahtar başlangıçta iptal edilmemiş');

    const unknownUserKey = await api('POST', '/admin/api-keys', { name: 'x', userId: '00000000-0000-0000-0000-000000000000' }, state.adminToken);
    assert(unknownUserKey.status === 400, `Var olmayan userId 400 döner (alınan: ${unknownUserKey.status})`);

    const revokeRes = await api('DELETE', `/admin/api-keys/${state.testApiKeyId}`, null, state.adminToken);
    assert(revokeRes.status === 200, `DELETE /v1/admin/api-keys/:id 200 döner (alınan: ${revokeRes.status})`);
    const revokedDb = await prisma.apiKey.findUnique({ where: { id: state.testApiKeyId } });
    assert(revokedDb.revokedAt !== null, 'revoked_at set edildi');

    const revokeAgain = await api('DELETE', `/admin/api-keys/${state.testApiKeyId}`, null, state.adminToken);
    assert(revokeAgain.status === 200, 'Zaten iptal edilmiş anahtarı tekrar iptal etmek yine 200 döner (idempotent davranış)');

    const notFoundRevoke = await api('DELETE', '/admin/api-keys/00000000-0000-0000-0000-000000000000', null, state.adminToken);
    assert(notFoundRevoke.status === 404, `Var olmayan anahtarı iptal etme 404 döner (alınan: ${notFoundRevoke.status})`);

    section('16.1 API ANAHTARLARI NEGATİF SENARYOLARI');
    const nonAdminKeys = await api('GET', '/admin/api-keys', null, state.accessToken);
    assert(nonAdminKeys.status === 403, `Sıradan kullanıcı api-keys'e erişemez (403, alınan: ${nonAdminKeys.status})`);
};
