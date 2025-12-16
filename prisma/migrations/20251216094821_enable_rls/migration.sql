-- Enable RLS on tables
ALTER TABLE "Meeting" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "EventSettings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Room" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "_AttendeeMeetings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Attendee" ENABLE ROW LEVEL SECURITY;

-- Create policies to allow access to service_role (just in case they are needed for Supabase features)
-- We grant all on these tables to service_role