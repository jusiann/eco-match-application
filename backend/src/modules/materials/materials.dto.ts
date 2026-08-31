import { IsString, IsNotEmpty, IsOptional, IsIn, IsNumber, Min, IsObject, IsBoolean } from 'class-validator';
import { Type } from 'class-transformer';

export const MATERIAL_CLASSES = ['metal', 'plastic', 'organic', 'chemical', 'textile', 'glass', 'paper', 'other'];
export const FREQUENCIES = ['daily', 'weekly', 'monthly', 'one_time'];

export class CreateOutputDto {
  @IsString()
  @IsNotEmpty({ message: 'Açıklama (description) zorunludur.' })
  description: string;

  // Opsiyonel — boş bırakılırsa uzman incelemesi bekler (pendingReview=true), şemadaki
  // material_class NULL kolonuyla tutarlı (HITL akışı Faz 2'de bu alanı doldurur)
  @IsOptional()
  @IsIn(MATERIAL_CLASSES, { message: `materialClass şunlardan biri olmalıdır: ${MATERIAL_CLASSES.join(', ')}` })
  materialClass?: string;

  @IsOptional()
  @IsObject()
  composition?: Record<string, number>;

  @IsNumber({}, { message: 'quantityKg sayısal olmalıdır.' })
  @Min(0.01, { message: 'quantityKg 0dan büyük olmalıdır.' })
  quantityKg: number;

  @IsOptional()
  @IsNumber({}, { message: 'stock sayısal olmalıdır.' })
  @Min(0, { message: 'stock negatif olamaz.' })
  stock?: number;

  @IsOptional()
  @IsIn(FREQUENCIES, { message: `frequency şunlardan biri olmalıdır: ${FREQUENCIES.join(', ')}` })
  frequency?: string;

  // E3 katman 3: aynı facility + aynı description son 5 dakika içinde varsa 409
  // POSSIBLE_DUPLICATE döner (checkPossibleDuplicate, materials.service.ts). İstemci
  // kullanıcıya "emin misin" diyip true ile tekrar gönderir -- gerçekten aynı malzemeden
  // iki farklı parti olabilir (Faz 1.11, K-33).
  @IsOptional()
  @IsBoolean({ message: 'confirmDuplicate boolean olmalıdır.' })
  confirmDuplicate?: boolean;
}

export class UpdateOutputDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty({ message: 'Açıklama boş olamaz.' })
  description?: string;

  @IsOptional()
  @IsIn(MATERIAL_CLASSES, { message: `materialClass şunlardan biri olmalıdır: ${MATERIAL_CLASSES.join(', ')}` })
  materialClass?: string;

  @IsOptional()
  @IsObject()
  composition?: Record<string, number>;

  @IsOptional()
  @IsNumber({}, { message: 'quantityKg sayısal olmalıdır.' })
  @Min(0.01, { message: 'quantityKg 0dan büyük olmalıdır.' })
  quantityKg?: number;

  @IsOptional()
  @IsNumber({}, { message: 'stock sayısal olmalıdır.' })
  @Min(0, { message: 'stock negatif olamaz.' })
  stock?: number;

  @IsOptional()
  @IsIn(FREQUENCIES, { message: `frequency şunlardan biri olmalıdır: ${FREQUENCIES.join(', ')}` })
  frequency?: string;
}

export class CreateInputDto {
  @IsString()
  @IsNotEmpty({ message: 'Açıklama (description) zorunludur.' })
  description: string;

  @IsOptional()
  @IsIn(MATERIAL_CLASSES, { message: `materialClass şunlardan biri olmalıdır: ${MATERIAL_CLASSES.join(', ')}` })
  materialClass?: string;

  @IsOptional()
  @IsObject()
  specs?: Record<string, unknown>;

  @IsNumber({}, { message: 'quantityKg sayısal olmalıdır.' })
  @Min(0.01, { message: 'quantityKg 0dan büyük olmalıdır.' })
  quantityKg: number;

  @IsOptional()
  @IsIn(FREQUENCIES, { message: `frequency şunlardan biri olmalıdır: ${FREQUENCIES.join(', ')}` })
  frequency?: string;

  // bkz. CreateOutputDto.confirmDuplicate (Faz 1.11, K-33)
  @IsOptional()
  @IsBoolean({ message: 'confirmDuplicate boolean olmalıdır.' })
  confirmDuplicate?: boolean;
}

export class UpdateInputDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty({ message: 'Açıklama boş olamaz.' })
  description?: string;

  @IsOptional()
  @IsIn(MATERIAL_CLASSES, { message: `materialClass şunlardan biri olmalıdır: ${MATERIAL_CLASSES.join(', ')}` })
  materialClass?: string;

  @IsOptional()
  @IsObject()
  specs?: Record<string, unknown>;

  @IsOptional()
  @IsNumber({}, { message: 'quantityKg sayısal olmalıdır.' })
  @Min(0.01, { message: 'quantityKg 0dan büyük olmalıdır.' })
  quantityKg?: number;

  @IsOptional()
  @IsIn(FREQUENCIES, { message: `frequency şunlardan biri olmalıdır: ${FREQUENCIES.join(', ')}` })
  frequency?: string;
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
