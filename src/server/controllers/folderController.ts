import { Response } from 'express';
import { supabase } from '../lib/supabase.ts';
import { ensureUserProfile } from '../lib/dbUtils.ts';
import { logAudit, AuditAction, EntityType } from '../lib/auditLogger.ts';

export const createFolder = async (req: any, res: Response) => {
  try {
    const { name, parentId } = req.body;
    console.log('Create folder request:', { name, parentId, userId: req.userId });

    const trimmedName = name.trim();
    if (!trimmedName) {
      return res.status(400).json({ error: 'Folder name is required' });
    }

    const supabaseClient = req.supabase || supabase;

    // Ensure user profile exists before any inserts to prevent FK violations
    if (!(await ensureUserProfile(req.userId, req.userEmail, '', req.token))) {
      return res.status(500).json({ 
        error: 'Profile Sync Error', 
        details: 'Failed to ensure user profile exists in the database. If this persists, please check your Supabase SUPABASE_SERVICE_ROLE_KEY.' 
      });
    }

    // Prevent truly malicious patterns but allow common characters like dashes and spaces
    // Relaxed more to allow most characters while blocking obvious injection attempts
    const injectionPatterns = /['"]+|[<>%;]|<script.*?>.*?<\/script>/i;
    if (injectionPatterns.test(trimmedName)) {
      return res.status(400).json({ error: 'Invalid characters in folder name' });
    }

    // Check for duplicate folder name
    let duplicateQuery = supabaseClient
      .from('folders')
      .select('id')
      .eq('user_id', req.userId)
      .eq('name', trimmedName);

    if (parentId) {
      duplicateQuery = duplicateQuery.eq('parent_id', parentId);
    } else {
      duplicateQuery = duplicateQuery.is('parent_id', null);
    }

    const { data: duplicateFolders, error: duplicateError } = await duplicateQuery;

    if (duplicateError) throw duplicateError;
    
    if (duplicateFolders && duplicateFolders.length > 0) {
      console.log('Duplicate folder found:', trimmedName);
      return res.status(400).json({ 
        error: 'Folder already exists', 
        details: `A folder named "${trimmedName}" already exists in this location.`
      });
    }

    // Insert new folder
    console.log(`[FolderController] Inserting folder for user ${req.userId}...`);
    
    // Diagnostic query to check auth context
    const { data: authTest, error: authTestError } = await supabaseClient.rpc('get_auth_uid').maybeSingle();
    if (authTestError) {
       // If RPC fails, try a direct query
       const { data: authUidRaw } = await supabaseClient.from('users').select('id').limit(1).maybeSingle();
       console.log('[FolderController] Auth Context Test (no RPC):', authUidRaw ? 'Authenticated' : 'Unauthenticated');
    } else {
       console.log('[FolderController] Auth Context Test (RPC):', authTest);
       if (authTest && authTest !== req.userId) {
          console.warn(`[FolderController] User ID mismatch! req.userId: ${req.userId}, auth.uid(): ${authTest}`);
       }
    }

    const { data: newFolder, error: insertError } = await supabaseClient
      .from('folders')
      .insert([
        {
          name: trimmedName,
          name_lower: trimmedName.toLowerCase(),
          user_id: req.userId,
          parent_id: parentId || null,
          is_trash: false,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }
      ])
      .select()
      .single();

    if (insertError) {
      console.error('[FolderController] Supabase folder insert error:', JSON.stringify(insertError, null, 2));
      let details = '';
      if (insertError.code === '42501' || insertError.message?.includes('row-level security')) {
        details = 'This is usually caused by missing Supabase Row-Level Security (RLS) policies or the user profile record missing. Please run the SQL in supabase_schema.sql in your Supabase dashboard and ensure you have provided the SUPABASE_SERVICE_ROLE_KEY if possible.';
      } else if (insertError.code === '23503') {
        details = 'Foreign key violation: The user record for this ID does not exist in the "users" table. Please check your login process.';
      }
      return res.status(500).json({ 
        error: `Supabase insert error: ${insertError.message}`,
        details: details || insertError
      });
    }

    // Audit Log
    await logAudit({
      userId: req.userId,
      action: AuditAction.CREATE_FOLDER,
      entityType: EntityType.FOLDER,
      entityId: newFolder.id,
      details: { name: newFolder.name, parentId: newFolder.parent_id },
      ipAddress: req.ip,
      userAgent: req.get('user-agent')
    });

    res.status(201).json(newFolder);
  } catch (error: any) {
    console.error('Create folder error:', error);
    res.status(500).json({ error: error.message || 'An unexpected error occurred' });
  }
};

export const getFolders = async (req: any, res: Response) => {
  try {
    const { parentId, filter, q } = req.query;
    const supabaseClient = req.supabase || supabase;
    let query = supabaseClient
      .from('folders')
      .select('*')
      .eq('user_id', req.userId);

    if (q) {
      query = query.ilike('name', `%${q}%`).eq('is_trash', false);
    } else if (filter === 'all') {
      query = query.eq('is_trash', false);
    } else if (filter === 'trash') {
      query = query.eq('is_trash', true);
    } else if (parentId === 'null' || !parentId) {
      query = query.is('parent_id', null).eq('is_trash', false);
    } else {
      query = query.eq('parent_id', parentId).eq('is_trash', false);
    }

    const { data: folders, error: foldersError } = await query.order('name', { ascending: true });

    if (foldersError) throw foldersError;
    res.json(folders);
  } catch (error: any) {
    console.error('Get folders error:', error);
    res.status(500).json({ error: error.message });
  }
};

export const deleteFolder = async (req: any, res: Response) => {
  try {
    console.log(`DELETE request for folder: ${req.params.id} by user: ${req.userId}`);
    const supabaseClient = req.supabase || supabase;
    
    const { data: folder, error: folderError } = await supabaseClient
      .from('folders')
      .select('*')
      .eq('id', req.params.id)
      .eq('user_id', req.userId)
      .maybeSingle();
    
    if (folderError) throw folderError;
    if (!folder) {
      console.log(`Folder not found or unauthorized: ${req.params.id}`);
      return res.status(404).json({ error: 'Folder not found' });
    }

    if (folder.is_trash) {
      console.log(`Permanently deleting folder: ${folder.name}`);
      // Permanent delete
      // Check if empty
      const { data: subfolders, error: subError } = await supabaseClient
        .from('folders')
        .select('id')
        .eq('parent_id', req.params.id)
        .limit(1);
      
      const { data: files, error: filesError } = await supabaseClient
        .from('files')
        .select('id')
        .eq('folder_id', req.params.id)
        .limit(1);

      if ((subfolders && subfolders.length > 0) || (files && files.length > 0)) {
        console.log(`Folder not empty: ${folder.name}`);
        return res.status(400).json({ error: 'Folder is not empty. Clean contents before purging cluster.' });
      }

      const { error: deleteError } = await supabaseClient
        .from('folders')
        .delete()
        .eq('id', req.params.id);

      if (deleteError) throw deleteError;

      // Audit Log
      await logAudit({
        userId: req.userId,
        action: AuditAction.DELETE,
        entityType: EntityType.FOLDER,
        entityId: req.params.id,
        details: { name: folder.name, permanent: true },
        ipAddress: req.ip,
        userAgent: req.get('user-agent')
      });

      res.json({ message: 'Folder purged' });
    } else {
      console.log(`Moving folder to trash: ${folder.name}`);
      // Move to trash
      const { error: updateError } = await supabaseClient
        .from('folders')
        .update({ is_trash: true, updated_at: new Date().toISOString() })
        .eq('id', req.params.id);

      if (updateError) throw updateError;

      // Audit Log
      await logAudit({
        userId: req.userId,
        action: AuditAction.DELETE,
        entityType: EntityType.FOLDER,
        entityId: req.params.id,
        details: { name: folder.name, permanent: false },
        ipAddress: req.ip,
        userAgent: req.get('user-agent')
      });

      res.json({ message: 'Folder moved to trash' });
    }
  } catch (error: any) {
    console.error('Delete folder error:', error);
    res.status(500).json({ error: error.message });
  }
};

export const getFolderHierarchy = async (req: any, res: Response) => {
  try {
    const { id } = req.params;
    const hierarchy = [];
    let currentId = id;
    const supabaseClient = req.supabase || supabase;

    while (currentId) {
      const { data: folder, error: folderError } = await supabaseClient
        .from('folders')
        .select('*')
        .eq('id', currentId)
        .eq('user_id', req.userId)
        .maybeSingle();

      if (folderError || !folder) break;
      
      hierarchy.unshift(folder);
      currentId = folder.parent_id;
    }

    res.json(hierarchy);
  } catch (error: any) {
    console.error('Get folder hierarchy error:', error);
    res.status(500).json({ error: error.message });
  }
};

export const updateFolder = async (req: any, res: Response) => {
  try {
    const { name } = req.body;
    const supabaseClient = req.supabase || supabase;
    
    const { data: folder, error: folderError } = await supabaseClient
      .from('folders')
      .select('*')
      .eq('id', req.params.id)
      .eq('user_id', req.userId)
      .maybeSingle();

    if (folderError) throw folderError;
    if (!folder) {
      return res.status(404).json({ error: 'Folder not found' });
    }

    if (name) {
      // Prevent truly malicious patterns but allow common characters like dashes and spaces
      const injectionPatterns = /['";]|<script.*?>.*?<\/script>i|\$where|\{.*\}/;
      if (injectionPatterns.test(name)) {
        return res.status(400).json({ error: 'Invalid characters in folder name' });
      }

      // Check for duplicate name if changing
      if (folder.name !== name) {
        const { data: dup, error: dupError } = await supabaseClient
          .from('folders')
          .select('id')
          .eq('user_id', req.userId)
          .eq('parent_id', folder.parent_id || null)
          .eq('name', name);
        
        if (dup && dup.length > 0) {
          return res.status(400).json({ error: 'A folder with this name already exists in this location.' });
        }
      }
      
      const updates = {
        name,
        name_lower: name.toLowerCase(),
        updated_at: new Date().toISOString()
      };

      const { data: updatedFolder, error: updateError } = await supabaseClient
        .from('folders')
        .update(updates)
        .eq('id', req.params.id)
        .select()
        .single();

      if (updateError) throw updateError;

      // Audit Log
      await logAudit({
        userId: req.userId,
        action: AuditAction.RENAME,
        entityType: EntityType.FOLDER,
        entityId: req.params.id,
        details: { oldName: folder.name, newName: name },
        ipAddress: req.ip,
        userAgent: req.get('user-agent')
      });

      res.json(updatedFolder);
    } else {
      res.json(folder);
    }
  } catch (error: any) {
    console.error('Update folder error:', error);
    res.status(500).json({ error: error.message });
  }
};
