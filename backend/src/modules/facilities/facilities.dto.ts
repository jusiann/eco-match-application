import { IsOptional, IsString, IsNotEmpty, IsObject, ValidateNested, IsLatitude, IsLongitude } from 'class-validator';
import { Type } from 'class-transformer';

export class LocationDto {
  @IsLatitude({ message: 'Geçersiz enlem (lat) değeri.' })
  lat: number;

  @IsLongitude({ message: 'Geçersiz boylam (lng) değeri.' })
  lng: number;
}

export class UpdateFacilityDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty({ message: 'Tesis adı boş olamaz.' })
  name?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty({ message: 'Sektör alanı boş olamaz.' })
  sector?: string;

  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => LocationDto)
  location?: LocationDto;
}
