-- Explicit access overrides in both directions.
--
-- UserApplication.effect: ALLOW (a normal grant) or DENY (an explicit block
-- for one user on one application).
-- RoleApplication.effect: ALLOW or DENY for a whole primary role.
-- RoleApplication.overrideUsers: when true the role rule wins over a direct
-- per-user row; when false (the default, and the behaviour before this
-- migration) the direct per-user row wins.

ALTER TABLE "UserApplication"
  ADD COLUMN "effect" TEXT NOT NULL DEFAULT 'ALLOW';

ALTER TABLE "RoleApplication"
  ADD COLUMN "effect" TEXT NOT NULL DEFAULT 'ALLOW',
  ADD COLUMN "overrideUsers" BOOLEAN NOT NULL DEFAULT false;
