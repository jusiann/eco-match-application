import { IsEmail, IsNotEmpty, IsString, MinLength, MaxLength, Matches, IsOptional } from 'class-validator';

export class RegisterDto {
  @IsString()
  @IsNotEmpty({ message: 'Tesis adı (name) zorunludur.' })
  name: string; 

  @IsString()
  @IsNotEmpty({ message: 'Vergi numarası (taxId) zorunludur.' })
  taxId: string; 

  @IsString()
  @IsNotEmpty({ message: 'Sektör alanı zorunludur.' })
  sector: string;

  @IsEmail({}, { message: 'Geçersiz e-posta formatı. Lütfen geçerli bir e-posta adresi girin.' })
  email: string;

  @IsString()
  @MinLength(8, { message: 'Şifre en az 8 karakter uzunluğunda olmalıdır.' })
  @MaxLength(128, { message: 'Şifre en fazla 128 karakter olabilir.' })
  @Matches(/(?=.*[A-Z])/, { message: 'Şifre en az bir büyük harf içermelidir.' })
  @Matches(/(?=.*[a-z])/, { message: 'Şifre en az bir küçük harf içermelidir.' })
  @Matches(/(?=.*[0-9])/, { message: 'Şifre en az bir rakam içermelidir.' })
  password: string;
}

export class LoginDto {
  @IsEmail({}, { message: 'Geçersiz e-posta formatı.' })
  email: string;

  @IsString()
  @IsNotEmpty({ message: 'Şifre boş bırakılamaz.' })
  password: string;
}

export class UpdateProfileDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsEmail({}, { message: 'Geçersiz e-posta formatı.' })
  email?: string;

  @IsOptional()
  @IsString()
  @MinLength(8, { message: 'Şifre en az 8 karakter olmalıdır.' })
  password?: string;
}

export class RefreshDto {
  @IsString()
  @IsNotEmpty({ message: 'Oturum jetonu (refreshToken) zorunludur.' })
  refreshToken: string;
}

export class VerifyEmailDto {
  @IsString()
  @IsNotEmpty({ message: 'Doğrulama jetonu (token) zorunludur.' })
  token: string;
}
