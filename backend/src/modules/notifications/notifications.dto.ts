import { IsOptional, IsBoolean, IsNumber, Min } from 'class-validator';
import { Type } from 'class-transformer';

// docs/04: bu tipler için inApp kapatılamaz -- kullanıcı kritik akışlardan habersiz kalmamalı
export const MANDATORY_NOTIFICATION_TYPES = ['match_pending_your_approval', 'match_completed', 'review_required'];

export class ListNotificationsQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  limit?: number;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  unread?: boolean;
}

export interface PrefEntry {
  inApp: boolean;
  email: boolean;
  push: boolean;
}

// { "<type>": { inApp, email, push }, ... } -- anahtarlar serbest bildirim tipleri olduğu
// için class-validator decorator'larıyla tanımlanamıyor (global ValidationPipe'ın
// forbidNonWhitelisted ayarı tüm alanları sessizce silerdi). Doğrulama servis içinde
// elle yapılıyor -- bu tek endpoint için bilinçli bir sapma.
export type UpdatePrefsBody = Record<string, PrefEntry>;
