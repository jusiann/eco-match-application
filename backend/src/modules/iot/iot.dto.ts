import { IsUUID, IsNumber, Min, IsOptional, IsString, IsISO8601 } from 'class-validator';

// I1: sensör "facility/xyz/tank/A" -> {"level_kg": 750, "timestamp": "..."} yayınlıyor.
// Gerçek MQTT abonesi (Mosquitto, opsiyonel altyapı) henüz bağlı değil (Faz 3.7, K-32) -- bu
// endpoint, bir MQTT<->HTTP köprüsünün (veya sensörün doğrudan) çağıracağı gerçek alım
// (ingestion) mantığını taşıyor; sadece taşıma katmanı (MQTT) yerine HTTP+API key kullanıyor.
export class SensorReadingDto {
  @IsUUID('4', { message: 'Geçersiz outputId.' })
  outputId: string;

  @IsNumber({}, { message: 'levelKg sayısal olmalıdır.' })
  @Min(0, { message: 'levelKg negatif olamaz.' })
  levelKg: number;

  @IsOptional()
  @IsString()
  sensorType?: string;

  @IsOptional()
  @IsISO8601({}, { message: 'timestamp ISO-8601 formatında olmalıdır.' })
  timestamp?: string;
}
