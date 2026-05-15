import { Response } from 'express';
import { supabase } from '../lib/supabase.ts';
import { ensureUserProfile } from '../lib/dbUtils.ts';
import { logAudit, AuditAction, EntityType } from '../lib/auditLogger.ts';
import * as fs from 'fs';
import * as path from 'path';

// Helper to slugify filename for safe storage
const slugifyFilename = (name: string) => {
  const parts = name.split('.');
  const ext = parts.length > 1 ? parts.pop() : '';
  const base = parts.join('.');
  const slug = base
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  const finalExt = ext ? ext.toLowerCase().replace(/[^a-z0-9]/g, '') : '';
  return finalExt ? `${slug || 'file'}.${finalExt}` : (slug || 'file');
};

export const uploadFiles = async (req: any, res: Response) => {
  try {
    const files = req.files as Express.Multer.File[];
    if (!files || files.length === 0) {
      console.error('Upload failed: No files in request.');
      console.error('Body Keys:', Object.keys(req.body));
      console.error('Content-Type:', req.headers['content-type']);
      return res.status(400).json({ 
        error: 'No files uploaded',
        details: 'The server received the request but no files were found in the "files" field. Ensure your frontend is appending files to a field named "files".'
      });
    }

    // Use request-scoped Supabase client or default to global
    // ALWAYS prefer service role client for storage operations to ensure bucket access
    const supabaseClient = req.supabase || supabase;
    const adminClient = supabase; // This is the default client which uses service key if available

    // Ensure user profile exists
    if (!(await ensureUserProfile(req.userId, req.userEmail, '', req.token))) {
      return res.status(500).json({ 
        error: 'Profile Sync Error', 
        details: 'Failed to ensure user profile exists. Please check if your users table exists and RLS is configured.' 
      });
    }

    // ENSURE BUCKET EXISTS
    try {
      const { data: buckets, error: listError } = await adminClient.storage.listBuckets();
      if (listError) {
        console.error('[UPLOAD] Failed to list buckets:', listError);
      } else {
        console.log('[UPLOAD] Existing buckets:', buckets?.map(b => b.name));
        if (!buckets?.find(b => b.name === 'vault')) {
          console.log('[UPLOAD] Bucket "vault" not found. Attempting to create...');
          const { error: createError } = await adminClient.storage.createBucket('vault', {
            public: true, // Make public to avoid strict access issues
            fileSizeLimit: 52428800 // 50MB
          });
          if (createError) console.error('[UPLOAD] Failed to create bucket:', createError.message);
          else console.log('[UPLOAD] Successfully created "vault" bucket (public)');
        }
      }
    } catch (e) {
      console.error('[UPLOAD] Bucket check failed:', e);
    }

    const { folderId } = req.body;
    const uploadedFilesData = [];

    for (const file of files) {
      console.log(`Processing file: ${file.originalname} (${file.size} bytes)`);
      // Find a unique name if duplicate exists
      let fileNameToUse = file.originalname;
      let counter = 1;
      let isDuplicate = true;

      while (isDuplicate) {
        let duplicateQuery = supabaseClient
          .from('files')
          .select('id')
          .eq('user_id', req.userId)
          .eq('name', fileNameToUse);

        if (folderId) {
          duplicateQuery = duplicateQuery.eq('folder_id', folderId);
        } else {
          duplicateQuery = duplicateQuery.is('folder_id', null);
        }

        const { data: duplicateFiles, error: duplicateError } = await duplicateQuery;
        if (duplicateError) throw duplicateError;

        if (duplicateFiles && duplicateFiles.length > 0) {
          const ext = path.extname(file.originalname);
          const nameWithoutExt = path.basename(file.originalname, ext);
          fileNameToUse = `${nameWithoutExt} (${counter})${ext}`;
          counter++;
        } else {
          isDuplicate = false;
        }
      }

      // UPLOAD TO SUPABASE STORAGE
      const safeSlug = slugifyFilename(fileNameToUse);
      const storagePath = `${req.userId}/${Date.now()}-${safeSlug}`;
      console.log(`[UPLOAD] Attempting to upload to storage path: "${storagePath}" (Original: ${fileNameToUse})`);
      const fileBuffer = fs.readFileSync(file.path);
      
      const { error: storageError } = await adminClient.storage
        .from('vault')
        .upload(storagePath, fileBuffer, {
          contentType: file.mimetype,
          upsert: true
        });

      if (storageError) {
        console.error('Supabase Storage upload error:', storageError);
        throw new Error(`Storage upload failed: ${storageError.message}`);
      }

      const fileData = {
        name: fileNameToUse,
        name_lower: fileNameToUse.toLowerCase(),
        original_name: file.originalname,
        mime_type: file.mimetype,
        size: file.size,
        path: storagePath, // Store storage path instead of local path
        user_id: req.userId,
        folder_id: folderId || null,
        is_trash: false,
        is_starred: false,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const { data: newFile, error: insertError } = await supabaseClient
        .from('files')
        .insert([fileData])
        .select()
        .single();

      if (insertError) {
        // Cleanup storage if DB insert fails
        await adminClient.storage.from('vault').remove([storagePath]);
        
        console.error('Supabase file insert error:', JSON.stringify(insertError, null, 2));
        let details = '';
        if (insertError.code === '42501') {
          details = 'This is usually caused by missing Supabase Row-Level Security (RLS) policies. Please run the SQL in supabase_schema.sql in your Supabase dashboard.';
        }
        return res.status(500).json({ 
          error: `Supabase insert error: ${insertError.message}`,
          details: details || insertError
        });
      }
      
      // Cleanup local temp file
      try {
        fs.unlinkSync(file.path);
      } catch (e) {
        console.warn('Failed to delete temp file:', file.path);
      }

      // Audit Log
      await logAudit({
        userId: req.userId,
        action: AuditAction.UPLOAD,
        entityType: EntityType.FILE,
        entityId: newFile.id,
        details: { name: newFile.name, size: newFile.size },
        ipAddress: req.ip,
        userAgent: req.get('user-agent')
      });

      uploadedFilesData.push(newFile);
    }

    res.status(201).json(uploadedFilesData);
  } catch (error: any) {
    console.error('Upload files error:', error);
    res.status(500).json({ 
      error: error.message || 'An unexpected error occurred during upload',
      details: error
    });
  }
};

export const createEmptyFile = async (req: any, res: Response) => {
  try {
    const { name, folderId, content } = req.body;
    console.log('Create empty file request:', { name, folderId, hasContent: !!content, userId: req.userId });

    if (!name) return res.status(400).json({ error: 'File name is required' });

    const trimmedName = name.trim();
    const fileName = trimmedName.endsWith('.txt') ? trimmedName : `${trimmedName}.txt`;
    
    const safeSlug = slugifyFilename(fileName);
    const storagePath = `${req.userId}/${Date.now()}-${safeSlug}`;
    const fileContent = content || '';
    // Use request-scoped Supabase client
    const supabaseClient = req.supabase || supabase;

    // Ensure user profile exists
    if (!(await ensureUserProfile(req.userId, req.userEmail, '', req.token))) {
      return res.status(500).json({ 
        error: 'Profile Sync Error', 
        details: 'Failed to ensure user profile exists. Please check if your users table exists and RLS is configured.' 
      });
    }

    // ENSURE BUCKET EXISTS
    try {
      const adminClient = supabase;
      const { data: buckets } = await adminClient.storage.listBuckets();
      if (!buckets?.find(b => b.name === 'vault')) {
        console.log('Bucket "vault" not found. Attempting to create...');
        await adminClient.storage.createBucket('vault', { public: true });
      }
    } catch (e) {
      console.error('Bucket check failed:', e);
    }

    // Check for duplicate name
    let duplicateQuery = supabaseClient
      .from('files')
      .select('id')
      .eq('user_id', req.userId)
      .eq('name', fileName);

    if (folderId) {
      duplicateQuery = duplicateQuery.eq('folder_id', folderId);
    } else {
      duplicateQuery = duplicateQuery.is('folder_id', null);
    }

    const { data: duplicateFiles, error: duplicateError } = await duplicateQuery;

    if (duplicateError) throw duplicateError;
    
    if (duplicateFiles && duplicateFiles.length > 0) {
      console.log('Duplicate file found:', fileName);
      return res.status(400).json({ 
        error: 'File already exists', 
        details: `A file named "${fileName}" already exists in this folder.`
      });
    }

    const adminClient = supabase;
    
    // UPLOAD TO SUPABASE STORAGE
    const { error: storageError } = await adminClient.storage
      .from('vault')
      .upload(storagePath, Buffer.from(fileContent), {
        contentType: 'text/plain',
        upsert: true
      });

    if (storageError) {
      console.error('Supabase Storage upload error (empty file):', storageError);
      throw new Error(`Storage upload failed: ${storageError.message}`);
    }

    const fileData = {
      name: fileName,
      name_lower: fileName.toLowerCase(),
      original_name: fileName,
      mime_type: 'text/plain',
      size: Buffer.byteLength(fileContent),
      path: storagePath,
      user_id: req.userId,
      folder_id: folderId || null,
      is_trash: false,
      is_starred: false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const { data: newFile, error: insertError } = await supabaseClient
      .from('files')
      .insert([fileData])
      .select()
      .single();

    if (insertError) {
      console.error('Supabase create empty file error:', JSON.stringify(insertError, null, 2));
      let details = '';
      if (insertError.code === '42501') {
        details = 'This is usually caused by missing Supabase Row-Level Security (RLS) policies. Please run the SQL in supabase_schema.sql in your Supabase dashboard.';
      }
      return res.status(500).json({ 
        error: `Supabase insert error: ${insertError.message}`,
        details: details || insertError
      });
    }

    // Audit Log
    await logAudit({
      userId: req.userId,
      action: AuditAction.UPLOAD,
      entityType: EntityType.FILE,
      entityId: newFile.id,
      details: { name: newFile.name, type: 'EMPTY_FILE' },
      ipAddress: req.ip,
      userAgent: req.get('user-agent')
    });

    res.status(201).json(newFile);
  } catch (error: any) {
    console.error('Create empty file error:', error);
    res.status(500).json({ error: error.message || 'An unexpected error occurred' });
  }
};

export const getFiles = async (req: any, res: Response) => {
  try {
    const { folderId, filter, q } = req.query;
    const supabaseClient = req.supabase || supabase;
    let queryBuilder = supabaseClient
      .from('files')
      .select('*')
      .eq('user_id', req.userId);

    if (q) {
      queryBuilder = queryBuilder.ilike('name', `%${q}%`).eq('is_trash', false);
    } else if (filter === 'starred') {
      queryBuilder = queryBuilder.eq('is_starred', true).eq('is_trash', false);
    } else if (filter === 'trash') {
      queryBuilder = queryBuilder.eq('is_trash', true);
    } else if (filter === 'recent') {
      queryBuilder = queryBuilder.eq('is_trash', false);
    } else if (filter === 'spam') {
      // Return empty array for spam as we don't have spam logic yet
      return res.json([]);
    } else if (folderId === 'null' || !folderId) {
      queryBuilder = queryBuilder.is('folder_id', null).eq('is_trash', false);
    } else {
      queryBuilder = queryBuilder.eq('folder_id', folderId).eq('is_trash', false);
    }

    const sortField = filter === 'recent' ? 'updated_at' : 'created_at';
    const { data: files, error: filesError } = await queryBuilder.order(sortField, { ascending: false });

    if (filesError) throw filesError;
    res.json(files);
  } catch (error: any) {
    console.error('Get files error:', error);
    res.status(500).json({ error: error.message });
  }
};

export const deleteFile = async (req: any, res: Response) => {
  try {
    console.log(`DELETE request for file: ${req.params.id} by user: ${req.userId}`);
    const supabaseClient = req.supabase || supabase;
    
    const { data: file, error: fileError } = await supabaseClient
      .from('files')
      .select('*')
      .eq('id', req.params.id)
      .eq('user_id', req.userId)
      .maybeSingle();
    
    if (fileError) throw fileError;
    if (!file) {
      console.log(`File not found: ${req.params.id}`);
      return res.status(404).json({ error: 'File not found' });
    }

    if (file.is_trash) {
      console.log(`Permanently deleting file: ${file.name}`);
      // Permanent delete if already in trash
      
      // SUPABASE STORAGE DELETE
      if (file.path) {
        if (file.path.startsWith('uploads/')) {
           // Legacy local delete
           if (fs.existsSync(file.path)) {
             try { fs.unlinkSync(file.path); } catch (e) { console.error('Local unlink error:', e); }
           }
        } else {
           // Storage delete
           await supabase.storage
             .from('vault')
             .remove([file.path]);
        }
      }

      const { error: deleteError } = await supabaseClient
        .from('files')
        .delete()
        .eq('id', req.params.id);

      if (deleteError) throw deleteError;

      // Audit Log
      await logAudit({
        userId: req.userId,
        action: AuditAction.DELETE,
        entityType: EntityType.FILE,
        entityId: req.params.id,
        details: { name: file.name, permanent: true },
        ipAddress: req.ip,
        userAgent: req.get('user-agent')
      });

      res.json({ message: 'File deleted permanently' });
    } else {
      console.log(`Moving file to trash: ${file.name}`);
      // Move to trash
      const { error: updateError } = await supabaseClient
        .from('files')
        .update({ is_trash: true, updated_at: new Date().toISOString() })
        .eq('id', req.params.id);

      if (updateError) throw updateError;

      // Audit Log
      await logAudit({
        userId: req.userId,
        action: AuditAction.DELETE,
        entityType: EntityType.FILE,
        entityId: req.params.id,
        details: { name: file.name, permanent: false },
        ipAddress: req.ip,
        userAgent: req.get('user-agent')
      });

      res.json({ message: 'File moved to trash' });
    }
  } catch (error: any) {
    console.error('Delete file error:', error);
    res.status(500).json({ error: error.message || 'Failed to delete file' });
  }
};

export const emptyTrash = async (req: any, res: Response) => {
  try {
    console.log(`EMPTY TRASH request by user: ${req.userId}`);
    const supabaseClient = req.supabase || supabase;
    // Empty files
    const { data: trashFiles, error: trashFilesError } = await supabaseClient
      .from('files')
      .select('*')
      .eq('user_id', req.userId)
      .eq('is_trash', true);
    
    if (trashFilesError) throw trashFilesError;
    console.log(`Found ${trashFiles.length} files in trash to purge`);
    
    for (const file of trashFiles) {
      if (file.path) {
        if (file.path.startsWith('uploads/')) {
          if (fs.existsSync(file.path)) {
            try { fs.unlinkSync(file.path); } catch (e) {}
          }
        } else {
          await supabase.storage
            .from('vault')
            .remove([file.path]);
        }
      }
      await supabaseClient.from('files').delete().eq('id', file.id);
    }

    // Empty folders
    const { error: trashFoldersError } = await supabaseClient
      .from('folders')
      .delete()
      .eq('user_id', req.userId)
      .eq('is_trash', true);

    if (trashFoldersError) throw trashFoldersError;

    res.json({ message: 'Vault purged successfully' });
  } catch (error: any) {
    console.error('Empty trash error:', error);
    res.status(500).json({ error: error.message });
  }
};

export const updateFile = async (req: any, res: Response) => {
  try {
    const { name, is_starred } = req.body;
    const supabaseClient = req.supabase || supabase;
    
    // Check if user owns the file
    const { data: file, error: fileError } = await supabaseClient
      .from('files')
      .select('*')
      .eq('id', req.params.id)
      .maybeSingle();
    
    if (fileError) throw fileError;
    if (!file) {
      return res.status(404).json({ error: 'File not found' });
    }

    // Check authorization: Owner OR shared with 'edit' permission
    const isOwner = file.user_id === req.userId;
    let hasEditPermission = false;
    const normalizedEmailUpdate = req.userEmail?.toLowerCase().trim();

    if (!isOwner) {
      let shareQuery = supabaseClient
        .from('file_shares')
        .select('permission')
        .eq('file_id', req.params.id)
        .eq('permission', 'edit');
      
      if (normalizedEmailUpdate && req.userId) {
        shareQuery = shareQuery.or(`shared_with_email.eq.${normalizedEmailUpdate},shared_with_id.eq.${req.userId}`);
      } else if (normalizedEmailUpdate) {
        shareQuery = shareQuery.eq('shared_with_email', normalizedEmailUpdate);
      } else {
        shareQuery = shareQuery.eq('shared_with_id', req.userId);
      }

      const { data: share } = await shareQuery.maybeSingle();
      
      if (share) hasEditPermission = true;
    }

    if (!isOwner && !hasEditPermission) {
      return res.status(403).json({ error: 'Unauthorized to update this file' });
    }

    const updates: any = {
      updated_at: new Date().toISOString()
    };

    if (name !== undefined) {
      // Prevent truly malicious patterns but allow common characters like dashes and spaces
      const injectionPatterns = /['";]|<script.*?>.*?<\/script>i|\$where|\{.*\}/;
      if (injectionPatterns.test(name)) {
        return res.status(400).json({ error: 'Invalid characters in file name' });
      }

      // Check for duplicate name if name is changing
      if (file.name !== name) {
        const { data: dup, error: dupError } = await supabaseClient
          .from('files')
          .select('id')
          .eq('user_id', req.userId)
          .eq('folder_id', file.folder_id || null)
          .eq('name', name);
        
        if (dup && dup.length > 0) {
          return res.status(400).json({ error: 'A file with this name already exists in this folder.' });
        }
      }
      updates.name = name;
      updates.name_lower = name.toLowerCase();
    }
    if (is_starred !== undefined) updates.is_starred = is_starred;

    const { data: updatedFile, error: updateError } = await supabaseClient
      .from('files')
      .update(updates)
      .eq('id', req.params.id)
      .select()
      .single();

    if (updateError) throw updateError;

    // Audit Log
    await logAudit({
      userId: req.userId,
      action: AuditAction.RENAME,
      entityType: EntityType.FILE,
      entityId: req.params.id,
      details: { oldName: file.name, newName: name, isStarred: is_starred },
      ipAddress: req.ip,
      userAgent: req.get('user-agent')
    });

    res.json(updatedFile);
  } catch (error: any) {
    console.error('Update file error:', error);
    res.status(500).json({ error: error.message });
  }
};

export const updateFileContent = async (req: any, res: Response) => {
  try {
    const { content } = req.body;
    const supabaseClient = req.supabase || supabase;
    
    const { data: file, error: fileError } = await supabaseClient
      .from('files')
      .select('*')
      .eq('id', req.params.id)
      .maybeSingle();
    
    if (fileError) throw fileError;
    if (!file) {
      return res.status(404).json({ error: 'File not found' });
    }

    // Check authorization: Owner OR shared with 'edit' permission
    const isOwner = file.user_id === req.userId;
    let hasEditPermission = false;
    const normalizedEmailContent = req.userEmail?.toLowerCase().trim();

    if (!isOwner) {
      let shareQuery = supabaseClient
        .from('file_shares')
        .select('permission')
        .eq('file_id', req.params.id)
        .eq('permission', 'edit');
      
      if (normalizedEmailContent && req.userId) {
        shareQuery = shareQuery.or(`shared_with_email.eq.${normalizedEmailContent},shared_with_id.eq.${req.userId}`);
      } else if (normalizedEmailContent) {
        shareQuery = shareQuery.eq('shared_with_email', normalizedEmailContent);
      } else {
        shareQuery = shareQuery.eq('shared_with_id', req.userId);
      }

      const { data: share } = await shareQuery.maybeSingle();
      
      if (share) hasEditPermission = true;
    }

    if (!isOwner && !hasEditPermission) {
      return res.status(403).json({ error: 'Unauthorized to update this file content' });
    }

    // 4. SUPABASE STORAGE DOWNLOAD/UPLOAD
    // ALWAYS use admin client (service role) for direct storage binary manipulation
    // to avoid RLS complexities on binary objects
    const adminSupabase = supabase;
    const { data: blob, error: downloadError } = await adminSupabase.storage
      .from('vault')
      .download(file.path);

    if (downloadError) {
      console.error('[CONTENT] Supabase Storage download error for path:', file.path, downloadError);
      // Fallback for local files if they still exist (legacy support)
      if (fs.existsSync(file.path)) {
        console.log(`[CONTENT] Falling back to local file path: ${file.path}`);
        fs.writeFileSync(file.path, content || '');
      } else {
        return res.status(404).json({ 
          error: 'Original file binary missing in storage',
          details: downloadError.message,
          path: file.path
        });
      }
    } else {
      console.log(`[CONTENT] Overwriting storage object at: ${file.path}`);
      const { error: uploadError } = await adminSupabase.storage
        .from('vault')
        .upload(file.path, Buffer.from(content || ''), {
          contentType: file.mime_type,
          upsert: true
        });

      if (uploadError) {
        console.error('[CONTENT] Storage upload error during content update:', uploadError);
        throw uploadError;
      }
    }

    const updates = {
      size: Buffer.byteLength(content || ''),
      updated_at: new Date().toISOString()
    };

    const { error: updateError } = await supabaseClient
      .from('files')
      .update(updates)
      .eq('id', req.params.id);

    if (updateError) throw updateError;

    // Audit Log
    await logAudit({
      userId: req.userId,
      action: AuditAction.UPDATE_CONTENT,
      entityType: EntityType.FILE,
      entityId: req.params.id,
      details: { name: file.name, newSize: updates.size },
      ipAddress: req.ip,
      userAgent: req.get('user-agent')
    });

    res.json({ message: 'File content updated successfully' });
  } catch (error: any) {
    console.error('Update file content error:', error);
    res.status(500).json({ error: error.message });
  }
};

export const downloadFile = async (req: any, res: Response) => {
  try {
    const { id } = req.params;
    const normalizedEmail = req.userEmail?.toLowerCase().trim();
    const userId = req.userId;
    
    console.log(`[DOWNLOAD] Request initiated for file ID: ${id} by user: ${normalizedEmail} (${userId})`);
    
    // 1. UUID Format validation
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(id)) {
      console.warn(`[DOWNLOAD] Invalid UUID format received: ${id}`);
      return res.status(400).json({ error: 'Invalid file ID format' });
    }

    // Use service role to fetch file metadata to avoid RLS issues during download process
    // We will perform manual authorization check below
    const adminSupabase = supabase;
    const { data: ownFile, error: fileError } = await adminSupabase
      .from('files')
      .select('*')
      .eq('id', id)
      .eq('user_id', userId)
      .maybeSingle();
    
    if (fileError) {
      console.error('[DOWNLOAD] Metadata fetch error:', fileError);
    }
    
    let targetFile = ownFile;
    
    // If not found in user's own files, check shared files
    if (!targetFile) {
      console.log(`[DOWNLOAD] Checking shared access for file ID: ${id}`);
      
      // We search for a share record that links this file to this user using service role
      // to ensure we can at least find the share record if it exists
      let shareQuery = supabase
        .from('file_shares')
        .select('file_id')
        .eq('file_id', id);
      
      if (normalizedEmail && userId) {
        shareQuery = shareQuery.or(`shared_with_email.eq.${normalizedEmail},shared_with_id.eq.${userId}`);
      } else if (normalizedEmail) {
        shareQuery = shareQuery.eq('shared_with_email', normalizedEmail);
      } else {
        shareQuery = shareQuery.eq('shared_with_id', userId);
      }

      const { data: shareData, error: shareError } = await shareQuery.maybeSingle();
      
      if (shareError) {
        console.error('[DOWNLOAD] Share check error:', shareError);
      }
      
      if (shareData) {
        console.log(`[DOWNLOAD] Found share record for file ${id}, fetching file details...`);
        // Use service role to fetch the file details because the user might not have RLS access to the 'files' table directly
        const { data: sharedFile, error: sharedFileError } = await supabase
          .from('files')
          .select('*')
          .eq('id', id)
          .maybeSingle();
        
        if (sharedFileError) {
          console.error('[DOWNLOAD] Shared file details fetch error:', sharedFileError);
        }
        
        if (sharedFile) {
          console.log(`[DOWNLOAD] Successfully fetched shared file: ${sharedFile.name}`);
          targetFile = sharedFile;
        }
      } else {
        console.log(`[DOWNLOAD] No share record found for file ${id} and user ${normalizedEmail || userId}`);
      }
    }
    
    if (!targetFile) {
      return res.status(404).json({ error: 'File not found or access denied' });
    }

    const file = targetFile;
    if (!file.path) {
      console.error(`[DOWNLOAD] File record found but path is empty: ${file.id}`);
      return res.status(404).json({ error: 'File path record is corrupt or missing' });
    }
    
    console.log(`Processing download for file: ${file.name}, mime: ${file.mime_type}, path: ${file.path}`);
    
    // Set common headers
    const encodedName = encodeURIComponent(file.name).replace(/['()]/g, escape).replace(/\*/g, '%2A');
    const isInline = req.query.inline === 'true';
    const disposition = isInline ? 'inline' : 'attachment';
    let mimeType = file.mime_type || 'application/octet-stream';
    if (file.name.toLowerCase().endsWith('.pdf')) {
      mimeType = 'application/pdf';
    }

    res.setHeader('Content-Type', mimeType);
    res.setHeader('Content-Disposition', `${disposition}; filename="${file.name.replace(/"/g, '\\"')}"; filename*=UTF-8''${encodedName}`);
    res.removeHeader('X-Frame-Options');
    res.setHeader('Content-Security-Policy', "frame-ancestors 'self' *; default-src 'self' blob: data:;");
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('X-Content-Type-Options', 'nosniff');

    // Check if it's a Supabase storage path or a local path
    const isLocalPath = file.path.startsWith('uploads/') || (file.path.includes('local-storage') && !file.path.includes('/'));
    
    if (isLocalPath) {
      // LEGACY: Local path
      const absolutePath = path.resolve(file.path);
      console.log(`[DOWNLOAD] Attempting legacy local file download: ${absolutePath}`);
      if (fs.existsSync(absolutePath)) {
        if (isInline) {
          return res.sendFile(absolutePath);
        }
        return res.download(absolutePath, file.name);
      } else {
        console.warn(`[DOWNLOAD] Legacy local file missing: ${absolutePath}`);
        // If local missing, we might want to try storage just in case it was migrated but path not updated
      }
    }

    // SUPABASE STORAGE DOWNLOAD
    console.log(`[DOWNLOAD] Attempting storage download from bucket 'vault' for path: "${file.path}"`);
    
    // Explicitly check for the bucket first if we keep getting 404s
    // Use the admin client to ensure we have permission to list/download
    const { data: buckets } = await adminSupabase.storage.listBuckets();
    if (!buckets?.find(b => b.name === 'vault')) {
      console.error('[DOWNLOAD] Bucket "vault" does not exist! This is likely why downloads are failing.');
      return res.status(500).json({ error: 'Storage configuration error: bucket "vault" missing' });
    }

    // Use adminSupabase (service role) to bypass potential storage RLS issues 
    const { data: blob, error: downloadError } = await adminSupabase.storage
      .from('vault')
      .download(file.path);

    if (downloadError) {
      console.error(`[DOWNLOAD] Supabase Storage download error for "${file.path}":`, JSON.stringify(downloadError, null, 2));
      
      // DEBUG: List files in the same virtual folder to see if there's a naming mismatch
      try {
        const pathParts = file.path.split('/');
        const folderPath = pathParts.length > 1 ? pathParts.slice(0, -1).join('/') : '';
        console.log(`[DOWNLOAD] Debug: Listing objects in storage folder "${folderPath}" to find "${pathParts[pathParts.length-1]}":`);
        const { data: listData } = await adminSupabase.storage.from('vault').list(folderPath);
        console.log(`[DOWNLOAD] Debug: Objects found in "${folderPath}":`, (listData || []).map(f => f.name));
      } catch (listErr) {
        console.error('[DOWNLOAD] Debug: Failed to list objects for debugging:', listErr);
      }

      return res.status(404).json({ 
        error: 'File binary not found in cloud storage (404)', 
        details: downloadError.message || 'Object not found in Supabase Storage',
        path: file.path,
        code: (downloadError as any).status || 404
      });
    }

    if (!blob) {
      console.error('[DOWNLOAD] Supabase Storage returned null data for path:', file.path);
      return res.status(404).json({ error: 'File binary is empty' });
    }

    console.log(`[DOWNLOAD] Successfully downloaded ${blob.size} bytes from storage`);
    const bufferArray = await blob.arrayBuffer();

    // Audit Log
    await logAudit({
      userId: req.userId,
      action: AuditAction.DOWNLOAD,
      entityType: EntityType.FILE,
      entityId: file.id,
      details: { name: file.name, size: blob.size },
      ipAddress: req.ip,
      userAgent: req.get('user-agent')
    });

    return res.send(Buffer.from(bufferArray));
  } catch (error: any) {
    if (!res.headersSent) {
      res.status(500).json({ error: error.message || 'Internal server error' });
    }
  }
};

export const shareFile = async (req: any, res: Response) => {
  try {
    const { id } = req.params;
    const { email, name, permission = 'view' } = req.body;
    const supabaseClient = req.supabase || supabase;
    
    // Use global supabase (service role) for user lookups because the profile policy is very restrictive
    const adminSupabase = supabase; 

    if (!email && !name) return res.status(400).json({ error: 'Email or Name is required for sharing' });

    let targetUser: any = null;
    let targetEmail = email;

    if (email) {
      targetEmail = email.toLowerCase().trim();
      const { data: userByEmail } = await adminSupabase
        .from('users')
        .select('id, email')
        .eq('email', targetEmail)
        .maybeSingle();
      targetUser = userByEmail;
    } else if (name) {
      const { data: usersByName } = await adminSupabase
        .from('users')
        .select('id, email')
        .ilike('name', `%${name}%`)
        .limit(1);
      
      if (usersByName && usersByName.length > 0) {
        targetUser = usersByName[0];
        targetEmail = targetUser.email;
      } else {
        return res.status(404).json({ error: 'User not found by name' });
      }
    }

    if (!targetEmail) {
      return res.status(400).json({ error: 'Target email could not be resolved. Please provide a valid email or ensure the user exists if searching by name.' });
    }

    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(targetEmail)) {
      return res.status(400).json({ error: 'Invalid email format' });
    }

    console.log('[SHARE] Sharing file:', { id, targetEmail, permission, userId: req.userId });

    if (req.userEmail && targetEmail.toLowerCase() === req.userEmail.toLowerCase().trim()) {
      return res.status(400).json({ 
        error: 'Cannot share with yourself'
      });
    }

    // Verify ID format before query to avoid 400/500 from Postgres
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(id)) {
      return res.status(400).json({ error: 'Invalid file ID format' });
    }

    // Verify ownership
    const { data: file, error: fileError } = await supabaseClient
      .from('files')
      .select('id, name')
      .eq('id', id)
      .eq('user_id', req.userId)
      .maybeSingle();

    if (fileError) {
      console.error('[SHARE] Check ownership error:', fileError);
      return res.status(400).json({ error: 'Database error or invalid file reference', details: fileError.message });
    }
    
    if (!file) return res.status(404).json({ error: 'File not found or you do not have permission to share it' });

    // Check if already shared
    const { data: existingShare, error: checkError } = await supabaseClient
      .from('file_shares')
      .select('id')
      .eq('file_id', id)
      .eq('shared_with_email', targetEmail)
      .maybeSingle();

    if (checkError) {
      console.error('[SHARE] Check existing share error:', checkError);
    }

    if (existingShare) {
      return res.status(400).json({ error: `File is already shared with ${targetEmail}` });
    }

    // Insert share record
    const { data: share, error: shareError } = await supabaseClient
      .from('file_shares')
      .insert([{
        file_id: id,
        shared_by: req.userId,
        shared_with_email: targetEmail,
        shared_with_id: targetUser?.id || null,
        permission: permission
      }])
      .select()
      .maybeSingle();

    if (shareError) throw shareError;

    // Audit Log
    await logAudit({
      userId: req.userId,
      action: AuditAction.SHARE,
      entityType: EntityType.FILE,
      entityId: id,
      details: { fileName: file.name, sharedWith: targetEmail, permission },
      ipAddress: req.ip,
      userAgent: req.get('user-agent')
    });

    // Create notification
    if (targetUser) {
      try {
        await supabaseClient.from('notifications').insert([{
          user_id: targetUser.id,
          title: 'New File Shared',
          message: `${req.userEmail} shared "${file.name}" with you (${permission} access).`,
          type: 'share',
          link: '/shared',
          created_at: new Date().toISOString()
        }]);
      } catch (notifyError) {
        console.warn('[SHARE] Failed to send notification:', notifyError);
      }
    }

    res.status(201).json({ message: 'File shared successfully', share });
  } catch (error: any) {
    console.error('Share file error:', error);
    const status = error.status || (error.code === '23505' ? 400 : 500);
    res.status(status).json({ 
      error: error.message || 'Failed to share file',
      details: error.details,
      code: error.code
    });
  }
};

export const getSharedFiles = async (req: any, res: Response) => {
  try {
    const supabaseClient = req.supabase || supabase;
    const normalizedEmail = req.userEmail?.toLowerCase().trim();
    const userId = req.userId;

    if (!normalizedEmail && !userId) {
      return res.status(401).json({ error: 'User identity missing' });
    }

    console.log(`[SHARED] Fetching shared files for: ${normalizedEmail || 'no-email'} (${userId})`);

    // Build query to find shares using service role to ensures reliability
    // We trust our own filters because normalizedEmail and userId come from verified JWT
    let shareQuery = supabase
      .from('file_shares')
      .select('*, owner:shared_by (email)');

    // Add filters based on available identity info
    if (normalizedEmail && userId) {
      shareQuery = shareQuery.or(`shared_with_email.eq.${normalizedEmail},shared_with_id.eq.${userId}`);
    } else if (normalizedEmail) {
      shareQuery = shareQuery.eq('shared_with_email', normalizedEmail);
    } else {
      shareQuery = shareQuery.eq('shared_with_id', userId);
    }

    const { data: shares, error: sharesError } = await shareQuery;

    if (sharesError) {
      console.error('[SHARED] Shares Query Error:', sharesError);
      throw sharesError;
    }

    if (!shares || shares.length === 0) {
      return res.json([]);
    }

    // UPDATE: If any shares are missing shared_with_id but match the email, update them now
    // this helps link shares created before the user had a profile.
    const orphanedShares = shares.filter(s => !s.shared_with_id && s.shared_with_email.toLowerCase().trim() === normalizedEmail);
    if (orphanedShares.length > 0 && userId) {
      console.log(`[SHARED] Linking ${orphanedShares.length} orphaned shares to userId ${userId}`);
      await supabase
        .from('file_shares')
        .update({ shared_with_id: userId })
        .in('id', orphanedShares.map(s => s.id));
    }

    // Now fetch the files using service role to bypass RLS potentially blocking the join result
    // This is more reliable as it separates the "do I have a share" check from the "can I see the file" check
    const fileIds = shares.map((s: any) => s.file_id);
    const { data: files, error: filesError } = await supabase
      .from('files')
      .select('*')
      .in('id', fileIds);

    if (filesError) {
      console.error('[SHARED] Files Query Error:', filesError);
      throw filesError;
    }

    // Transform and filter
    const transformedFiles = files.map((file: any) => {
      const share = shares.find((s: any) => s.file_id === file.id);
      return {
        ...file,
        shared_by_email: share?.owner?.email,
        share_id: share?.id,
        shared_at: share?.created_at,
        permission: share?.permission
      };
    }).filter(f => !f.is_trash); // Don't show trashed files in shared view

    console.log(`[SHARED] Returning ${transformedFiles.length} files`);
    res.json(transformedFiles);
  } catch (error: any) {
    console.error('Get shared files unexpected error:', error);
    res.status(500).json({ 
      error: 'Unexpected server error',
      details: error.message 
    });
  }
};

export const unshareFile = async (req: any, res: Response) => {
  try {
    const { id } = req.params; // share_id
    const supabaseClient = req.supabase || supabase;
    const normalizedEmail = req.userEmail?.toLowerCase().trim();

    // A user can unshare if they are the owner OR the recipient
    const { data: share, error: findError } = await supabaseClient
      .from('file_shares')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (findError) throw findError;
    if (!share) return res.status(404).json({ error: 'Share record not found' });

    const isOwner = share.shared_by === req.userId;
    const isRecipient = (normalizedEmail && share.shared_with_email?.toLowerCase() === normalizedEmail) || 
                       (req.userId && share.shared_with_id === req.userId);

    if (!isOwner && !isRecipient) {
      return res.status(403).json({ error: 'Not authorized to remove this share' });
    }

    const { error: deleteError } = await supabaseClient
      .from('file_shares')
      .delete()
      .eq('id', id);

    if (deleteError) throw deleteError;
    res.json({ message: 'File unshared successfully' });
  } catch (error: any) {
    console.error('Unshare file error:', error);
    const errorMessage = error.message || error.details || 'Failed to remove share';
    res.status(500).json({ error: errorMessage });
  }
};
