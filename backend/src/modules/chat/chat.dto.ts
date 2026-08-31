import { IsString, IsNotEmpty, MaxLength, IsOptional, IsUUID, IsNumber, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class ChatMessageDto {
  @IsString()
  @IsNotEmpty({ message: 'message zorunludur.' })
  @MaxLength(2000, { message: 'message en fazla 2000 karakter olabilir (docs/06 S6).' })
  message: string;

  // Verilmezse yeni bir konuşma (session) başlatılır -- devam eden bir konuşmaya
  // mesaj eklemek için istemci ilk yanıttan aldığı sessionId'yi geri gönderir.
  @IsOptional()
  @IsUUID('4', { message: 'Geçersiz sessionId.' })
  sessionId?: string;
}

export class ChatHistoryQueryDto {
  @IsOptional()
  @IsUUID('4', { message: 'Geçersiz sessionId.' })
  sessionId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  limit?: number;
}
