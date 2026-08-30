// ═══════════════════════════════════════════════════════════════
//  HITL / İnceleme Kuyruğu Testleri — human_review_queue, uzman
//  endpoint'leri, onay/red, 72 saatlik SLA fallback (A2)
// ═══════════════════════════════════════════════════════════════

import { randomUUID } from 'crypto';
import { TEST_DATA, state, assert, api, section, prisma } from './helpers.js';

export const testReviewQueue = async () => {
    section('9. İNCELEME KUYRUĞU (HITL) MODÜLÜ (/v1/admin/review-queue/*)');

    // ── Kurulum: uzman (expert) rolünde ayrı bir test kullanıcısı ──
    const expertEmail = `expert-${TEST_DATA.runId}@ecomatch-test.com`;
    const expertRegister = await api('POST', '/auth/register', {
        name: `E2E Expert Facility ${TEST_DATA.runId}`,
        taxId: `96${TEST_DATA.runId.padStart(8, '0')}`,
        sector: 'consulting',
        email: expertEmail,
        password: 'Password123!',
        contactName: 'Uzman Kişi',
        phone: '+90 555 111 22 33',
        location: { lat: 41.01, lng: 28.98 },
    });
    assert(expertRegister.status === 201, 'Uzman test tesisi kaydı 201 döndürdü');
    state.expertUserId = expertRegister.user?.id;
    state.expertFacilityId = expertRegister.facility?.id;
    await prisma.user.update({ where: { id: state.expertUserId }, data: { role: 'EXPERT' } });
    const expertLogin = await api('POST', '/auth/login', { email: expertEmail, password: 'Password123!' });
    state.expertToken = expertLogin.access_token;

    // ── Sınıflandırılmamış çıktı -> human_review_queue satırı + uzman bildirimi ──
    const unclassified1 = await api('POST', '/materials/outputs', {
        description: 'Boya artığı, karışık, sınıfı belirsiz',
        quantityKg: 300,
    }, state.accessToken);
    assert(unclassified1.status === 201, 'Sınıflandırılmamış çıktı 201 ile oluşturuldu');
    assert(unclassified1.pendingReview === true, 'pendingReview true');

    const queueRow1 = await prisma.humanReviewQueue.findFirst({ where: { outputId: unclassified1.outputId } });
    assert(!!queueRow1, 'human_review_queue satırı otomatik açıldı (A2)');
    assert(queueRow1.status === 'PENDING', 'İnceleme kaydı PENDING durumunda');
    assert(queueRow1.confidence !== null, 'confidence (dummy AI\'ın tahmini) dolduruldu');
    assert(Array.isArray(queueRow1.aiSuggestion) && queueRow1.aiSuggestion.length === 3, 'ai_suggestion (top3) dolduruldu');

    const expertNotifs = await api('GET', '/notifications?unread=true', null, state.expertToken);
    assert(
        (expertNotifs.data || []).some((n) => n.type === 'review_required' && n.payload?.output_id === unclassified1.outputId),
        'Uzman kullanıcıya review_required bildirimi gitti',
    );

    // ── RBAC: sıradan tesis kullanıcısı review-queue'ya erişemez ──
    const forbiddenList = await api('GET', '/admin/review-queue', null, state.accessToken);
    assert(forbiddenList.status === 403, `Sıradan kullanıcı review-queue'dan 403 alır (alınan: ${forbiddenList.status})`);

    // ── GET /v1/admin/review-queue (uzman olarak) ──
    const listRes = await api('GET', '/admin/review-queue', null, state.expertToken);
    assert(listRes.status === 200, `Uzman review-queue listesini görebilir (alınan: ${listRes.status})`, listRes);
    const found1 = (listRes.data || []).find((r) => r.id === queueRow1.id);
    assert(!!found1, 'Yeni açılan inceleme kaydı listede görünüyor');
    assert(!!found1.output?.facility, 'Liste kaydı ilişkili tesis bilgisini içeriyor');

    // ── GET /v1/admin/review-queue/:id (detay + önceki 5 kayıt) ──
    const detailRes = await api('GET', `/admin/review-queue/${queueRow1.id}`, null, state.expertToken);
    assert(detailRes.status === 200, `İnceleme detayı 200 döner (alınan: ${detailRes.status})`, detailRes);
    assert(Array.isArray(detailRes.previousRecords), 'previousRecords bir dizi (docs/06 A2 adım 6: önceki 5 kayıt)');

    // ── POST reject ──
    const rejectRes = await api('POST', `/admin/review-queue/${queueRow1.id}/reject`, { notes: 'Açıklama çok belirsiz, tekrar girilmeli.' }, state.expertToken);
    assert(rejectRes.status === 201, `Reject 201 döner (alınan: ${rejectRes.status})`, rejectRes);

    const dbQueue1 = await prisma.humanReviewQueue.findUnique({ where: { id: queueRow1.id } });
    assert(dbQueue1.status === 'REJECTED', 'İnceleme kaydı REJECTED oldu');
    assert(dbQueue1.reviewedBy === state.expertUserId, 'reviewed_by uzmanın id\'si');

    const dbOutput1AfterReject = await prisma.output.findUnique({ where: { id: unclassified1.outputId } });
    assert(dbOutput1AfterReject.pendingReview === true, 'Reddedilen çıktı pendingReview=true olarak KALIR (materialClass hâlâ atanmadı)');

    const ownerNotifsAfterReject = await api('GET', '/notifications', null, state.accessToken);
    assert(
        (ownerNotifsAfterReject.data || []).some((n) => n.type === 'classification_rejected'),
        'Tesis sahibine classification_rejected bildirimi gitti',
    );

    // Zaten sonuçlanmış bir kaydı tekrar reddetmek 409 döner
    const rejectAgain = await api('POST', `/admin/review-queue/${queueRow1.id}/reject`, { notes: 'tekrar' }, state.expertToken);
    assert(rejectAgain.status === 409, `Sonuçlanmış kaydı tekrar reddetmek 409 döner (alınan: ${rejectAgain.status})`);

    // ── İkinci sınıflandırılmamış çıktı -> onay akışı ──
    const unclassified2 = await api('POST', '/materials/outputs', {
        description: 'Metal talaşı, karışık alaşım',
        quantityKg: 150,
    }, state.accessToken);
    const queueRow2 = await prisma.humanReviewQueue.findFirst({ where: { outputId: unclassified2.outputId } });
    assert(!!queueRow2, 'İkinci çıktı için de inceleme kaydı açıldı');

    const approveRes = await api('POST', `/admin/review-queue/${queueRow2.id}/approve`, {
        materialClass: 'metal',
        notes: 'Metal talaşı olduğu netleşti.',
    }, state.expertToken);
    assert(approveRes.status === 201, `Approve 201 döner (alınan: ${approveRes.status})`, approveRes);

    const dbOutput2AfterApprove = await prisma.output.findUnique({ where: { id: unclassified2.outputId } });
    assert(dbOutput2AfterApprove.materialClass === 'METAL', 'materialClass onaylanan değere set edildi');
    assert(dbOutput2AfterApprove.pendingReview === false, 'pendingReview false oldu');
    assert(dbOutput2AfterApprove.embeddingPending === false, 'Onay sonrası embedding senkron üretildi (embeddingPending false)');

    const embedding2 = await prisma.embedding.findFirst({ where: { recordId: unclassified2.outputId, recordType: 'OUTPUT' } });
    assert(!!embedding2, 'Onaylanan çıktı için embeddings satırı gerçekten oluştu');

    const ownerNotifsAfterApprove = await api('GET', '/notifications?unread=true', null, state.accessToken);
    assert(
        (ownerNotifsAfterApprove.data || []).some((n) => n.type === 'classification_approved'),
        'Tesis sahibine classification_approved bildirimi gitti',
    );

    // ── NEGATİF SENARYOLAR ──
    section('9.1 İNCELEME KUYRUĞU NEGATİF SENARYOLARI');

    const missingCategoryReject = await api('POST', `/admin/review-queue/${randomUUID()}/reject`, {}, state.expertToken);
    assert(missingCategoryReject.status === 400, `notes eksikse 400 döner (alınan: ${missingCategoryReject.status})`);

    const invalidClassApprove = await api('POST', `/admin/review-queue/${randomUUID()}/approve`, { materialClass: 'unobtanium' }, state.expertToken);
    assert(invalidClassApprove.status === 400, `Geçersiz materialClass 400 döner (alınan: ${invalidClassApprove.status})`);

    const notFoundApprove = await api('POST', `/admin/review-queue/${randomUUID()}/approve`, { materialClass: 'metal' }, state.expertToken);
    assert(notFoundApprove.status === 404, `Mevcut olmayan inceleme kaydı 404 döner (alınan: ${notFoundApprove.status})`);

    const unauthList = await api('GET', '/admin/review-queue');
    assert(unauthList.status === 401, 'Kimlik doğrulamasız erişim engellendi (401)');

    // ── 72 saatlik SLA fallback (A2) — cron'u elle tetikleyerek test ediyoruz ──
    section('9.2 SLA FALLBACK (72 SAAT)');

    const unclassified3 = await api('POST', '/materials/outputs', {
        description: 'SLA testi için sınıfsız çıktı',
        quantityKg: 80,
    }, state.accessToken);
    const queueRow3 = await prisma.humanReviewQueue.findFirst({ where: { outputId: unclassified3.outputId } });
    assert(!!queueRow3, 'Üçüncü çıktı için inceleme kaydı açıldı');

    // 72 saati geride bırakmış gibi işaretle (gerçekte 73 saat önce açılmış varsayımı)
    await prisma.humanReviewQueue.update({
        where: { id: queueRow3.id },
        data: { createdAt: new Date(Date.now() - 73 * 60 * 60 * 1000) },
    });

    const cronRes = await api('POST', '/admin/cron/hitl-sla-fallback', null, state.adminToken);
    assert(cronRes.status === 201, `SLA fallback cron tetikleme 201 döner (alınan: ${cronRes.status})`, cronRes);
    assert(cronRes.count >= 1, `En az 1 kayıt SLA fallback ile işlendi (alınan: ${cronRes.count})`);

    const dbQueue3 = await prisma.humanReviewQueue.findUnique({ where: { id: queueRow3.id } });
    assert(dbQueue3.status === 'APPROVED', 'SLA süresi dolan kayıt otomatik APPROVED oldu');

    const dbOutput3 = await prisma.output.findUnique({ where: { id: unclassified3.outputId } });
    assert(dbOutput3.pendingReview === false, 'SLA fallback sonrası pendingReview false oldu');
    assert(dbOutput3.materialClass === queueRow3.aiSuggestion[0][0].toUpperCase(), 'materialClass, AI\'ın ilk tahminiyle (top3[0]) eşleşiyor');

    const cronNoAccess = await api('POST', '/admin/cron/hitl-sla-fallback', null, state.accessToken);
    assert(cronNoAccess.status === 403, `Sıradan kullanıcı cron tetikleyemez (403, alınan: ${cronNoAccess.status})`);

    const cronUnknownJob = await api('POST', '/admin/cron/not-a-real-job', null, state.adminToken);
    assert(cronUnknownJob.status === 400, `Bilinmeyen cron job adı 400 döner (alınan: ${cronUnknownJob.status})`);
};
