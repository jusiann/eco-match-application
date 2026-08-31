// ═══════════════════════════════════════════════════════════════
//  Temizlik ve Sıfırlama Modülü Testleri — Hesap Silme, Dosya
//  ve Veritabanı Temizliği
// ═══════════════════════════════════════════════════════════════

import { state, assert, api, section, prisma, TEST_DATA, BACKEND_DIR } from './helpers.js';
import * as fs from 'fs';
import * as path from 'path';

export const testCleanup = async () => {
    section('7. TEMİZLİK VE SIFIRLAMA (CLEANUP & TEARDOWN)');

    // ── DELETE /v1/auth/delete-account ──
    if (state.accessToken) {
        const deleteRes = await api('DELETE', '/auth/delete-account', null, state.accessToken);
        assert(deleteRes.status === 200, `DELETE /v1/auth/delete-account 200 OK döndü (alınan: ${deleteRes.status})`, deleteRes);
        assert(deleteRes.success === true, 'Hesap silme işlemi success: true bildirdi');

        // Veritabanından kademeli silindiğini doğrula
        const deletedUser = await prisma.user.findUnique({ where: { email: TEST_DATA.user.email.toLowerCase() } });
        assert(deletedUser === null, 'Test kullanıcısı veritabanından silindi (kademeli silme / cascade)');

        const deletedFac = await prisma.facility.findUnique({ where: { taxId: TEST_DATA.user.taxId } });
        assert(deletedFac === null, 'Test tesisi veritabanından silindi');
    }

    // ── Yönetici test kayıtlarını temizle ──
    if (state.adminFacilityId) {
        try {
            await prisma.facility.delete({ where: { id: state.adminFacilityId } }).catch(() => {});
            console.log('  [Temizlik] Yönetici test tesisi silindi');
        } catch {}
    }

    // ── Tüketici test kayıtlarını temizle ──
    if (state.consumerFacilityId) {
        try {
            await prisma.facility.delete({ where: { id: state.consumerFacilityId } }).catch(() => {});
            console.log('  [Temizlik] Tüketici test tesisi silindi');
        } catch {}
    }

    // ── Uzman (expert) test kayıtlarını temizle ──
    if (state.expertFacilityId) {
        try {
            await prisma.facility.delete({ where: { id: state.expertFacilityId } }).catch(() => {});
            console.log('  [Temizlik] Uzman test tesisi silindi');
        } catch {}
    }

    // ── Rate limit test kayıtlarını temizle ──
    if (state.rateLimitFacilityId) {
        try {
            await prisma.facility.delete({ where: { id: state.rateLimitFacilityId } }).catch(() => {});
            console.log('  [Temizlik] Rate limit test tesisi silindi');
        } catch {}
    }

    // ── Faz 3 test tesislerini temizle (facility cascade: users/outputs/inputs/matches/
    // sensor_data/api_keys/messages/notifications hepsi peşinden gidiyor) ──
    for (const [label, id] of [
        ['Chat rate limit', state.chatRateLimitFacilityId],
        ['OSB yöneticisi', state.osbManagerFacilityId],
        ['OSB alıcı', state.osbBuyerFacilityId],
        ['IoT', state.iotFacilityId],
    ]) {
        if (!id) continue;
        try {
            await prisma.facility.delete({ where: { id } }).catch(() => {});
            console.log(`  [Temizlik] ${label} test tesisi silindi`);
        } catch {}
    }

    // ── Test AHP ağırlık versiyonunu temizle, orijinal aktif versiyonu geri aç ──
    if (state.testWeightsVersionId) {
        try {
            await prisma.weightsConfig.delete({ where: { id: state.testWeightsVersionId } }).catch(() => {});
            if (state.originalActiveWeightsId) {
                await prisma.weightsConfig.update({ where: { id: state.originalActiveWeightsId }, data: { active: true } });
            }
            console.log('  [Temizlik] Test AHP ağırlık versiyonu silindi, orijinal aktif versiyon geri açıldı');
        } catch {}
    }

    // ── Test carbon_factors satırlarını temizle ve kapattıkları gerçek satırları geri aç ──
    // admin-extra.test.js "eskinin valid_to'sunu kapatır" davranışını test ederken GERÇEK
    // seed satırını (Ecoinvent v3.10) kapatıyor -- silmek yetmez, hangi satırın şimdi aktif
    // olması gerektiğini yeniden hesaplayıp açmak lazım, yoksa canlı CBAM hesapları bozulur.
    try {
        await prisma.carbonFactor.deleteMany({ where: { source: { contains: 'E2E Test' } } });

        const pairs = await prisma.carbonFactor.groupBy({ by: ['materialClass', 'factorType'] });
        for (const pair of pairs) {
            const activeCount = await prisma.carbonFactor.count({
                where: { materialClass: pair.materialClass, factorType: pair.factorType, validTo: null },
            });
            if (activeCount === 0) {
                const mostRecent = await prisma.carbonFactor.findFirst({
                    where: { materialClass: pair.materialClass, factorType: pair.factorType },
                    orderBy: { validFrom: 'desc' },
                });
                if (mostRecent) {
                    await prisma.carbonFactor.update({ where: { id: mostRecent.id }, data: { validTo: null } });
                }
            }
        }
        console.log('  [Temizlik] Test carbon_factor satırları temizlendi, kapatılan gerçek satırlar geri açıldı');
    } catch {}

    // ── Bu test çalıştırması tarafından oluşturulan test OSB'sini temizle ──
    try {
        const testOsb = await prisma.osb.findFirst({ where: { name: TEST_DATA.osb.name } });
        if (testOsb) {
            await prisma.osb.delete({ where: { id: testOsb.id } }).catch(() => {});
            console.log('  [Temizlik] Test OSB kaydı silindi');
        }
    } catch {}

    // ── Yetim (orphan) embedding satırlarını temizle ──
    // embeddings polimorfik FK'sız (K-04/K-25): output/input hesap silme cascade'iyle
    // gittiğinde embedding satırı DB seviyesinde OTOMATİK silinmiyor, uygulama da bu
    // cascade yolunu bilmiyor (sadece doğrudan DELETE /outputs|inputs/:id temizliyor).
    // Test ortamında bu yüzden elle süpürüyoruz.
    try {
        const orphaned = await prisma.$executeRaw`
            DELETE FROM embeddings e
             WHERE (e.record_type = 'output' AND NOT EXISTS (SELECT 1 FROM outputs o WHERE o.id = e.record_id))
                OR (e.record_type = 'input'  AND NOT EXISTS (SELECT 1 FROM inputs i WHERE i.id = e.record_id))
        `;
        console.log(`  [Temizlik] ${orphaned} yetim embedding satırı temizlendi (K-25)`);
    } catch {}

    // ── Diske yazılan geçici test dosyalarını temizle (yüklenen belgeler + AI export'u) ──
    // process.cwd() DEĞİL BACKEND_DIR: sunucu her zaman backend/ kökünden yazıyor, bu
    // testin kendi process.cwd()'i npm'in nereden tetiklendiğine göre kayabilir (K-30).
    for (const dir of ['uploads/facility-documents', 'uploads/dpp-pdfs', 'training', 'training/feedback']) {
        const fullDir = path.join(BACKEND_DIR, dir);
        if (!fs.existsSync(fullDir)) continue;
        try {
            const files = await fs.promises.readdir(fullDir);
            for (const file of files) {
                const filePath = path.join(fullDir, file);
                const stat = await fs.promises.stat(filePath);
                if (stat.isFile() && Date.now() - stat.mtimeMs < 10 * 60 * 1000) {
                    await fs.promises.unlink(filePath).catch(() => {});
                }
            }
            console.log(`  [Temizlik] ${dir}/ dizinindeki geçici test dosyaları temizlendi`);
        } catch {}
    }

    // ── Prisma Bağlantısını Kapat ──
    await prisma.$disconnect();
    console.log('  [Temizlik] Veritabanı bağlantısı başarıyla kapatıldı\n');
};

