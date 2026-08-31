import { IsOptional, IsString, IsIn, Matches } from 'class-validator';

export class OsbFacilitiesQueryDto {
  @IsOptional()
  @IsString()
  sector?: string;
}

const FORMATS = ['pdf', 'xlsx'];

export class OsbMonthlyReportQueryDto {
  // "2026-08" formatı (docs/04 & AD4)
  @Matches(/^\d{4}-(0[1-9]|1[0-2])$/, { message: 'period YYYY-MM formatında olmalıdır (ör. 2026-08).' })
  period: string;

  @IsOptional()
  @IsIn(FORMATS, { message: `format şunlardan biri olmalıdır: ${FORMATS.join(', ')}` })
  format?: string;
}
