import { IsIn, IsOptional, IsString, IsNotEmpty, IsNumber, Min } from 'class-validator';
import { Type } from 'class-transformer';

export const REJECTION_CATEGORIES = [
  'distance_too_far',
  'quantity_mismatch',
  'quality_insufficient',
  'price_too_low',
  'timing_unsuitable',
  'other',
];

export const MATCH_STATUSES = ['pending', 'accepted', 'completed', 'rejected', 'expired'];

export class RejectMatchDto {
  @IsIn(REJECTION_CATEGORIES, { message: `reasonCategory şunlardan biri olmalıdır: ${REJECTION_CATEGORIES.join(', ')}` })
  reasonCategory: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  reasonText?: string;
}

export class MatchListQueryDto {
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
  @IsIn(MATCH_STATUSES, { message: `status şunlardan biri olmalıdır: ${MATCH_STATUSES.join(', ')}` })
  status?: string;
}
