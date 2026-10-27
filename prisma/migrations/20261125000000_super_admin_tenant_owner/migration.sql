-- Elevate existing super admins to owners in all their tenant memberships
UPDATE "Membership"
SET "role" = 'owner'
WHERE "userId" IN (SELECT "id" FROM "User" WHERE "role" = 'super_admin');

-- Ensure all super admins are owners of the default 'zedu' tenant if it exists
INSERT INTO "Membership" ("id", "tenantId", "userId", "role", "createdAt")
SELECT
    'mem_zedu_' || u."id",
    t."id",
    u."id",
    'owner'::"MembershipRole",
    NOW()
FROM "User" u
CROSS JOIN "Tenant" t
WHERE u."role" = 'super_admin' AND t."slug" = 'zedu'
ON CONFLICT ("tenantId", "userId") DO UPDATE SET "role" = 'owner';
