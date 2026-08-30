import { IsOptional, IsIn, IsNumber, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class ReportFormatQueryDto {
  @IsOptional()
  @IsIn(['json', 'pdf'])
  format?: 'json' | 'pdf';
}

export class ListReportsQueryDto {
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
