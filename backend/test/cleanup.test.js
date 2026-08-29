// ═══════════════════════════════════════════════════════════════
//  Temizlik ve Sıfırlama Modülü Testleri — Hesap Silme, Dosya
//  ve Veritabanı Temizliği
// ═══════════════════════════════════════════════════════════════

import { state, assert, api, section, prisma, TEST_DATA } from './helpers.js';
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

    // ── Bu test çalıştırması tarafından oluşturulan test OSB'sini temizle ──
    try {
        const testOsb = await prisma.osb.findFirst({ where: { name: TEST_DATA.osb.name } });
        if (testOsb) {
            await prisma.osb.delete({ where: { id: testOsb.id } }).catch(() => {});
            console.log('  [Temizlik] Test OSB kaydı silindi');
        }
    } catch {}

    // ── Diske yüklenen geçici test dosyalarını temizle ──
    for (const subdir of ['facility-documents', 'dpp-pdfs']) {
        const uploadDir = path.join(process.cwd(), 'uploads', subdir);
        if (!fs.existsSync(uploadDir)) continue;
        try {
            const files = await fs.promises.readdir(uploadDir);
            for (const file of files) {
                const filePath = path.join(uploadDir, file);
                const stat = await fs.promises.stat(filePath);
                if (Date.now() - stat.mtimeMs < 10 * 60 * 1000) {
                    await fs.promises.unlink(filePath).catch(() => {});
                }
            }
            console.log(`  [Temizlik] uploads/${subdir}/ dizinindeki geçici test dosyaları temizlendi`);
        } catch {}
    }

    // ── Prisma Bağlantısını Kapat ──
    await prisma.$disconnect();
    console.log('  [Temizlik] Veritabanı bağlantısı başarıyla kapatıldı\n');
};

