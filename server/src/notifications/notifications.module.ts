import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AuthGuard } from '../auth/auth.guard';
import { jwtConstants } from '../auth/auth.constants';
import { NotificationsController } from './notifications.controller';

@Module({
  imports: [JwtModule.register({ secret: jwtConstants.secret })],
  controllers: [NotificationsController],
  providers: [AuthGuard],
})
export class NotificationsModule {}
