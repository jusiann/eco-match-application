// ═══════════════════════════════════════════════════════════════
//  IoT Testleri — Sensör verisi alımı (API key auth), düşük stok
//  bildirimi, tükenme bildirimi, sensör bağlantı kaybı/geri gelme
//  (Faz 3.7/3.8, I1/I2) -- MQTT taşıması yerine gerçek alım
//  mantığını HTTP+API key üzerinden test ediyoruz (bkz. iot.dto.ts).
// ═══════════════════════════════════════════════════════════════

import { TEST_DATA, state, assert, api, section, prisma } from './helpers.js';

const FAR_FUTURE = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

export const testIot = async () => {
    section('17. IoT MODÜLÜ (/v1/iot/sensor-data) — Faz 3.7/3.8, I1/I2');

    // ── Kurulum: ayrı bir test tesisi + çıktı + API anahtarı ──
    const email = `iot-${TEST_DATA.runId}@ecomatch-test.com`;
    const register = await api('POST', '/auth/register', {
        name: `E2E IoT Fabrikası ${TEST_DATA.runId}`,
        taxId: `94${TEST_DATA.runId.padStart(8, '0')}`,
        sector: 'chemical',
        email,
        password: 'Password123!',
        contactName: 'IoT Test',
        phone: '+90 555 777 88 99',
        location: { lat: 40.05, lng: 29.1 },
    });
    assert(register.status === 201, 'IoT test tesisi kaydı 201 döndürdü');
    state.iotFacilityId = register.facility?.id;
    const iotToken = register.access_token;
    // VerifiedFacilityGuard doğrulanmamış tesisin çıktı oluşturmasını engelliyor (403) --
    // tam onay akışı zaten admin.test.js'te test ediliyor, burada doğrudan DB kısayolu.
    await prisma.facility.update({ where: { id: state.iotFacilityId }, data: { verified: true } });

    const output = await api('POST', '/materials/outputs', {
        description: `IoT tank sensörü ${TEST_DATA.runId}`,
        materialClass: 'chemical',
        quantityKg: 1000,
        stock: 1000,
    }, iotToken);
    state.iotOutputId = output.outputId;

    const keyRes = await api('POST', '/admin/api-keys', { name: 'IoT E2E Sensörü', userId: register.user.id }, state.adminToken);
    state.iotApiKeyRaw = keyRes.key;
    state.iotApiKeyId = keyRes.apiKeyId;

    // ── Normal okuma ──
    const reading1 = await api('POST', '/iot/sensor-data', { outputId: state.iotOutputId, levelKg: 800 }, null, {
        headers: { 'X-Api-Key': state.iotApiKeyRaw },
    });
    assert(reading1.status === 201, `Normal sensör okuması 201 döner (alınan: ${reading1.status})`, reading1);
    assert(reading1.stock === 800, 'Yanıt güncellenen stok değerini döndürüyor');
    assert(reading1.availability === true, 'Eşik üzerinde availability true kalıyor');

    const dbOutput1 = await prisma.output.findUnique({ where: { id: state.iotOutputId } });
    assert(Number(dbOutput1.stock) === 800, 'DB\'de outputs.stock güncellendi (I1)');
    const sensorRow = await prisma.sensorData.findFirst({ where: { outputId: state.iotOutputId }, orderBy: { timestamp: 'desc' } });
    assert(!!sensorRow, 'sensor_data tablosuna kayıt eklendi (I1)');
    assert(Number(sensorRow.value) === 800, 'sensor_data.value doğru kaydedildi');

    // ── Düşük stok (eşik %20 = 200kg altı) ──
    const countBeforeLow = await prisma.notification.count({ where: { user: { facilityId: state.iotFacilityId }, type: 'low_stock' } });
    const lowReading = await api('POST', '/iot/sensor-data', { outputId: state.iotOutputId, levelKg: 150 }, null, {
        headers: { 'X-Api-Key': state.iotApiKeyRaw },
    });
    assert(lowReading.status === 201, `Düşük stok okuması 201 döner (alınan: ${lowReading.status})`);
    assert(lowReading.availability === false, 'Eşik altında availability false oluyor');
    const dbOutput2 = await prisma.output.findUnique({ where: { id: state.iotOutputId } });
    assert(dbOutput2.availability === false, 'DB\'de outputs.availability false oldu');
    const countAfterLow = await prisma.notification.count({ where: { user: { facilityId: state.iotFacilityId }, type: 'low_stock' } });
    assert(countAfterLow === countBeforeLow + 1, 'Tesis sahibine low_stock bildirimi gitti');

    // ── Tükenme (stock = 0) -- aktif eşleşmedeki karşı tarafa bildirim ──
    const consumerInput = await api('POST', '/materials/inputs', {
        description: `IoT tükenme testi girdisi ${TEST_DATA.runId}`,
        materialClass: 'chemical',
        quantityKg: 100,
    }, state.consumerToken);
    const activeMatch = await prisma.match.create({
        data: {
            outputId: state.iotOutputId,
            inputId: consumerInput.inputId,
            totalScore: 70,
            breakdown: { material: 70, quality: 70, environmental: 70, logistics: 70, economic: 70 },
            demandQty: 100,
            status: 'PENDING',
            expiresAt: FAR_FUTURE,
        },
    });

    const countBeforeDepleted = await prisma.notification.count({ where: { user: { facilityId: state.consumerFacilityId }, type: 'output_depleted' } });
    const depletedReading = await api('POST', '/iot/sensor-data', { outputId: state.iotOutputId, levelKg: 0 }, null, {
        headers: { 'X-Api-Key': state.iotApiKeyRaw },
    });
    assert(depletedReading.status === 201, `Tükenme okuması 201 döner (alınan: ${depletedReading.status})`);
    const countAfterDepleted = await prisma.notification.count({ where: { user: { facilityId: state.consumerFacilityId }, type: 'output_depleted' } });
    assert(countAfterDepleted === countBeforeDepleted + 1, 'Aktif eşleşmedeki karşı tarafa output_depleted bildirimi gitti');

    await prisma.match.delete({ where: { id: activeMatch.id } });

    // ── NEGATİF SENARYOLAR ──
    section('17.1 IoT NEGATİF SENARYOLARI');

    const noKey = await api('POST', '/iot/sensor-data', { outputId: state.iotOutputId, levelKg: 500 });
    assert(noKey.status === 401, `X-Api-Key olmadan istek engellendi (401, alınan: ${noKey.status})`);
    assert(noKey.error === 'API_KEY_MISSING', 'Hata kodu API_KEY_MISSING');

    const badKey = await api('POST', '/iot/sensor-data', { outputId: state.iotOutputId, levelKg: 500 }, null, {
        headers: { 'X-Api-Key': 'gecersiz-bir-anahtar' },
    });
    assert(badKey.status === 401, `Geçersiz X-Api-Key engellendi (401, alınan: ${badKey.status})`);
    assert(badKey.error === 'API_KEY_INVALID', 'Hata kodu API_KEY_INVALID');

    // Başka bir tesisin çıktısını güncellemeye çalışmak (state.outputId ana test kullanıcısına ait)
    const crossFacility = await api('POST', '/iot/sensor-data', { outputId: state.outputId, levelKg: 100 }, null, {
        headers: { 'X-Api-Key': state.iotApiKeyRaw },
    });
    assert(crossFacility.status === 404, `Başka tesisin çıktısı 404 döner (alınan: ${crossFacility.status})`);

    // İptal edilmiş anahtar artık çalışmamalı
    await api('DELETE', `/admin/api-keys/${state.iotApiKeyId}`, null, state.adminToken);
    const revokedKeyReq = await api('POST', '/iot/sensor-data', { outputId: state.iotOutputId, levelKg: 500 }, null, {
        headers: { 'X-Api-Key': state.iotApiKeyRaw },
    });
    assert(revokedKeyReq.status === 401, `İptal edilmiş anahtarla istek reddedildi (401, alınan: ${revokedKeyReq.status})`);

    // Testin geri kalanı için taze bir anahtar aç
    const freshKey = await api('POST', '/admin/api-keys', { name: 'IoT E2E Sensörü (heartbeat)', userId: register.user.id }, state.adminToken);
    state.iotApiKeyRaw = freshKey.key;
    state.iotApiKeyId = freshKey.apiKeyId;

    // ── I2: Sensör bağlantı kaybı / geri gelme ──
    section('17.2 SENSÖR BAĞLANTI KAYBI (I2)');

    await api('POST', '/iot/sensor-data', { outputId: state.iotOutputId, levelKg: 400 }, null, {
        headers: { 'X-Api-Key': state.iotApiKeyRaw },
    });

    const heartbeat1 = await api('POST', '/admin/cron/iot-heartbeat', null, state.adminToken);
    assert(heartbeat1.status === 201, `iot-heartbeat cron tetikleme 201 döner (alınan: ${heartbeat1.status})`);

    // sensor_data.timestamp'i 35 dakika geriye çekerek "eski veri" durumunu simüle et
    await prisma.sensorData.updateMany({
        where: { facilityId: state.iotFacilityId },
        data: { timestamp: new Date(Date.now() - 35 * 60 * 1000) },
    });

    const offlineOwnerBefore = await prisma.notification.count({ where: { user: { facilityId: state.iotFacilityId }, type: 'sensor_offline' } });
    const heartbeat2 = await api('POST', '/admin/cron/iot-heartbeat', null, state.adminToken);
    assert(heartbeat2.offline >= 1, `Bayat veri sonrası en az 1 tesis offline sayıldı (alınan: ${heartbeat2.offline})`);
    const offlineOwnerAfter = await prisma.notification.count({ where: { user: { facilityId: state.iotFacilityId }, type: 'sensor_offline' } });
    assert(offlineOwnerAfter === offlineOwnerBefore + 1, 'Tesis sahibine sensor_offline bildirimi gitti');

    // Aynı offline durumda TEKRAR tetiklemek yeni bir bildirim AÇMAMALI (durum değişmedi)
    const heartbeat3 = await api('POST', '/admin/cron/iot-heartbeat', null, state.adminToken);
    const offlineOwnerRepeat = await prisma.notification.count({ where: { user: { facilityId: state.iotFacilityId }, type: 'sensor_offline' } });
    assert(offlineOwnerRepeat === offlineOwnerAfter, 'Durum değişmeden tekrar tetiklemek yinelenen bildirim AÇMIYOR');

    // Sensör geri geldi -- taze bir okuma gönder, cron sensor_online üretmeli
    await api('POST', '/iot/sensor-data', { outputId: state.iotOutputId, levelKg: 350 }, null, {
        headers: { 'X-Api-Key': state.iotApiKeyRaw },
    });
    const heartbeat4 = await api('POST', '/admin/cron/iot-heartbeat', null, state.adminToken);
    assert(heartbeat4.online >= 1, `Taze veri sonrası en az 1 tesis online sayıldı (alınan: ${heartbeat4.online})`);
    const onlineNotif = await prisma.notification.findFirst({
        where: { user: { facilityId: state.iotFacilityId }, type: 'sensor_online' },
        orderBy: { createdAt: 'desc' },
    });
    assert(!!onlineNotif, 'Tesis sahibine sensor_online bildirimi gitti (I2)');
};
