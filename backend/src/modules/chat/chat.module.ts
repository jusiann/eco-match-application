import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ChatController } from './chat.controller';
import { ChatService } from './chat.service';
import { ClaudeClientService } from './claude-client.service';

@Module({
  imports: [AuthModule],
  controllers: [ChatController],
  providers: [ChatService, ClaudeClientService],
})
export class ChatModule {}
