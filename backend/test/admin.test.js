// ═══════════════════════════════════════════════════════════════
//  Yönetici (Admin) Modülü Testleri — RBAC Erişim Kontrolü,
//  Bekleyen Doğrulama Kuyruğu, Belge Reddetme, Belge Onaylama
//  ve Tesis Doğrulaması
// ═══════════════════════════════════════════════════════════════

import { TEST_DATA, state, assert, api, section, prisma } from './helpers.js';

export const testAdmin = async () => {
    section('4. YÖNETİCİ (ADMIN) MODÜLÜ (/v1/admin/*) VE RBAC');

    // ── RBAC Kontrolleri: Yönetici olmayan kullanıcılar 403 Forbidden almalıdır ──
    const unauthorizedList = await api('GET', '/admin/verifications', null, state.accessToken);
    assert(unauthorizedList.status === 403, 'Tesis kullanıcısının /v1/admin/verifications erişimi engellendi (403 Forbidden)', unauthorizedList);
    assert(unauthorizedList.error === 'INSUFFICIENT_ROLE', 'Hata kodu INSUFFICIENT_ROLE');

    const unauthorizedApprove = await api('POST', `/admin/verifications/${state.documentId}/approve`, null, state.accessToken);
    assert(unauthorizedApprove.status === 403, 'Tesis kullanıcısının onaylama (approve) uç noktasına erişimi engellendi (403 Forbidden)');

    const unauthorizedReject = await api('POST', `/admin/verifications/${state.documentId}/reject`, { reason: 'Test' }, state.accessToken);
    assert(unauthorizedReject.status === 403, 'Tesis kullanıcısının reddetme (reject) uç noktasına erişimi engellendi (403 Forbidden)');

    // ── Yönetici Hesabı Oluşturma & Giriş ──
    const adminRegister = await api('POST', '/auth/register', {
        name: TEST_DATA.admin.name,
        taxId: TEST_DATA.admin.taxId,
        sector: TEST_DATA.admin.sector,
        email: TEST_DATA.admin.email,
        password: TEST_DATA.admin.password,
        contactName: TEST_DATA.admin.contactName,
        phone: TEST_DATA.admin.phone,
        location: TEST_DATA.admin.location,
    });
    assert(adminRegister.status === 201 || adminRegister.status === 200, 'Yönetici kaydı 201/200 döndürdü');

    state.adminUserId = adminRegister.user?.id;
    state.adminFacilityId = adminRegister.facility?.id;

    // Kullanıcıyı veritabanında ADMIN rolüne yükselt
    await prisma.user.update({
        where: { id: state.adminUserId },
        data: { role: 'ADMIN' },
    });

    // ADMIN rolü içeren JWT almak için yönetici bilgileriyle giriş yap
    const adminLogin = await api('POST', '/auth/login', {
        email: TEST_DATA.admin.email,
        password: TEST_DATA.admin.password,
    });
    assert(adminLogin.status === 200 || adminLogin.status === 201, `Yönetici girişi 200/201 döndürdü (alınan: ${adminLogin.status})`);
    assert(adminLogin.user?.role === 'ADMIN', 'Yönetici JWT belirteci ADMIN rolünü içeriyor');

    state.adminToken = adminLogin.access_token;
    state.adminRefreshTokenCookie = adminLogin.refreshTokenCookie;

    // ── GET /v1/admin/verifications (Bekleyen Kuyruk) ──
    const pendingList = await api('GET', '/admin/verifications', null, state.adminToken);
    assert(pendingList.status === 200, `GET /v1/admin/verifications 200 OK döndü (alınan: ${pendingList.status})`, pendingList);
    assert(Array.isArray(pendingList.data), 'Bekleyen doğrulamalar bir dizidir');

    const verifications = pendingList.data || [];
    const doc1 = verifications.find((v) => v.id === state.documentId);
    const doc2 = verifications.find((v) => v.id === state.documentId2);

    assert(!!doc1, 'Yüklenen vergi levhası yönetici onay kuyruğunda bulundu');
    assert(!!doc2, 'Yüklenen faaliyet belgesi yönetici onay kuyruğunda bulundu');
    assert(doc1?.facility?.taxId === TEST_DATA.user.taxId, 'Bekleyen doğrulama ilişkili tesis ayrıntılarını içeriyor');

    // ── POST /v1/admin/verifications/:id/reject ──
    const rejectReason = 'Belge okunaklı değil, lütfen geçerli bir PDF yükleyin.';
    const rejectRes = await api('POST', `/admin/verifications/${state.documentId}/reject`, {
        reason: rejectReason,
    }, state.adminToken);

    assert(rejectRes.status === 200 || rejectRes.status === 201, `Belge reddi 200 OK döndürdü (alınan: ${rejectRes.status})`, rejectRes);
    assert(rejectRes.success === true, 'Reddetme işlemi success: true bildirdi');

    const dbDoc1 = await prisma.facilityVerification.findUnique({ where: { id: state.documentId } });
    assert(dbDoc1?.status === 'REJECTED', 'Belge durumu DB\'de REJECTED olarak güncellendi');
    assert(dbDoc1?.rejectionReason === rejectReason, 'Reddetme gerekçesi DB\'ye kaydedildi');

    // ── POST /v1/admin/verifications/:id/approve ──
    const approveRes = await api('POST', `/admin/verifications/${state.documentId2}/approve`, null, state.adminToken);
    assert(approveRes.status === 200 || approveRes.status === 201, `Belge onayı 200 OK döndürdü (alınan: ${approveRes.status})`, approveRes);
    assert(approveRes.success === true, 'Onaylama işlemi success: true bildirdi');

    const dbDoc2 = await prisma.facilityVerification.findUnique({ where: { id: state.documentId2 } });
    assert(dbDoc2?.status === 'APPROVED', 'Belge durumu DB\'de APPROVED olarak güncellendi');

    // ── S1 Akış Doğrulaması: facility.verified true olmalıdır ──
    const dbFacility = await prisma.facility.findUnique({ where: { id: state.facilityId } });
    assert(dbFacility?.verified === true, 'Tesis doğrulama durumu DB\'de TRUE olarak güncellendi');

    const facilityMe = await api('GET', '/facilities/me', null, state.accessToken);
    assert(facilityMe.facility?.verified === true, 'Onaylanan tesis için GET /v1/facilities/me verified: true döndürdü');

    // ── NEGATİF SENARYOLAR ──
    section('4.1 YÖNETİCİ NEGATİF SENARYOLARI');

    // 1. Mevcut olmayan doğrulama ID'sini onaylama
    const fakeApprove = await api('POST', '/admin/verifications/00000000-0000-0000-0000-000000000000/approve', null, state.adminToken);
    assert(fakeApprove.status === 404, 'Mevcut olmayan belgeyi onaylama 404 Not Found döndürdü');

    // 2. Mevcut olmayan doğrulama ID'sini reddetme
    const fakeReject = await api('POST', '/admin/verifications/00000000-0000-0000-0000-000000000000/reject', { reason: 'Test' }, state.adminToken);
    assert(fakeReject.status === 404, 'Mevcut olmayan belgeyi reddetme 404 Not Found döndürdü');

    // 3. Gerekçesiz reddetme
    const noReasonReject = await api('POST', `/admin/verifications/${state.documentId2}/reject`, {}, state.adminToken);
    assert(noReasonReject.status === 400, 'Gerekçesiz reddetme 400 Doğrulama Hatası döndürdü');
};
