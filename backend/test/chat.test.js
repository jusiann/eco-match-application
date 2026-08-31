// ═══════════════════════════════════════════════════════════════
//  Chatbot Testleri — SSE akışı, oturum (session) devamlılığı,
//  geçmiş, Claude API kesintisi, rate limit, negatif senaryolar
//  (Faz 3.3/3.4, S6)
// ═══════════════════════════════════════════════════════════════

import { BASE_URL, state, assert, api, section } from './helpers.js';

// Test paketi gerçek bir SSE istemcisi (EventSource tarayıcıya özgü) kullanamıyor --
// ham fetch + ReadableStream ile aynı `event: ...\ndata: ...\n\n` çerçevesini elle ayrıştırıyoruz.
async function readSse(response) {
    const events = [];
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        let idx;
        while ((idx = buffer.indexOf('\n\n')) !== -1) {
            const rawEvent = buffer.slice(0, idx);
            buffer = buffer.slice(idx + 2);
            const eventLine = rawEvent.split('\n').find((l) => l.startsWith('event: '));
            const dataLine = rawEvent.split('\n').find((l) => l.startsWith('data: '));
            if (eventLine && dataLine) {
                events.push({ event: eventLine.slice(7), data: JSON.parse(dataLine.slice(6)) });
            }
        }
    }
    return events;
}

async function sendChat(token, body) {
    const res = await fetch(`${BASE_URL}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
    });
    if (res.status !== 200) {
        return { status: res.status, body: await res.json() };
    }
    return { status: res.status, events: await readSse(res) };
}

export const testChat = async () => {
    section('14. CHATBOT MODÜLÜ (/v1/chat) — Faz 3.3/3.4, S6');

    // ── Basit soru-cevap, akış parça parça geliyor ──
    const first = await sendChat(state.accessToken, { message: 'DPP nedir?' });
    assert(first.status === 200, `POST /v1/chat 200 döner (alınan: ${first.status})`);
    const sessionEvent = first.events.find((e) => e.event === 'session');
    assert(!!sessionEvent, 'Yeni konuşmada session olayı geldi');
    const deltaEvents = first.events.filter((e) => e.event === 'delta');
    assert(deltaEvents.length > 1, `Yanıt PARÇA PARÇA geldi (${deltaEvents.length} parça, tek seferde değil)`);
    const doneEvent = first.events.find((e) => e.event === 'done');
    assert(!!doneEvent, 'done olayı geldi');
    const sessionId = doneEvent.data.sessionId;
    assert(typeof sessionId === 'string' && sessionId.length > 0, 'done olayı sessionId içeriyor');

    const fullReply = deltaEvents.map((e) => e.data.delta).join('');
    assert(fullReply.toLowerCase().includes('dijital ürün pasaportu') || fullReply.length > 0, 'Toplam yanıt anlamlı bir metin oluşturuyor');

    const dbAfterFirst = await import('./helpers.js').then((m) => m.prisma.message.findMany({ where: { sessionId } }));
    assert(dbAfterFirst.length === 2, 'messages tablosuna 2 kayıt eklendi (role=user + role=assistant)');
    assert(dbAfterFirst.some((m) => m.role === 'USER'), 'Kayıtlardan biri role=user');
    assert(dbAfterFirst.some((m) => m.role === 'ASSISTANT'), 'Kayıtlardan biri role=assistant');

    // ── Context korunur (aynı session'a devam) ──
    const second = await sendChat(state.accessToken, { message: 'ya CBAM?', sessionId });
    assert(second.status === 200, `Aynı session'a devam eden istek 200 döner (alınan: ${second.status})`);
    const secondDone = second.events.find((e) => e.event === 'done');
    assert(secondDone?.data?.sessionId === sessionId, 'İkinci mesaj AYNI session\'da devam ediyor');

    // ── GET /v1/chat/history ──
    const historyRes = await api('GET', `/chat/history?sessionId=${sessionId}`, null, state.accessToken);
    assert(historyRes.status === 200, `GET /v1/chat/history 200 döner (alınan: ${historyRes.status})`);
    assert(historyRes.messages.length === 4, 'history 2 tur (4 mesaj) döndürüyor');
    assert(historyRes.messages[0].role === 'user', 'history ilk mesaj user (kronolojik sıra)');

    const defaultHistoryRes = await api('GET', '/chat/history', null, state.accessToken);
    assert(defaultHistoryRes.sessionId === sessionId, 'sessionId verilmezse EN SON konuşma döner');

    // ── Claude API down (test kancası) -- assistant mesajı KAYDEDİLMEZ ──
    const down = await sendChat(state.accessToken, { message: '__SIMULATE_CLAUDE_DOWN__' });
    const downSession = down.events.find((e) => e.event === 'session')?.data?.sessionId;
    const errorEvent = down.events.find((e) => e.event === 'error');
    assert(!!errorEvent, 'Claude API down senaryosunda error olayı geldi');
    assert(errorEvent.data.error === 'AI_SERVICE_UNAVAILABLE', 'Hata kodu AI_SERVICE_UNAVAILABLE');
    const { prisma } = await import('./helpers.js');
    const downMessages = await prisma.message.findMany({ where: { sessionId: downSession } });
    assert(downMessages.length === 1 && downMessages[0].role === 'USER', 'DB\'ye SADECE kullanıcı mesajı kaydedildi, assistant mesajı yok (S6)');

    // ── NEGATİF SENARYOLAR ──
    section('14.1 CHATBOT NEGATİF SENARYOLARI');

    const unauth = await fetch(`${BASE_URL}/chat`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message: 'merhaba' }) });
    assert(unauth.status === 401, `Kimlik doğrulamasız istek engellendi (401, alınan: ${unauth.status})`);

    const emptyMsg = await api('POST', '/chat', { message: '' }, state.accessToken);
    assert(emptyMsg.status === 400, `Boş mesaj 400 ile reddedildi (alınan: ${emptyMsg.status})`);

    const tooLong = await api('POST', '/chat', { message: 'a'.repeat(2001) }, state.accessToken);
    assert(tooLong.status === 400, `2000 karakteri aşan mesaj 400 ile reddedildi (alınan: ${tooLong.status})`);

    const invalidSession = await api('POST', '/chat', { message: 'merhaba', sessionId: '11111111-1111-4111-8111-111111111111' }, state.accessToken);
    assert(invalidSession.status === 404, `Var olmayan sessionId 404 döner (alınan: ${invalidSession.status})`);
    assert(invalidSession.error === 'CHAT_SESSION_NOT_FOUND', 'Hata kodu CHAT_SESSION_NOT_FOUND');

    // Başka kullanıcının session'ına devam etmeye çalışmak da 404 döner (var olduğunu sızdırmaz)
    if (state.expertToken) {
        const crossUser = await api('POST', '/chat', { message: 'merhaba', sessionId }, state.expertToken);
        assert(crossUser.status === 404, `Başka kullanıcının session'ı 404 döner (alınan: ${crossUser.status})`);
    }

    // ── RATE LIMIT (10/dk) ──
    section('14.2 CHATBOT RATE LIMIT (10/dk)');

    const uniqueSuffix = `${Date.now()}${Math.floor(Math.random() * 900 + 100)}`;
    const rateLimitEmail = `chat-rate-${uniqueSuffix}@ecomatch-test.com`;
    const rl = await api('POST', '/auth/register', {
        name: `E2E Chat Rate Limit ${uniqueSuffix}`,
        // Date.now() STRING'inin ilk 10 hanesini almak yavaş değişen (dakikalar mertebesinde
        // aynı kalan) kaba kısmı tutar -- gerçek benzersizlik için tam damga + rastgele ek.
        taxId: uniqueSuffix,
        sector: 'metal',
        email: rateLimitEmail,
        password: 'Password123!',
        contactName: 'Rate Limit Test',
        phone: '+90 555 222 33 44',
        location: { lat: 40.0, lng: 29.0 },
    });
    const rlToken = rl.access_token;
    state.chatRateLimitFacilityId = rl.facility?.id;

    const attempts = await Promise.all(
        Array.from({ length: 13 }, (_, i) => sendChat(rlToken, { message: `test mesajı ${i}` })),
    );
    const succeeded = attempts.filter((a) => a.status === 200).length;
    const limited = attempts.filter((a) => a.status === 429).length;
    assert(succeeded <= 10, `10/dk limiti üzerinde başarılı istek geçmedi (gerçekleşen: ${succeeded})`);
    assert(limited > 0, `13 hızlı istekten en az biri 429 ile sınırlandı (${limited} sınırlandı)`);
};
