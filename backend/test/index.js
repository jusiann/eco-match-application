#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════
//  EcoMatch — E2E Test Çalıştırıcı (Test Runner)
//  Kullanım: node test/index.js (veya node backend/test)
//  Gereksinim: API Sunucusu & PostgreSQL çalışıyor olmalıdır (npm run dev)
// ═══════════════════════════════════════════════════════════════

import { BASE_URL, TEST_DATA, colors, api, printSummary, stats } from './helpers.js';
import { testOsbs } from './osbs.test.js';
import { testAuth } from './auth.test.js';
import { testFacilities } from './facilities.test.js';
import { testAdmin } from './admin.test.js';
import { testMaterials } from './materials.test.js';
import { testAi } from './ai.test.js';
import { testMatches } from './matches.test.js';
import { testFind } from './find.test.js';
import { testReviewQueue } from './review-queue.test.js';
import { testNotifications } from './notifications.test.js';
import { testReports } from './reports.test.js';
import { testAdminExtra } from './admin-extra.test.js';
import { testCleanup } from './cleanup.test.js';

const run = async () => {
    console.log(`\n${colors.cyan}${colors.bright}╔══════════════════════════════════════════════════╗${colors.reset}`);
    console.log(`${colors.cyan}${colors.bright}║          EcoMatch — E2E Test Paketi              ║${colors.reset}`);
    console.log(`${colors.cyan}${colors.bright}╚══════════════════════════════════════════════════╝${colors.reset}`);
    console.log(`${colors.dim}  Hedef API       : ${BASE_URL}`);
    console.log(`  Test Temsilcisi : ${TEST_DATA.user.email}`);
    console.log(`  Yönetici        : ${TEST_DATA.admin.email}`);
    console.log(`  Zaman Damgası   : ${new Date().toLocaleString('tr-TR')}${colors.reset}\n`);

    // ── API Erişilebilirlik Kontrolü ──
    try {
        const ping = await api('GET', '/osbs');
        if (ping.status !== 200) {
            console.error(`${colors.red}✖ API sunucusu şu durum koduyla yanıt verdi: ${ping.status}${colors.reset}`);
            console.error(`${colors.yellow}  Backend'in çalıştığından emin olun: cd backend && npm run dev${colors.reset}`);
            process.exit(1);
        }
        console.log(`${colors.green}✔${colors.reset} ${colors.dim}API sunucu bağlantısı doğrulandı (/v1/osbs)${colors.reset}\n`);
    } catch (error) {
        console.error(`${colors.red}✖ ${BASE_URL} adresindeki API sunucusuna bağlanılamadı:${colors.reset}`, error.message);
        console.error(`${colors.yellow}  Backend'in çalıştığından emin olun: cd backend && npm run dev${colors.reset}`);
        process.exit(1);
    }

    // ── Tüm test modüllerini sırayla çalıştır ──
    try {
        await testOsbs();
        await testAuth();
        await testFacilities();
        await testAdmin();
        await testMaterials();
        await testAi();
        await testMatches();
        await testFind();
        await testReviewQueue();
        await testNotifications();
        await testReports();
        await testAdminExtra();
    } catch (error) {
        console.error(`\n${colors.red}${colors.bright}✖ Kritik Test Hatası:${colors.reset}`, error.message);
        console.error(error.stack);
    } finally {
        await testCleanup();
    }

    printSummary();
    process.exit(stats.failed > 0 ? 1 : 0);
};

run();

