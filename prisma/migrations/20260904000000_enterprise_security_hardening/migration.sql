-- Platform roles must be persistable so production authorization derives them from the user row.
ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'SUPER_ADMIN';
ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'PLATFORM_ADMIN';
ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'PLATFORM_OPERATOR';
