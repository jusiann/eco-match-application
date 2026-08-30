import { IsString, IsNotEmpty, IsEmail, IsIn, IsOptional, MinLength, MaxLength, IsUUID, IsNumber, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';
import { UserRole } from '@prisma/client';
import { MATERIAL_CLASSES } from '../materials/materials.dto';

export class RejectVerificationDto {
  @IsString()
  @IsNotEmpty({ message: 'Red gerekçesi (reason) zorunludur.' })
  reason: string;
}

const ROLES = Object.values(UserRole);
const FACTOR_TYPES = ['virgin', 'secondary', 'transport'];

export class CreateCarbonFactorDto {
  @IsIn(MATERIAL_CLASSES, { message: `materialClass şunlardan biri olmalıdır: ${MATERIAL_CLASSES.join(', ')}` })
  materialClass: string;

  @IsIn(FACTOR_TYPES, { message: `factorType şunlardan biri olmalıdır: ${FACTOR_TYPES.join(', ')}` })
  factorType: string;

  @IsNumber({}, { message: 'co2PerKg sayısal olmalıdır.' })
  @Min(0, { message: 'co2PerKg negatif olamaz.' })
  co2PerKg: number;

  @IsString()
  @IsNotEmpty({ message: 'source (kaynak) zorunludur.' })
  source: string;

  @IsOptional()
  @IsString()
  validFrom?: string; // ISO tarih, verilmezse bugün
}

export class CreateUserDto {
  @IsEmail({}, { message: 'Geçersiz e-posta formatı.' })
  email: string;

  @IsString()
  @MinLength(8, { message: 'Şifre en az 8 karakter olmalıdır.' })
  @MaxLength(128)
  password: string;

  @IsIn(ROLES, { message: `role şunlardan biri olmalıdır: ${ROLES.join(', ')}` })
  role: string;

  @IsUUID('4', { message: 'Geçersiz tesis kimliği.' })
  facilityId: string;

  @IsOptional()
  @IsString()
  contactName?: string;

  @IsOptional()
  @IsString()
  phone?: string;
}

export class UpdateUserDto {
  @IsOptional()
  @IsIn(ROLES, { message: `role şunlardan biri olmalıdır: ${ROLES.join(', ')}` })
  role?: string;

  @IsOptional()
  @IsString()
  contactName?: string;

  @IsOptional()
  @IsString()
  phone?: string;
}

export class ListQueryDto {
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
}

export class AuditLogQueryDto extends ListQueryDto {
  @IsOptional()
  @IsString()
  entity?: string;

  @IsOptional()
  @IsUUID('4')
  entityId?: string;
}

// { "match.threshold": 0.65, ... } -- anahtarlar system_config.key'ler, sabit bir DTO
// şekli yok (bkz. notifications/notifications.dto.ts'teki aynı sapma gerekçesi)
export type UpdateConfigBody = Record<string, unknown>;
