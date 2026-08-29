import { IsString, IsNotEmpty } from 'class-validator';

export class RejectVerificationDto {
  @IsString()
  @IsNotEmpty({ message: 'Red gerekçesi (reason) zorunludur.' })
  reason: string;
}
