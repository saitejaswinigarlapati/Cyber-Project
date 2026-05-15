-- SQL Setup for Collaborative File Sharing
-- Run this in your Supabase SQL Editor

-- 1. Create file_shares table
CREATE TABLE IF NOT EXISTS public.file_shares (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    file_id UUID NOT NULL REFERENCES public.files(id) ON DELETE CASCADE,
    shared_by UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    shared_with_email TEXT NOT NULL,
    shared_with_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
    permission TEXT DEFAULT 'view' CHECK (permission IN ('view', 'edit')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(file_id, shared_with_email)
);

-- 1a. Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_file_shares_email ON public.file_shares(LOWER(shared_with_email));
CREATE INDEX IF NOT EXISTS idx_file_shares_recipient_id ON public.file_shares(shared_with_id);
CREATE INDEX IF NOT EXISTS idx_file_shares_file_id ON public.file_shares(file_id);

-- 2. Add RLS to file_shares
ALTER TABLE public.file_shares ENABLE ROW LEVEL SECURITY;

-- Cleanup existing policies to avoid conflicts
DROP POLICY IF EXISTS "Owners can view their shares" ON public.file_shares;
DROP POLICY IF EXISTS "Recipients can view their shares" ON public.file_shares;
DROP POLICY IF EXISTS "Owners can create shares" ON public.file_shares;
DROP POLICY IF EXISTS "Owners can delete shares" ON public.file_shares;

CREATE POLICY "Owners can view their shares" ON public.file_shares
    FOR SELECT USING (auth.uid() = shared_by);

CREATE POLICY "Recipients can view their shares" ON public.file_shares
    FOR SELECT USING (
        LOWER(shared_with_email) = LOWER(auth.jwt() ->> 'email') OR 
        auth.uid() = shared_with_id
    );

CREATE POLICY "Owners can create shares" ON public.file_shares
    FOR INSERT WITH CHECK (auth.uid() = shared_by);

CREATE POLICY "Owners can delete shares" ON public.file_shares
    FOR DELETE USING (
        auth.uid() = shared_by OR 
        LOWER(shared_with_email) = LOWER(auth.jwt() ->> 'email') OR
        auth.uid() = shared_with_id
    );

-- 3. Update files policy to allow access to shared files
DROP POLICY IF EXISTS "Users can access shared files" ON public.files;
CREATE POLICY "Users can access shared files" ON public.files
    FOR SELECT USING (
        id IN (
            SELECT file_id FROM public.file_shares 
            WHERE LOWER(shared_with_email) = LOWER(auth.jwt() ->> 'email') OR 
                  shared_with_id = auth.uid()
        )
    );

-- 3a. Allow update if shared with edit permission
DROP POLICY IF EXISTS "Users can update shared files" ON public.files;
CREATE POLICY "Users can update shared files" ON public.files
    FOR UPDATE USING (
        id IN (
            SELECT file_id FROM public.file_shares 
            WHERE (LOWER(shared_with_email) = LOWER(auth.jwt() ->> 'email') OR shared_with_id = auth.uid())
            AND permission = 'edit'
        )
    );

-- 4. Allow viewing profiles of people who shared with you or you shared with
DROP POLICY IF EXISTS "Users can view associated profiles" ON public.users;
CREATE POLICY "Users can view associated profiles" ON public.users
    FOR SELECT USING (
        id IN (
            SELECT shared_by FROM public.file_shares 
            WHERE LOWER(shared_with_email) = LOWER(auth.jwt() ->> 'email')
        ) OR id IN (
            SELECT s.id from public.users s
            JOIN public.file_shares fs ON fs.shared_with_email = s.email
            WHERE fs.shared_by = auth.uid()
        )
    );

-- 5. Create notifications table
CREATE TABLE IF NOT EXISTS public.notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    type TEXT DEFAULT 'info',
    is_read BOOLEAN DEFAULT FALSE,
    link TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. Add RLS to notifications
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their notifications" ON public.notifications
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can update their notifications" ON public.notifications
    FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their notifications" ON public.notifications
    FOR DELETE USING (auth.uid() = user_id);

-- 6. Setup Storage Bucket (run in SQL editor if not already there)
-- This assumes standard Supabase storage setup
INSERT INTO storage.buckets (id, name, public) 
VALUES ('vault', 'vault', false)
ON CONFLICT (id) DO NOTHING;

-- Allow authenticated users to upload/download. 
-- We allow SELECT for all authenticated users to support shared file previews.
DROP POLICY IF EXISTS "Storage - Authenticated access" ON storage.objects;
CREATE POLICY "Storage - Authenticated access" ON storage.objects
    FOR ALL USING (auth.role() = 'authenticated')
    WITH CHECK (auth.role() = 'authenticated');
