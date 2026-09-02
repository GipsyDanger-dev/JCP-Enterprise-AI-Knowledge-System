import { SetMetadata } from '@nestjs/common';
import { GuardRole } from '../guards/roles.guard';

export const ROLES_KEY = 'roles';
export const Roles = (...roles: GuardRole[]) => SetMetadata(ROLES_KEY, roles);

/** Shortcut: only super admins (isAdmin = true) */
export const AdminOnly = () => Roles('admin');
