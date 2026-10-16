import { Prisma } from '../../generated/prisma/client';

// All parameters are bound. Only grouped projections leave PostgreSQL. Each
// catalog section is capped independently, with its full group count disclosed.
export function analyticsSql(from: Date, to: Date) {
  return Prisma.sql`
WITH active AS MATERIALIZED (
  SELECT id, "categoryId", "assignedTeamId", "assignedAgentId", status, "createdAt", "allRegions", "allDepartments"
  FROM "Ticket" WHERE status IN ('NEW','ASSIGNED','IN_PROGRESS','WAITING_FOR_EMPLOYEE','BLOCKED') AND "createdAt" < ${to}
), created AS MATERIALIZED (
  SELECT id, "categoryId", "allRegions", "allDepartments", "createdAt" FROM "Ticket"
  WHERE "createdAt" >= ${from} AND "createdAt" < ${to}
), resolved AS MATERIALIZED (
  SELECT "ticketId", "startedAt", "endedAt" FROM "TicketWorkCycle"
  WHERE outcome IN ('RESOLVED','CLOSED') AND "endedAt" >= ${from} AND "endedAt" < ${to}
), closed AS MATERIALIZED (
  SELECT "closedAt" FROM "TicketWorkCycle" WHERE "closedAt" >= ${from} AND "closedAt" < ${to}
), reopened AS MATERIALIZED (
  SELECT "ticketId" FROM "TicketWorkCycle" WHERE type = 'REOPENED' AND "startedAt" >= ${from} AND "startedAt" < ${to}
), facts AS MATERIALIZED (
  SELECT id, "categoryId", "allRegions", "allDepartments", 1 AS created, 0 AS open, 0 AS reopened FROM created
  UNION ALL SELECT id, "categoryId", "allRegions", "allDepartments", 0, 1, 0 FROM active
  UNION ALL SELECT t.id, t."categoryId", t."allRegions", t."allDepartments", 0, 0, 1
    FROM "Ticket" t JOIN (SELECT DISTINCT "ticketId" FROM reopened) r ON r."ticketId" = t.id
), dimensions AS (
  SELECT 'categories' AS kind, c.id::text AS key, c.name, c."archivedAt" IS NOT NULL AS archived, f.created, f.open, f.reopened
  FROM facts f JOIN "TicketCategory" c ON c.id = f."categoryId"
  UNION ALL SELECT 'tags', g.id::text, g.name, g."archivedAt" IS NOT NULL, f.created, f.open, f.reopened
    FROM facts f JOIN "TicketTagOnTicket" j ON j."ticketId" = f.id JOIN "TicketTag" g ON g.id = j."tagId"
  UNION ALL SELECT 'combinations', c.id::text || ':' || g.id::text, c.name || ' + ' || g.name,
    c."archivedAt" IS NOT NULL OR g."archivedAt" IS NOT NULL, f.created, f.open, f.reopened
    FROM facts f JOIN "TicketCategory" c ON c.id = f."categoryId"
    JOIN "TicketTagOnTicket" j ON j."ticketId" = f.id JOIN "TicketTag" g ON g.id = j."tagId"
  UNION ALL SELECT 'regions', COALESCE(r.id::text, CASE WHEN f."allRegions" THEN 'all' ELSE 'unspecified' END),
    CASE WHEN f."allRegions" THEN 'All regions' ELSE COALESCE(r.name, 'Unspecified region') END,
    COALESCE(r."archivedAt" IS NOT NULL, false), f.created, f.open, f.reopened
    FROM facts f LEFT JOIN "TicketRegion" j ON j."ticketId" = f.id AND NOT f."allRegions"
    LEFT JOIN "Region" r ON r.id = j."regionId"
  UNION ALL SELECT 'departments', COALESCE(d.id::text, CASE WHEN f."allDepartments" THEN 'all' ELSE 'unspecified' END),
    CASE WHEN f."allDepartments" THEN 'All departments' ELSE COALESCE(d.name, 'Unspecified department') END,
    COALESCE(d."archivedAt" IS NOT NULL, false), f.created, f.open, f.reopened
    FROM facts f LEFT JOIN "TicketDepartment" j ON j."ticketId" = f.id AND NOT f."allDepartments"
    LEFT JOIN "Department" d ON d.id = j."departmentId"
), grouped AS (
  SELECT kind, key, name, archived, sum(created)::int AS created, sum(open)::int AS open, sum(reopened)::int AS reopened
  FROM dimensions GROUP BY kind, key, name, archived
), ranked AS (
  SELECT *, row_number() OVER (PARTITION BY kind ORDER BY created DESC, open DESC, reopened DESC, key) AS rank,
    count(*) OVER (PARTITION BY kind)::int AS total FROM grouped
), eligible AS MATERIALIZED (
  SELECT m."teamId", m."userId" FROM "TeamMember" m JOIN "User" u ON u.id = m."userId"
  JOIN "Team" t ON t.id = m."teamId" AND t."archivedAt" IS NULL
  WHERE u.role = 'AGENT' AND u.status = 'ACTIVE' AND u."activatedAt" IS NOT NULL
), team_work AS (
  SELECT "assignedTeamId" AS id, count(*)::int AS open,
    count(*) FILTER (WHERE "assignedAgentId" IS NULL)::int AS "awaitingAgent"
  FROM active GROUP BY "assignedTeamId"
), team_capacity AS (
  SELECT "teamId" AS id, count(*)::int AS "eligibleAgents" FROM eligible GROUP BY "teamId"
), team_rows AS (
  SELECT t.id, t.name, t.scope, r.name AS region,
    COALESCE(w.open, 0) AS open, COALESCE(w."awaitingAgent", 0) AS "awaitingAgent", COALESCE(c."eligibleAgents", 0) AS "eligibleAgents"
  FROM "Team" t LEFT JOIN "Region" r ON r.id = t."regionId"
  LEFT JOIN team_work w ON w.id = t.id LEFT JOIN team_capacity c ON c.id = t.id WHERE t."archivedAt" IS NULL
), specialty_teams AS (
  SELECT ts."specialtyId" AS id, count(*)::int AS teams
  FROM "TeamSpecialty" ts JOIN "Team" t ON t.id = ts."teamId" AND t."archivedAt" IS NULL GROUP BY ts."specialtyId"
), specialty_capacity AS (
  SELECT us."specialtyId" AS id, count(DISTINCT e."userId")::int AS "eligibleAgents"
  FROM eligible e JOIN "UserSpecialty" us ON us."userId" = e."userId"
  JOIN "TeamSpecialty" ts ON ts."teamId" = e."teamId" AND ts."specialtyId" = us."specialtyId" GROUP BY us."specialtyId"
), specialty_work AS (
  SELECT ts."specialtyId" AS id,
    count(a.id)::int AS open, count(a.id) FILTER (WHERE a.status = 'BLOCKED')::int AS blocked,
    count(a.id) FILTER (WHERE a."assignedAgentId" IS NULL)::int AS "awaitingAgent"
  FROM "TeamSpecialty" ts JOIN "Team" t ON t.id = ts."teamId" AND t."archivedAt" IS NULL
  JOIN active a ON a."assignedTeamId" = t.id GROUP BY ts."specialtyId"
), expertise_rows AS (
  SELECT s.id, s.name, COALESCE(t.teams, 0) AS teams, COALESCE(c."eligibleAgents", 0) AS "eligibleAgents",
    COALESCE(w.open, 0) AS open, COALESCE(w.blocked, 0) AS blocked, COALESCE(w."awaitingAgent", 0) AS "awaitingAgent"
  FROM "Specialty" s LEFT JOIN specialty_teams t ON t.id = s.id
  LEFT JOIN specialty_capacity c ON c.id = s.id LEFT JOIN specialty_work w ON w.id = s.id WHERE s."archivedAt" IS NULL
), events AS (
  SELECT "createdAt"::date AS day, 1 AS created, 0 AS resolved, 0 AS closed FROM created
  UNION ALL SELECT "endedAt"::date, 0, 1, 0 FROM resolved
  UNION ALL SELECT "closedAt"::date, 0, 0, 1 FROM closed
), days AS (
  SELECT generate_series(${from}::timestamp::date, ${to}::timestamp::date, interval '1 day')::date AS day
), ages AS (
  SELECT CASE WHEN "createdAt" > ${to}::timestamp - interval '1 day' THEN 0
    WHEN "createdAt" > ${to}::timestamp - interval '3 days' THEN 1
    WHEN "createdAt" > ${to}::timestamp - interval '7 days' THEN 2
    WHEN "createdAt" > ${to}::timestamp - interval '14 days' THEN 3 ELSE 4 END AS bucket FROM active
)
SELECT jsonb_build_object(
  'current', jsonb_build_object('open', (SELECT count(*) FROM active),
    'awaitingTeam', (SELECT count(*) FROM active WHERE "assignedTeamId" IS NULL),
    'awaitingAgent', (SELECT count(*) FROM active WHERE "assignedTeamId" IS NOT NULL AND "assignedAgentId" IS NULL),
    'statuses', (SELECT jsonb_agg(jsonb_build_object('status', s, 'count', (SELECT count(*) FROM active WHERE status::text = s)))
      FROM unnest(ARRAY['NEW','ASSIGNED','IN_PROGRESS','WAITING_FOR_EMPLOYEE','BLOCKED']) s)),
  'period', jsonb_build_object('created', (SELECT count(*) FROM created), 'resolved', (SELECT count(*) FROM resolved),
    'closed', (SELECT count(*) FROM closed), 'reopenedTickets', (SELECT count(DISTINCT "ticketId") FROM reopened), 'reopenEvents', (SELECT count(*) FROM reopened)),
  'resolution', (SELECT jsonb_build_object('eligibleCycles', count(*),
    'medianHours', percentile_cont(0.5) WITHIN GROUP (ORDER BY extract(epoch FROM ("endedAt" - "startedAt")) / 3600),
    'p90Hours', percentile_cont(0.9) WITHIN GROUP (ORDER BY extract(epoch FROM ("endedAt" - "startedAt")) / 3600)) FROM resolved WHERE "endedAt" >= "startedAt"),
  'trend', (SELECT jsonb_agg(jsonb_build_object('date', day::text, 'created', created, 'resolved', resolved, 'closed', closed) ORDER BY day)
    FROM (SELECT d.day, COALESCE(sum(e.created),0) AS created, COALESCE(sum(e.resolved),0) AS resolved, COALESCE(sum(e.closed),0) AS closed
    FROM days d LEFT JOIN events e ON e.day = d.day GROUP BY d.day) v),
  'aging', (SELECT jsonb_agg(jsonb_build_object('bucket', label, 'count', (SELECT count(*) FROM ages WHERE bucket = idx)) ORDER BY idx)
    FROM (VALUES (0,'Under 1 day'),(1,'1–3 days'),(2,'3–7 days'),(3,'7–14 days'),(4,'14+ days')) b(idx,label)),
  'groups', (SELECT jsonb_object_agg(kind, jsonb_build_object('rows', COALESCE((SELECT jsonb_agg(jsonb_build_object('name', name, 'archived', archived,
    'created', created, 'open', open, 'reopened', reopened) ORDER BY rank) FROM ranked r WHERE r.kind = k.kind AND rank <= 50),'[]'::jsonb),
    'totalGroups', COALESCE((SELECT max(total) FROM ranked r WHERE r.kind = k.kind),0)))
    FROM unnest(ARRAY['categories','tags','regions','departments','combinations']) k(kind)),
  'teams', jsonb_build_object('totalGroups', (SELECT count(*) FROM team_rows), 'rows', COALESCE((SELECT jsonb_agg(jsonb_build_object(
    'name', name, 'scope', scope, 'region', region, 'open', open, 'awaitingAgent', "awaitingAgent", 'eligibleAgents', "eligibleAgents",
    'ticketsPerAgent', CASE WHEN "eligibleAgents" > 0 THEN round(open::numeric / "eligibleAgents", 2) ELSE NULL END) ORDER BY open DESC, id)
    FROM (SELECT * FROM team_rows ORDER BY open DESC, id LIMIT 50) t),'[]'::jsonb)),
  'expertise', jsonb_build_object('totalGroups', (SELECT count(*) FROM expertise_rows), 'rows', COALESCE((SELECT jsonb_agg(jsonb_build_object(
    'name', name, 'teams', teams, 'eligibleAgents', "eligibleAgents", 'open', open, 'blocked', blocked, 'awaitingAgent', "awaitingAgent") ORDER BY open DESC, id)
    FROM (SELECT * FROM expertise_rows ORDER BY open DESC, id LIMIT 50) s),'[]'::jsonb))
) AS data`;
}
