import { UserRole } from '@prisma/client';

export const ADMIN_ROLE_VALUES: UserRole[] = [UserRole.ADMIN, UserRole.SUPER_ADMIN];

export function isAdminRole(role: UserRole): boolean {
  return ADMIN_ROLE_VALUES.includes(role);
}

export function isEmployeeRole(role: UserRole): boolean {
  return !isAdminRole(role);
}
