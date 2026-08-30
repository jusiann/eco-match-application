import { IsString, IsNotEmpty, MinLength, MaxLength } from 'class-validator';

export class ClassifyDto {
  @IsString()
  @IsNotEmpty({ message: 'Açıklama (description) zorunludur.' })
  @MinLength(1, { message: 'Açıklama en az 1 karakter olmalıdır.' })
  @MaxLength(5000, { message: 'Açıklama en fazla 5000 karakter olabilir.' })
  description: string;
}
