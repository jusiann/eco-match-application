// ═══════════════════════════════════════════════════════════════
//  Kimlik Doğrulama (Auth) Modülü Testleri — Kayıt, Giriş, Profil,
//  Güncelleme, Yenileme (Refresh), Şifremi Unuttum/Sıfırlama,
//  E-posta Doğrulama, Çıkış ve Negatif Senaryolar
// ═══════════════════════════════════════════════════════════════

import { TEST_DATA, state, assert, api, section, sleep, prisma } from './helpers.js';
import { JwtService } from '@nestjs/jwt';

export const testAuth = async () => {
    section('2. KİMLİK DOĞRULAMA (AUTH) MODÜLÜ (/v1/auth/*)');

    // helpers.js backend/.env dosyasını yükler ve JWT_SECRET_KEY yoksa erkenden çıkar.
    // Dolayısıyla bunun çalışan sunucunun belirteçleri doğruladığı anahtarla aynı olması garanti edilir.
    const jwt = new JwtService({ secret: process.env.JWT_SECRET_KEY });

    // ── Kayıt (Register) ──
    const registerPayload = {
        name: TEST_DATA.user.name,
        taxId: TEST_DATA.user.taxId,
        sector: TEST_DATA.user.sector,
        email: TEST_DATA.user.email,
        password: TEST_DATA.user.password,
        contactName: TEST_DATA.user.contactName,
        phone: TEST_DATA.user.phone,
        osbId: state.osbId || undefined,
        location: TEST_DATA.user.location,
    };

    const signup = await api('POST', '/auth/register', registerPayload);
    assert(signup.status === 201 || signup.status === 200, `Kayıt işlemi 201 Created döndürdü (alınan: ${signup.status})`, signup);
    assert(signup.success === true, 'Kayıt yanıtı success: true bildirdi');
    assert(!!signup.access_token, 'Kayıt gövdede access_token döndürdü');
    assert(signup.refresh_token === undefined, 'Kayıt yanıt gövdesinde refresh_token sızdırmıyor (K-18)');
    assert(!!signup.refreshTokenCookie, 'Kayıt HttpOnly refresh_token çerezi atıyor', signup.cookie);
    assert(signup.user?.role === 'FACILITY_ADMIN', 'İlk kullanıcıya FACILITY_ADMIN rolü atandı');
    assert(signup.user?.emailVerified === false, 'Başlangıçta user.emailVerified false');
    assert(signup.facility?.verified === false, 'Başlangıçta facility.verified false');

    state.accessToken = signup.access_token;
    state.refreshTokenCookie = signup.refreshTokenCookie;
    state.userId = signup.user?.id;
    state.facilityId = signup.facility?.id;

    // ── GET /v1/auth/me ──
    const me = await api('GET', '/auth/me', null, state.accessToken);
    assert(me.status === 200, `GET /v1/auth/me 200 OK döndü (alınan: ${me.status})`, me);
    assert(me.user?.email === TEST_DATA.user.email.toLowerCase(), 'Profil e-postası kayıtlı e-posta ile eşleşiyor');
    assert(me.facility?.name === TEST_DATA.user.name, 'Profil tesis adı kayıtlı ad ile eşleşiyor');
    assert(me.facility?.taxId === TEST_DATA.user.taxId, 'Profil tesis vergi numarası eşleşiyor');

    // ── PUT /v1/auth/update-profile ──
    const updatedName = `${TEST_DATA.user.name} Güncellendi`;
    const update = await api('PUT', '/auth/update-profile', { name: updatedName }, state.accessToken);
    assert(update.status === 200, `PUT /v1/auth/update-profile 200 OK döndü (alınan: ${update.status})`, update);

    const meAfterUpdate = await api('GET', '/auth/me', null, state.accessToken);
    assert(meAfterUpdate.facility?.name === updatedName, 'Profil güncellenen tesis adını yansıtıyor');

    // ── POST /v1/auth/login ──
    const signin = await api('POST', '/auth/login', {
        email: TEST_DATA.user.email,
        password: TEST_DATA.user.password,
    });
    assert(signin.status === 200 || signin.status === 201, `Giriş 200/201 döndürdü (alınan: ${signin.status})`, signin);
    assert(!!signin.access_token, 'Giriş yeni access_token döndürdü');
    assert(signin.refresh_token === undefined, 'Giriş yanıt gövdesinde refresh_token sızdırmıyor');
    assert(!!signin.refreshTokenCookie, 'Giriş HttpOnly refresh_token çerezi atıyor');

    state.accessToken = signin.access_token;
    state.refreshTokenCookie = signin.refreshTokenCookie;

    // JWT `iat` 1 saniyelik çözünürlüğe sahiptir. Girişle aynı saniye içinde refresh çağrılırsa
    // aynı iat ve taleplerle özdeş bir belirteç üretilir. İki belirtecin farklı olmasını garanti etmek için kısa bir bekleme eklenir.
    await sleep(1100);

    // ── POST /v1/auth/refresh (Çerez tabanlı) ──
    const preRefreshCookie = state.refreshTokenCookie; // aşağıdaki rotasyon/tekrar kullanım testi için saklanır
    const refreshRes = await api('POST', '/auth/refresh', null, null, { cookie: state.refreshTokenCookie });
    assert(refreshRes.status === 200 || refreshRes.status === 201, `Refresh token 200/201 döndürdü (alınan: ${refreshRes.status})`, refreshRes);
    assert(!!refreshRes.access_token, 'Refresh yeni access_token döndürdü');
    assert(!!refreshRes.refreshTokenCookie, 'Refresh döndürülen (rotate edilen) refresh_token çerezi döndürdü');
    assert(refreshRes.refreshTokenCookie !== preRefreshCookie, 'Döndürülen refresh_token çerezi önceki çerezden farklı');

    state.accessToken = refreshRes.access_token;
    state.refreshTokenCookie = refreshRes.refreshTokenCookie;

    // ── Belirteç Döndürme Güvenliği (Token Rotation Security - K-15) ──
    // Daha önce geçerli olan ancak artık rotasyona uğramış eski çerezin yeniden kullanımı reddedilmelidir.
    const reusedOldCookie = await api('POST', '/auth/refresh', null, null, { cookie: preRefreshCookie });
    assert(reusedOldCookie.status === 401, 'Eski (döndürülmüş) refresh çerezinin yeniden kullanımı reddedildi (401)', reusedOldCookie);

    // ── Sunucu tarafından hiç üretilmemiş belirteç reddedilmelidir ──
    const neverIssuedToken = jwt.sign({ sub: state.userId, type: 'refresh' }, { expiresIn: '10s' });
    const forgedRefresh = await api('POST', '/auth/refresh', null, null, { cookie: `refresh_token=${neverIssuedToken}` });
    assert(forgedRefresh.status === 401, 'Doğru formatta ancak hiç üretilmemiş sahte refresh belirteci reddedildi (401)', forgedRefresh);

    // ── Çerez gönderilmediğinde de çökmek yerine 401 dönmelidir ──
    const noCookieRefresh = await api('POST', '/auth/refresh', null, null, { cookie: false });
    assert(noCookieRefresh.status === 401, 'Hiçbir çerez olmadan yapılan refresh isteği reddedildi (401)', noCookieRefresh);

    // ── POST /v1/auth/verify-email ──
    const verifyToken = jwt.sign({ sub: state.userId, type: 'email_verify' }, { expiresIn: '24h' });
    const verifyRes = await api('POST', '/auth/verify-email', { token: verifyToken });
    assert(verifyRes.status === 200 || verifyRes.status === 201, `E-posta doğrulama 200/201 döndürdü (alınan: ${verifyRes.status})`, verifyRes);
    assert(verifyRes.success === true, 'E-posta doğrulama başarı bildirdi');

    const meAfterVerify = await api('GET', '/auth/me', null, state.accessToken);
    assert(meAfterVerify.user?.emailVerified === true, 'Kullanıcının emailVerified değeri true oldu');

    // ── POST /v1/auth/forgot-password & reset-password ──
    const forgotRes = await api('POST', '/auth/forgot-password', { email: TEST_DATA.user.email });
    assert(forgotRes.status === 200 || forgotRes.status === 201, `Şifremi unuttum 200/201 döndürdü (alınan: ${forgotRes.status})`, forgotRes);

    // ── Numaralandırma Koruması (Anti-enumeration - K-18) ──
    const forgotUnknownRes = await api('POST', '/auth/forgot-password', { email: `nobody.${TEST_DATA.runId}@nonexistent.domain` });
    assert(forgotUnknownRes.status === forgotRes.status, 'Bilinmeyen e-posta için şifremi unuttum durum kodu aynı (numaralandırma koruması)');
    assert(forgotUnknownRes.message === forgotRes.message, 'Bilinmeyen e-posta için şifremi unuttum mesajı aynı (numaralandırma koruması)');

    const resetToken = jwt.sign({ sub: state.userId, type: 'password_reset' }, { expiresIn: '1h' });
    const newPassword = 'NewSecretPassword123!';
    const resetRes = await api('POST', '/auth/reset-password', {
        token: resetToken,
        newPassword,
    });
    assert(resetRes.status === 200 || resetRes.status === 201, `Şifre sıfırlama 200/201 döndürdü (alınan: ${resetRes.status})`, resetRes);

    // Eski şifrenin geçersiz olduğunu doğrula
    const oldLogin = await api('POST', '/auth/login', {
        email: TEST_DATA.user.email,
        password: TEST_DATA.user.password,
    });
    assert(oldLogin.status === 401, 'Eski şifre doğru şekilde reddedildi (401)');

    // Yeni şifrenin çalıştığını doğrula
    const newLogin = await api('POST', '/auth/login', {
        email: TEST_DATA.user.email,
        password: newPassword,
    });
    assert(newLogin.status === 200 || newLogin.status === 201, `Yeni şifreyle giriş başarılı oldu (alınan: ${newLogin.status})`);
    state.accessToken = newLogin.access_token;
    state.refreshTokenCookie = newLogin.refreshTokenCookie;

    // ── POST /v1/auth/logout ──
    const logoutRes = await api('POST', '/auth/logout', null, state.accessToken);
    assert(logoutRes.status === 200 || logoutRes.status === 201, `Çıkış yapma (logout) 200/201 döndürdü (alınan: ${logoutRes.status})`);

    // Çıkış sonrası refresh başarısız olmalıdır
    const refreshAfterLogout = await api('POST', '/auth/refresh', null, null, { cookie: state.refreshTokenCookie });
    assert(refreshAfterLogout.status === 401, 'Çıkış yaptıktan sonra refresh belirteci geçersiz kılındı (401)');

    // Sonraki test paketleri için yeniden giriş yap
    const relogin = await api('POST', '/auth/login', {
        email: TEST_DATA.user.email,
        password: newPassword,
    });
    assert(relogin.status === 200 || relogin.status === 201, `Sonraki testler için yeniden giriş başarılı oldu (alınan: ${relogin.status})`);
    state.accessToken = relogin.access_token;
    state.refreshTokenCookie = relogin.refreshTokenCookie;

    // ── NEGATİF SENARYOLAR ──
    section('2.1 KİMLİK DOĞRULAMA NEGATİF SENARYOLARI');

    // 1. Belirteç eksik
    const noToken = await api('GET', '/auth/me');
    assert(noToken.status === 401, 'Belirteçsiz yetkisiz istek engellendi (401)');

    // 2. Bozuk belirteç formatı
    const badToken = await api('GET', '/auth/me', null, 'invalid.jwt.token');
    assert(badToken.status === 401, 'Geçersiz belirteç formatı reddedildi (401)');

    // 3. Mevcut olmayan e-posta ile giriş
    const nonUser = await api('POST', '/auth/login', {
        email: 'nobody@nonexistent.domain',
        password: 'Password123!',
    });
    assert(nonUser.status === 401, 'Mevcut olmayan kullanıcıyla giriş engellendi (401)');

    // 4. Yanlış şifre ile giriş
    const wrongPw = await api('POST', '/auth/login', {
        email: TEST_DATA.user.email,
        password: 'TotallyWrongPassword999!',
    });
    assert(wrongPw.status === 401, 'Yanlış şifre engellendi (401)');

    // 5. Mükerrer e-posta ile kayıt
    const dupEmail = await api('POST', '/auth/register', {
        ...registerPayload,
        taxId: '9999999999',
    });
    assert(dupEmail.status === 400 || dupEmail.status === 409, `Mükerrer e-posta engellendi (${dupEmail.status})`);

    // 6. Mükerrer vergi numarası ile kayıt
    const dupTax = await api('POST', '/auth/register', {
        ...registerPayload,
        email: `other.${TEST_DATA.runId}@test.com`,
    });
    assert(dupTax.status === 400 || dupTax.status === 409, `Mükerrer vergi numarası engellendi (${dupTax.status})`);

    // 7. Zayıf şifrenin reddedilmesi
    const weakPw = await api('POST', '/auth/register', {
        ...registerPayload,
        email: `weak.${TEST_DATA.runId}@test.com`,
        taxId: `77${TEST_DATA.runId.padStart(8, '0')}`,
        password: 'weak',
    });
    assert(weakPw.status === 400, 'Zayıf şifre 400 Doğrulama Hatası ile reddedildi');

    // 8. Geçersiz e-posta formatı
    const badEmail = await api('POST', '/auth/register', {
        ...registerPayload,
        email: 'not-an-email',
        taxId: `66${TEST_DATA.runId.padStart(8, '0')}`,
    });
    assert(badEmail.status === 400, 'Geçersiz e-posta formatı 400 Doğrulama Hatası ile reddedildi');
};
