import { Injectable, NotFoundException } from '@nestjs/common';
import { MatchStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { SensorReadingDto } from './iot.dto';

// docs/06 I1 örneği stock'un 250'den 90'a düşünce "düşük" sayıldığını gösteriyor ama tam
// bir oran/eşik vermiyor -- scoring.service.ts'teki malzeme fiyatı tablosu gibi açıkça
// yer tutucu bir iş kuralı: orijinal quantityKg'nin %20'si.
const LOW_STOCK_RATIO = 0.2;

const HEARTBEAT_STALE_MINUTES = 30; // I2: "30 dakikadır veri yoksa"

@Injectable()
export class IotService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
  ) {}

  async ingest(apiKeyFacilityId: string, dto: SensorReadingDto) {
    const output = await this.prisma.output.findUnique({
      where: { id: dto.outputId },
      include: { facility: { include: { users: true } } },
    });
    // Sensör başka bir tesisin çıktısını güncelleyemez -- var olan tesis/eşleşme kalıplarıyla
    // aynı gizlilik yaklaşımı: 404, kaydın var olduğunu bile sızdırma.
    if (!output || output.facilityId !== apiKeyFacilityId) {
      throw new NotFoundException('Çıktı bulunamadı.');
    }

    const timestamp = dto.timestamp ? new Date(dto.timestamp) : new Date();
    await this.prisma.sensorData.create({
      data: {
        facilityId: apiKeyFacilityId,
        outputId: output.id,
        sensorType: dto.sensorType ?? 'tank_level',
        value: dto.levelKg,
        unit: 'kg',
        timestamp,
      },
    });

    const threshold = Number(output.quantityKg) * LOW_STOCK_RATIO;
    const wasAvailable = output.availability;
    const nowAvailable = dto.levelKg > threshold;

    await this.prisma.output.update({ where: { id: output.id }, data: { stock: dto.levelKg, availability: nowAvailable } });

    const owner = output.facility.users.find((u) => u.role === 'FACILITY_ADMIN');
    if (wasAvailable && !nowAvailable && owner) {
      await this.notificationsService.create(
        owner.id,
        'low_stock',
        'Stok seviyesi düşük',
        `${output.description} için stok %20 eşiğinin altına düştü (${dto.levelKg} kg).`,
        { output_id: output.id },
      );
    }

    if (dto.levelKg === 0) {
      const activeMatches = await this.prisma.match.findMany({
        where: { outputId: output.id, status: { in: [MatchStatus.PENDING, MatchStatus.ACCEPTED] } },
        include: { input: { include: { facility: { include: { users: true } } } } },
      });
      for (const match of activeMatches) {
        const consumerOwner = match.input.facility.users.find((u) => u.role === 'FACILITY_ADMIN');
        if (consumerOwner) {
          await this.notificationsService.create(
            consumerOwner.id,
            'output_depleted',
            'Eşleşmenizdeki çıktı tükendi',
            `${output.description} stoku tükendi, tedarikçiyle iletişime geçmeniz gerekebilir.`,
            { output_id: output.id, match_id: match.id },
          );
        }
      }
    }

    return { success: true, stock: dto.levelKg, availability: nowAvailable };
  }

  // I2: 5 dakikada bir çağrılır (manuel tetikleme: POST /admin/cron/iot-heartbeat).
  // "Offline"/"online" ayrı bir durum kolonunda tutulmuyor -- en son gönderilen
  // sensor_offline/sensor_online bildirimi mevcut bilinen durumu temsil ediyor, sunucu
  // yeniden başlasa bile kaybolmayan (K-22'nin process-içi Map'inin aksine) bir yaklaşım.
  async checkHeartbeats(): Promise<{ offline: number; online: number }> {
    const staleCutoff = new Date(Date.now() - HEARTBEAT_STALE_MINUTES * 60 * 1000);

    const facilitiesWithSensors = await this.prisma.sensorData.groupBy({
      by: ['facilityId'],
    });

    let offline = 0;
    let online = 0;

    for (const { facilityId } of facilitiesWithSensors) {
      const [latestReading, facility] = await Promise.all([
        this.prisma.sensorData.findFirst({ where: { facilityId }, orderBy: { timestamp: 'desc' } }),
        this.prisma.facility.findUnique({ where: { id: facilityId }, include: { users: true } }),
      ]);
      if (!latestReading || !facility) continue;

      const isStale = latestReading.timestamp < staleCutoff;
      const owner = facility.users.find((u) => u.role === 'FACILITY_ADMIN');
      if (!owner) continue;

      const lastStatusNotification = await this.prisma.notification.findFirst({
        where: { userId: owner.id, type: { in: ['sensor_offline', 'sensor_online'] } },
        orderBy: { createdAt: 'desc' },
      });
      const currentlyKnownOffline = lastStatusNotification?.type === 'sensor_offline';

      if (isStale && !currentlyKnownOffline) {
        await this.notificationsService.create(
          owner.id,
          'sensor_offline',
          'Sensör bağlantısı kesildi',
          `${facility.name} tesisindeki sensörden ${HEARTBEAT_STALE_MINUTES} dakikadır veri gelmiyor. Manuel stok güncellemeye dönmeniz önerilir.`,
          { facility_id: facilityId },
        );
        offline++;
      } else if (!isStale && currentlyKnownOffline) {
        await this.notificationsService.create(
          owner.id,
          'sensor_online',
          'Sensör bağlantısı geri geldi',
          `${facility.name} tesisindeki sensör tekrar veri göndermeye başladı, otomatik mod devam ediyor.`,
          { facility_id: facilityId },
        );
        online++;
      }
    }

    return { offline, online };
  }
}
