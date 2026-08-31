import { Global, Module } from '@nestjs/common';
import { JwtModule, JwtSignOptions } from '@nestjs/jwt';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { RolesGuard } from './guards/roles.guard';

function requiredJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('JWT_SECRET is required');
  return secret;
}

// Default 24 jam, sama dengan .env.example dan DEPLOYMENT.md. Belum ada refresh
// token, jadi masa berlaku yang lebih pendek memutus sesi pengguna di tengah kerja.
const expiresIn = (process.env.JWT_EXPIRES_IN ?? '24h') as JwtSignOptions['expiresIn'];

@Global()
@Module({
  imports: [
    JwtModule.register({
      global: true,
      secret: requiredJwtSecret(),
      signOptions: { expiresIn },
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtAuthGuard, RolesGuard],
  exports: [AuthService, JwtAuthGuard, RolesGuard],
})
export class AuthModule {}

