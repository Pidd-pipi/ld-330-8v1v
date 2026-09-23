import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AuthController } from './auth/auth.controller';
import { AuthService } from './auth/auth.service';
import { AuditService } from './common/audit.service';
import { DatabaseService } from './common/database.service';
import { HealthController } from './common/health.controller';
import { PrescriptionsController } from './prescriptions/prescriptions.controller';
import { PrescriptionsService } from './prescriptions/prescriptions.service';
import { RecordsController } from './records/records.controller';
import { RecordsService } from './records/records.service';

@Module({
  imports: [
    JwtModule.register({
      secret: process.env.JWT_SECRET ?? 'local_dev_secret',
      signOptions: { expiresIn: '8h' },
    }),
  ],
  controllers: [HealthController, AuthController, RecordsController, PrescriptionsController],
  providers: [AuthService, DatabaseService, AuditService, RecordsService, PrescriptionsService],
})
export class AppModule {}
