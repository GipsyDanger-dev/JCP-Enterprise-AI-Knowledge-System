-- Enum values must be committed before a later migration can use them.
ALTER TYPE "UserRole" ADD VALUE 'SUPER_ADMIN';
ALTER TYPE "UserRole" ADD VALUE 'BENDAHARA';
ALTER TYPE "UserRole" ADD VALUE 'SEKRETARIS';
ALTER TYPE "UserRole" ADD VALUE 'OPERASIONAL';
ALTER TYPE "UserRole" ADD VALUE 'HUMAS';
