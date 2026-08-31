import { PrismaClient } from '@prisma/client';
import { fileURLToPath } from 'url';

// The test process is a separate `node test/index.js` invocation — it never goes through
// Nest's ConfigModule, so .env is not loaded automatically the way it is for the server.
// Without this, JWT_SECRET_KEY is undefined here and any self-signed test token (email
// verify, password reset, forged refresh) gets rejected by the real server with a
// confusing 400/401, OR — worse — silently passes if some stray fallback secret happens
// to match by coincidence. Load the same .env the server uses, deterministically.
try {
  process.loadEnvFile(new URL('../.env', import.meta.url));
} catch {
  // .env missing is fine if the shell already exported the vars (e.g. CI secrets)
}

// Sunucu her zaman process.cwd()=backend/ varsayımıyla diske yazıyor (uploads/, training/,
// bkz. cron.service.ts, facilities.service.ts, dpp.service.ts). Testin KENDİ process.cwd()'i
// ise `npm test` hangi dizinden tetiklendiğine bağlı olarak farklılaşabilir -- .env
// yüklemesinde yukarıda aynı sorun yaşandığı için import.meta.url'e sabitlendi, aynı
// yaklaşımı dosya sistemi kontrolleri yapan testler için de kullan (K-30).
export const BACKEND_DIR = fileURLToPath(new URL('..', import.meta.url));

if (!process.env.JWT_SECRET_KEY) {
  console.error('\x1b[31m✖ JWT_SECRET_KEY ayarlanmamış ve backend/.env yüklenemedi.\x1b[0m');
  console.error('  Kendi kendine imzalanan test belirteçleri (verify-email, reset-password) sunucuyla sessizce uyuşmazlık yaşar.');
  process.exit(1);
}

export const prisma = new PrismaClient();

export const BASE_URL = process.env.API_URL || 'http://localhost:3000/v1';

export const colors = {
    reset: '\x1b[0m',
    bright: '\x1b[1m',
    dim: '\x1b[2m',
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    magenta: '\x1b[35m',
    cyan: '\x1b[36m',
    white: '\x1b[37m',
    gray: '\x1b[90m',
};

// Unique suffix for this test run to prevent collision with persistent data
const RUN_ID = Date.now().toString().slice(-6);

export const TEST_DATA = {
    runId: RUN_ID,
    user: {
        name: `E2E Test Fabrikası ${RUN_ID}`,
        taxId: `99${RUN_ID.padStart(8, '0')}`,
        sector: 'textile',
        email: `e2e.test.${RUN_ID}@ecomatch-test.com`,
        password: 'Password123!',
        contactName: 'Ahmet Test',
        phone: '+90 555 123 45 67',
        location: { lat: 40.1955, lng: 29.0601 },
    },
    admin: {
        name: `E2E Platform Yönetimi ${RUN_ID}`,
        taxId: `88${RUN_ID.padStart(8, '0')}`,
        sector: 'administration',
        email: `e2e.admin.${RUN_ID}@ecomatch-test.com`,
        password: 'AdminPassword123!',
        contactName: 'EcoMatch Admin',
        phone: '+90 555 999 88 77',
        location: { lat: 41.0082, lng: 28.9784 },
    },
    osb: {
        name: `E2E Test OSB ${RUN_ID}`,
        city: 'Bursa',
    },
};

export const state = {
    accessToken: null,
    refreshTokenCookie: null,
    userId: null,
    facilityId: null,
    osbId: null,
    adminToken: null,
    adminRefreshTokenCookie: null,
    adminUserId: null,
    adminFacilityId: null,
    documentId: null,
    documentId2: null,
    emailVerifyToken: null,
    passwordResetToken: null,
    outputId: null,
    unclassifiedOutputId: null,
    passportId: null,
    passportSig: null,
    inputId: null,
    consumerToken: null,
    consumerFacilityId: null,
    expertUserId: null,
    expertFacilityId: null,
    expertToken: null,
    rateLimitFacilityId: null,
    // Faz 3
    chatRateLimitFacilityId: null,
    osbManagerUserId: null,
    osbManagerFacilityId: null,
    osbManagerToken: null,
    osbBuyerFacilityId: null,
    originalActiveWeightsId: null,
    testWeightsVersionId: null,
    testApiKeyId: null,
    testApiKeyRaw: null,
    iotFacilityId: null,
    iotOutputId: null,
    iotApiKeyId: null,
    iotApiKeyRaw: null,
};

export const stats = {
    passed: 0,
    failed: 0,
    total: 0,
    startTime: Date.now(),
};

export const section = (title) => {
    console.log(`\n${colors.cyan}${colors.bright}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${colors.reset}`);
    console.log(`${colors.cyan}${colors.bright}  ${title}${colors.reset}`);
    console.log(`${colors.cyan}${colors.bright}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${colors.reset}`);
};

export const assert = (condition, message, details = null) => {
    stats.total++;
    if (condition) {
        stats.passed++;
        console.log(`  ${colors.green}✔${colors.reset} ${message}`);
    } else {
        stats.failed++;
        console.error(`  ${colors.red}✖ ${message}${colors.reset}`);
        if (details) {
            console.error(`    ${colors.yellow}Ayrıntılar: ${typeof details === 'object' ? JSON.stringify(details) : details}${colors.reset}`);
        }
    }
};

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Extracts cookie string for sending in subsequent requests
 */
function extractCookieHeader(response) {
    if (typeof response.headers.getSetCookie === 'function') {
        const cookies = response.headers.getSetCookie();
        if (cookies && cookies.length > 0) {
            return cookies.map((c) => c.split(';')[0]).join('; ');
        }
    }
    const raw = response.headers.get('set-cookie');
    if (!raw) return null;
    return raw.split(';')[0];
}

/**
 * Universal API helper
 * @param {'GET'|'POST'|'PUT'|'PATCH'|'DELETE'} method
 * @param {string} path - URL or path (e.g. '/auth/login' or 'http://...')
 * @param {object|FormData|null} body
 * @param {string|null} token - Bearer access token
 * @param {object} options - extra headers or cookie override
 */
export const api = async (method, path, body = null, token = null, options = {}) => {
    let url = path;
    if (!path.startsWith('http://') && !path.startsWith('https://')) {
        const cleanPath = path.startsWith('/') ? path : `/${path}`;
        url = `${BASE_URL}${cleanPath}`;
    }

    const headers = { ...(options.headers || {}) };

    if (token) {
        headers['Authorization'] = `Bearer ${token}`;
    }

    if (options.cookie) {
        headers['Cookie'] = options.cookie;
    } else if (options.cookie !== false && state.refreshTokenCookie && (path.includes('/auth/refresh') || path.includes('/auth/logout'))) {
        // Convenience auto-fill for happy-path refresh/logout calls that don't care which
        // cookie goes out. Pass `{ cookie: false }` explicitly to opt out (e.g. to test the
        // "no cookie sent at all" case) -- omitting `options` entirely still auto-fills.
        headers['Cookie'] = state.refreshTokenCookie;
    }

    let fetchBody = null;
    if (body !== null && body !== undefined) {
        if (typeof FormData !== 'undefined' && body instanceof FormData) {
            fetchBody = body;
            // Let native fetch set boundary header
        } else if (typeof body === 'string') {
            headers['Content-Type'] = headers['Content-Type'] || 'application/json';
            fetchBody = body;
        } else {
            headers['Content-Type'] = headers['Content-Type'] || 'application/json';
            fetchBody = JSON.stringify(body);
        }
    }

    try {
        const res = await fetch(url, {
            method,
            headers,
            body: fetchBody,
        });

        const setCookieHeader = extractCookieHeader(res);

        let data = {};
        const contentType = res.headers.get('content-type') || '';
        if (contentType.includes('application/json')) {
            data = await res.json();
        } else {
            const text = await res.text();
            data = { rawText: text };
        }

        const result = {
            cookie: setCookieHeader,
            data,
            body: data,
            ...(Array.isArray(data) ? {} : (typeof data === 'object' && data !== null ? data : {})),
            bodyStatus: (typeof data === 'object' && data !== null && 'status' in data) ? data.status : undefined,
            status: res.status, // Always the HTTP status code
            httpStatus: res.status,
            ok: res.ok,
            headers: res.headers,
        };

        // Auto capture refresh token cookie if present in response
        if (setCookieHeader && setCookieHeader.includes('refresh_token=')) {
            result.refreshTokenCookie = setCookieHeader;
        }

        return result;
    } catch (error) {
        return {
            status: 0,
            ok: false,
            error: 'NETWORK_ERROR',
            message: error.message,
        };
    }
};

export const printSummary = () => {
    const duration = ((Date.now() - stats.startTime) / 1000).toFixed(2);
    const passRate = stats.total > 0 ? ((stats.passed / stats.total) * 100).toFixed(1) : 0;

    console.log(`\n${colors.bright}╔══════════════════════════════════════════════════╗${colors.reset}`);
    console.log(`${colors.bright}║               E2E TEST ÖZETİ                     ║${colors.reset}`);
    console.log(`${colors.bright}╠══════════════════════════════════════════════════╣${colors.reset}`);
    console.log(`║  Toplam Doğrulama : ${stats.total.toString().padEnd(29)}║`);
    console.log(`║  ${colors.green}Başarılı${colors.reset}${colors.bright}         : ${stats.passed.toString().padEnd(29)}║`);
    console.log(`║  ${stats.failed > 0 ? colors.red : colors.gray}Başarısız${colors.reset}${colors.bright}        : ${stats.failed.toString().padEnd(29)}║`);
    console.log(`║  Başarı Oranı     : ${(passRate + '%').padEnd(29)}║`);
    console.log(`║  Geçen Süre       : ${(duration + 's').padEnd(29)}║`);
    console.log(`${colors.bright}╚══════════════════════════════════════════════════╝${colors.reset}`);

    if (stats.failed === 0) {
        console.log(`\n${colors.green}${colors.bright}✔ TÜM TESTLER BAŞARIYLA GEÇTİ!${colors.reset}\n`);
    } else {
        console.log(`\n${colors.red}${colors.bright}✖ BAZI TESTLER BAŞARISIZ OLDU (${stats.failed} hata).${colors.reset}\n`);
    }
};
