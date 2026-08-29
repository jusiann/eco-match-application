// ═══════════════════════════════════════════════════════════════
//  Tesisler (Facilities) Modülü Testleri — Profil, Coğrafi Koordinatlar,
//  Çok Parçalı Belge Yükleme (PDF/JPG), Listeleme & Negatif Senaryolar
// ═══════════════════════════════════════════════════════════════

import { TEST_DATA, state, assert, api, section } from './helpers.js';

export const testFacilities = async () => {
    section('3. TESİSLER (FACILITIES) MODÜLÜ (/v1/facilities/*)');

    // ── GET /v1/facilities/me ──
    const facRes = await api('GET', '/facilities/me', null, state.accessToken);
    assert(facRes.status === 200, `GET /v1/facilities/me 200 OK döndü (alınan: ${facRes.status})`, facRes);
    assert(facRes.facility?.id === state.facilityId, 'Tesis ID\'si kayıtlı ID ile eşleşiyor');
    assert(facRes.facility?.taxId === TEST_DATA.user.taxId, 'Vergi numarası eşleşiyor');
    assert(facRes.facility?.verified === false, 'Başlangıçta tesis doğrulaması (verified) false');

    // PostGIS coğrafi koordinat kontrolü
    assert(facRes.facility?.location !== null, 'Tesis coğrafi konum verisi dolu');
    const latDiff = Math.abs((facRes.facility?.location?.lat || 0) - TEST_DATA.user.location.lat);
    const lngDiff = Math.abs((facRes.facility?.location?.lng || 0) - TEST_DATA.user.location.lng);
    assert(latDiff < 0.001 && lngDiff < 0.001, 'Tesis PostGIS enlem/boylamı kayıt koordinatlarıyla eşleşiyor');

    // ── PATCH /v1/facilities/me ──
    const newLocation = { lat: 40.2100, lng: 29.0800 };
    const patchRes = await api('PATCH', '/facilities/me', {
        name: `${TEST_DATA.user.name} - Patched`,
        sector: 'chemical',
        location: newLocation,
    }, state.accessToken);

    assert(patchRes.status === 200, `PATCH /v1/facilities/me 200 OK döndü (alınan: ${patchRes.status})`, patchRes);

    const facAfterPatch = await api('GET', '/facilities/me', null, state.accessToken);
    assert(facAfterPatch.facility?.sector === 'chemical', 'Sektör \'chemical\' olarak güncellendi');
    const newLatDiff = Math.abs((facAfterPatch.facility?.location?.lat || 0) - newLocation.lat);
    assert(newLatDiff < 0.001, 'Güncellenen konum koordinatları PostGIS ile doğru şekilde kaydedildi');

    // ── POST /v1/facilities/me/documents (Belge 1: PDF Vergi Levhası) ──
    const pdfBlob = new Blob(['%PDF-1.4 test document content for eco-match verification'], { type: 'application/pdf' });
    const pdfForm = new FormData();
    pdfForm.append('documentType', 'tax_certificate');
    pdfForm.append('file', pdfBlob, 'vergi_levhasi.pdf');

    const uploadPdfRes = await api('POST', '/facilities/me/documents', pdfForm, state.accessToken);
    assert(uploadPdfRes.status === 201 || uploadPdfRes.status === 200, `PDF vergi levhası yükleme 201 döndürdü (alınan: ${uploadPdfRes.status})`, uploadPdfRes);
    assert(uploadPdfRes.success === true, 'Yükleme yanıtı success: true bildirdi');
    assert(!!uploadPdfRes.documentId, 'Yükleme oluşturulan documentId\'yi döndürdü');
    assert(uploadPdfRes.bodyStatus === 'PENDING' || uploadPdfRes.bodyStatus === 'pending', 'Belge durumu \'pending\' olarak başlatıldı');

    state.documentId = uploadPdfRes.documentId;

    // ── POST /v1/facilities/me/documents (Belge 2: JPG Faaliyet Belgesi) ──
    const jpgBytes = new Uint8Array([0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x01, 0x00, 0x48, 0x00, 0x48, 0x00, 0x00, 0xFF, 0xD9]);
    const jpgBlob = new Blob([jpgBytes], { type: 'image/jpeg' });
    const jpgForm = new FormData();
    jpgForm.append('documentType', 'operating_permit');
    jpgForm.append('file', jpgBlob, 'faaliyet_belgesi.jpg');

    const uploadJpgRes = await api('POST', '/facilities/me/documents', jpgForm, state.accessToken);
    assert(uploadJpgRes.status === 201 || uploadJpgRes.status === 200, `JPG faaliyet belgesi yükleme 201 döndürdü (alınan: ${uploadJpgRes.status})`);
    assert(!!uploadJpgRes.documentId, 'Yükleme ikinci dosya için oluşturulan documentId\'yi döndürdü');

    state.documentId2 = uploadJpgRes.documentId;

    // ── GET /v1/facilities/me/documents ──
    const listDocsRes = await api('GET', '/facilities/me/documents', null, state.accessToken);
    assert(listDocsRes.status === 200, 'GET /v1/facilities/me/documents 200 OK döndü');
    assert(Array.isArray(listDocsRes.documents), 'Documents özelliği bir dizidir');
    assert(listDocsRes.documents.length >= 2, `Yüklenen belgeler listede mevcut (${listDocsRes.documents.length} adet bulundu)`);

    const foundPdfDoc = listDocsRes.documents.find((d) => d.id === state.documentId);
    assert(!!foundPdfDoc, 'Vergi levhası belgesi listede bulundu');
    assert(foundPdfDoc?.documentType === 'tax_certificate', 'Belge tipi \'tax_certificate\'');
    assert(foundPdfDoc?.status === 'PENDING' || foundPdfDoc?.status === 'pending', 'Belge durumu \'pending\'');

    // ── NEGATİF SENARYOLAR ──
    section('3.1 TESİSLER NEGATİF SENARYOLARI');

    // 0. Yetkisiz profil erişimi
    const unauthMe = await api('GET', '/facilities/me');
    assert(unauthMe.status === 401, 'Kimlik doğrulamasız GET /v1/facilities/me engellendi (401)');

    // 1. documentType eksik
    const noTypeForm = new FormData();
    noTypeForm.append('file', pdfBlob, 'doc.pdf');
    const noTypeRes = await api('POST', '/facilities/me/documents', noTypeForm, state.accessToken);
    assert(noTypeRes.status === 400, 'documentType olmadan yükleme reddedildi (400)', noTypeRes);

    // 2. Geçersiz documentType
    const invalidTypeForm = new FormData();
    invalidTypeForm.append('documentType', 'invalid_doc_type');
    invalidTypeForm.append('file', pdfBlob, 'doc.pdf');
    const invalidTypeRes = await api('POST', '/facilities/me/documents', invalidTypeForm, state.accessToken);
    assert(invalidTypeRes.status === 400, 'Bilinmeyen documentType ile yükleme reddedildi (400)');

    // 3. Desteklenmeyen dosya türü / MIME tipi (örn. text/plain)
    const txtBlob = new Blob(['plain text'], { type: 'text/plain' });
    const txtForm = new FormData();
    txtForm.append('documentType', 'tax_certificate');
    txtForm.append('file', txtBlob, 'doc.txt');
    const txtRes = await api('POST', '/facilities/me/documents', txtForm, state.accessToken);
    assert(txtRes.status === 400, 'Desteklenmeyen dosya türüyle (text/plain) yükleme reddedildi (400)');

    // 4. Dosya eki eksik
    const emptyForm = new FormData();
    emptyForm.append('documentType', 'tax_certificate');
    const emptyRes = await api('POST', '/facilities/me/documents', emptyForm, state.accessToken);
    assert(emptyRes.status === 400, 'Dosya olmadan yükleme reddedildi (400)');

    // 5. Yetkisiz belge listeleme
    const unauthDocs = await api('GET', '/facilities/me/documents');
    assert(unauthDocs.status === 401, 'Kimlik doğrulamasız belge listeleme engellendi (401)');
};
