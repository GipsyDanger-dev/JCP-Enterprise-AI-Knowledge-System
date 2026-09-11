import { Module } from '@nestjs/common';
import { OrganizationModule } from '../organization/organization.module';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

@Module({
  // Nama role di form pembuatan akun dibaca dari sumber yang sama dengan
  // halaman pengelolanya, supaya tidak ada dua salinan istilah yang bisa beda.
  imports: [OrganizationModule],
  controllers: [UsersController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
