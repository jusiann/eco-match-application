import { IsIn, IsOptional, IsString, IsNotEmpty, IsNumber, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';
import { MATERIAL_CLASSES } from '../materials/materials.dto';

export class ApproveReviewDto {
  @IsIn(MATERIAL_CLASSES, { message: `materialClass şunlardan biri olmalıdır: ${MATERIAL_CLASSES.join(', ')}` })
  materialClass: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class RejectReviewDto {
  @IsString()
  @IsNotEmpty({ message: 'notes zorunludur.' })
  notes: string;
}

export class ReviewQueueListQueryDto {
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
  @IsString()
  sector?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(1)
  minConfidence?: number;
}
