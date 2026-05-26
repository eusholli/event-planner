-- Create the read_only_agent role if it does not already exist.
-- This role is used by the MCP execute_read_only_sql tool to safely expose
-- event-domain data to the LLM orchestrator without mutation risk.
--
-- NOTE: This creates the role WITHOUT LOGIN. After first deploy, enable login manually:
--   ALTER ROLE read_only_agent WITH LOGIN PASSWORD 'yourpassword';
-- Then set READ_ONLY_DATABASE_URL=postgresql://read_only_agent:yourpassword@host/db
-- in the event-planner container environment.
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'read_only_agent') THEN
    CREATE ROLE read_only_agent WITH NOLOGIN;
  END IF;
END
$$;

-- Allow the role to resolve names in the public schema.
-- Required in PostgreSQL 15+: USAGE is no longer granted to PUBLIC by default.
GRANT USAGE ON SCHEMA public TO read_only_agent;

-- Grant SELECT on event-domain tables only.
-- Excluded (sensitive/auth): ViberUser, ViberLinkCode, UserProfile, AILog,
-- IntelligenceEmailLog, IntelligenceSubscription, IntelligenceSubAttendee,
-- IntelligenceSubCompany, IntelligenceSubEvent.
GRANT SELECT ON TABLE "Event"                    TO read_only_agent;
GRANT SELECT ON TABLE "Attendee"                 TO read_only_agent;
GRANT SELECT ON TABLE "Company"                  TO read_only_agent;
GRANT SELECT ON TABLE "Meeting"                  TO read_only_agent;
GRANT SELECT ON TABLE "Room"                     TO read_only_agent;
GRANT SELECT ON TABLE "Pitch"                    TO read_only_agent;
GRANT SELECT ON TABLE "PitchAttendee"            TO read_only_agent;
GRANT SELECT ON TABLE "EventROITargets"          TO read_only_agent;
GRANT SELECT ON TABLE "EventMarketingChecklist"  TO read_only_agent;
GRANT SELECT ON TABLE "LinkedInDraft"            TO read_only_agent;
GRANT SELECT ON TABLE "IntelligenceReport"       TO read_only_agent;
GRANT SELECT ON TABLE "SystemSettings"           TO read_only_agent;