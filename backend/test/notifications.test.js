// ═══════════════════════════════════════════════════════════════
//  Bildirimler (Notifications) Modülü Testleri — Liste, Okundu
//  İşaretleme, Tercihler, WebSocket Gerçek Zamanlı Teslimat (Faz 2.4/2.5)
// ═══════════════════════════════════════════════════════════════

import { io } from 'socket.io-client';
import { BASE_URL, state, assert, api, section, prisma } from './helpers.js';

const ORIGIN = BASE_URL.replace(/\/v1$/, '');

export const testNotifications = async () => {
    section('10. BİLDİRİMLER (NOTIFICATIONS) MODÜLÜ (/v1/notifications/*)');

    // review-queue.test.js zaten state.accessToken kullanıcısına en az bir
    // classification_approved/rejected bildirimi göndermişti -- onun üzerine kuruyoruz.
    const listRes = await api('GET', '/notifications', null, state.accessToken);
    assert(listRes.status === 200, `GET /v1/notifications 200 döner (alınan: ${listRes.status})`, listRes);
    assert(Array.isArray(listRes.data), 'data bir dizi');
    assert(listRes.data.length > 0, 'En az bir bildirim mevcut (review-queue akışından)');
    assert(listRes.meta?.page === 1, 'Sayfalama meta bilgisi mevcut');

    const unreadOnlyRes = await api('GET', '/notifications?unread=true', null, state.accessToken);
    assert(unreadOnlyRes.status === 200, `?unread=true filtresi çalışıyor (alınan: ${unreadOnlyRes.status})`);
    assert((unreadOnlyRes.data || []).every((n) => n.readAt === null), 'Filtrelenen tüm bildirimler gerçekten okunmamış');

    const countBefore = await api('GET', '/notifications/unread-count', null, state.accessToken);
    assert(typeof countBefore.count === 'number' && countBefore.count > 0, `unread-count pozitif bir sayı (alınan: ${countBefore.count})`);

    // ── PATCH /v1/notifications/:id/read ──
    const firstUnread = unreadOnlyRes.data[0];
    const markReadRes = await api('PATCH', `/notifications/${firstUnread.id}/read`, null, state.accessToken);
    assert(markReadRes.status === 200, `Tek bildirim okundu işaretleme 200 döner (alınan: ${markReadRes.status})`);

    const countAfterOne = await api('GET', '/notifications/unread-count', null, state.accessToken);
    assert(countAfterOne.count === countBefore.count - 1, 'unread-count tam olarak 1 azaldı');

    // Zaten okunmuş bir bildirimi tekrar okundu işaretlemek hata vermemeli (idempotent davranış)
    const markReadAgain = await api('PATCH', `/notifications/${firstUnread.id}/read`, null, state.accessToken);
    assert(markReadAgain.status === 200, 'Zaten okunmuş bildirimi tekrar işaretlemek yine 200 döner');

    // ── PATCH /v1/notifications/read-all ──
    const markAllRes = await api('PATCH', '/notifications/read-all', null, state.accessToken);
    assert(markAllRes.status === 200, `Tümünü okundu işaretleme 200 döner (alınan: ${markAllRes.status})`);
    const countAfterAll = await api('GET', '/notifications/unread-count', null, state.accessToken);
    assert(countAfterAll.count === 0, 'Tümünü okundu sonrası unread-count sıfır');

    // ── Tercihler (Prefs) ──
    section('10.1 BİLDİRİM TERCİHLERİ (PREFS)');

    const emptyPrefsRes = await api('GET', '/notifications/prefs', null, state.accessToken);
    assert(emptyPrefsRes.status === 200, `Varsayılan (boş) tercihler 200 döner (alınan: ${emptyPrefsRes.status})`);

    const updatePrefsRes = await api('PATCH', '/notifications/prefs', {
        match_rejected: { inApp: true, email: false, push: false },
        match_expired: { inApp: true, email: true, push: false },
    }, state.accessToken);
    assert(updatePrefsRes.status === 200, `Geçerli tercih güncellemesi 200 döner (alınan: ${updatePrefsRes.status})`, updatePrefsRes);

    const prefsAfterUpdate = await api('GET', '/notifications/prefs', null, state.accessToken);
    assert(prefsAfterUpdate.match_rejected?.inApp === true, 'match_rejected.inApp doğru kaydedildi');
    assert(prefsAfterUpdate.match_expired?.email === true, 'match_expired.email doğru kaydedildi');

    // Zorunlu tipte inApp:false -> 422 değil 400 (VALIDATION_ERROR) -- docs/04'te 422 deniyor
    // ama proje genelinde doğrulama hataları için kullanılan tutarlı kod 400/VALIDATION_ERROR
    const mandatoryBlockRes = await api('PATCH', '/notifications/prefs', {
        review_required: { inApp: false, email: false, push: false },
    }, state.accessToken);
    assert(mandatoryBlockRes.status === 400, `Zorunlu tipte inApp kapatma reddedilir (alınan: ${mandatoryBlockRes.status})`, mandatoryBlockRes);

    const invalidShapeRes = await api('PATCH', '/notifications/prefs', { match_rejected: { inApp: 'evet' } }, state.accessToken);
    assert(invalidShapeRes.status === 400, `Geçersiz tercih şekli reddedilir (alınan: ${invalidShapeRes.status})`);

    const emptyBodyRes = await api('PATCH', '/notifications/prefs', {}, state.accessToken);
    assert(emptyBodyRes.status === 400, `Boş gövde reddedilir (alınan: ${emptyBodyRes.status})`);

    // ── NEGATİF SENARYOLAR ──
    section('10.2 BİLDİRİMLER NEGATİF SENARYOLARI');

    const unauthList = await api('GET', '/notifications');
    assert(unauthList.status === 401, 'Kimlik doğrulamasız liste engellendi (401)');

    const notFoundRead = await api('PATCH', '/notifications/00000000-0000-0000-0000-000000000000/read', null, state.accessToken);
    assert(notFoundRead.status === 404, `Mevcut olmayan bildirim id'si 404 döner (alınan: ${notFoundRead.status})`);

    // Başka bir kullanıcının bildirimini okundu işaretlemeye çalışmak 404 döner (var olduğunu sızdırmaz)
    if (state.expertToken) {
        const expertNotifs = await api('GET', '/notifications', null, state.expertToken);
        if (expertNotifs.data?.[0]) {
            const crossUserRead = await api('PATCH', `/notifications/${expertNotifs.data[0].id}/read`, null, state.accessToken);
            assert(crossUserRead.status === 404, `Başka kullanıcının bildirimini okundu işaretlemek 404 döner (alınan: ${crossUserRead.status})`);
        }
    }

    // ── WebSocket gerçek zamanlı teslimat (Faz 2.5) ──
    section('10.3 WEBSOCKET GERÇEK ZAMANLI BİLDİRİM (/v1/notifications/stream)');

    await new Promise((resolve, reject) => {
        const socket = io(`${ORIGIN}/v1/notifications/stream`, {
            auth: { token: state.accessToken },
            transports: ['websocket'],
            reconnection: false,
            timeout: 10000,
        });

        const timer = setTimeout(() => {
            assert(false, `WebSocket bağlantısı ve notification:new olayı 15 saniye içinde gelmedi (timeout, socket.connected=${socket.connected})`);
            socket.disconnect();
            resolve();
        }, 15000);

        socket.on('connect', async () => {
            assert(true, 'Socket.IO bağlantısı JWT ile başarıyla kuruldu');

            try {
                // Bağlantı kurulduktan SONRA yeni bir bildirim tetikleyelim (review reject akışı)
                const output = await api('POST', '/materials/outputs', {
                    description: 'WebSocket testi için sınıfsız çıktı',
                    quantityKg: 10,
                }, state.accessToken);

                const queueRow = await prisma.humanReviewQueue.findFirst({ where: { outputId: output.outputId } });
                await api('POST', `/admin/review-queue/${queueRow.id}/reject`, { notes: 'WS testi' }, state.expertToken);
            } catch (err) {
                clearTimeout(timer);
                assert(false, `WS testi için bildirim tetiklenirken hata: ${err.message}`);
                socket.disconnect();
                resolve();
            }
        });

        socket.on('notification:new', (payload) => {
            assert(payload?.type === 'notification:new', 'notification:new olayı doğru {type,data} zarfıyla geldi');
            assert(payload?.data?.type === 'classification_rejected', 'Gelen bildirim beklenen tipte (classification_rejected)');
            clearTimeout(timer);
            socket.disconnect();
            resolve();
        });

        socket.on('connect_error', (err) => {
            clearTimeout(timer);
            assert(false, `Socket.IO bağlantı hatası: ${err.message}`);
            resolve();
        });
    });

    // Geçersiz jetonla bağlanma reddedilmeli
    await new Promise((resolve) => {
        const badSocket = io(`${ORIGIN}/v1/notifications/stream`, {
            auth: { token: 'gecersiz.bir.jeton' },
            transports: ['websocket'],
            reconnection: false,
            timeout: 3000,
        });
        const timer = setTimeout(() => {
            assert(false, 'Geçersiz jetonla bağlantı 3 saniye içinde reddedilmedi');
            badSocket.disconnect();
            resolve();
        }, 4000);
        badSocket.on('disconnect', () => {
            assert(true, 'Geçersiz jetonla bağlanan soket sunucu tarafından koptu');
            clearTimeout(timer);
            resolve();
        });
        badSocket.on('connect_error', () => {
            clearTimeout(timer);
            resolve();
        });
    });
};
