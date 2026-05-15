import { supabase } from './supabase.ts';

export enum AuditAction {
  LOGIN = 'LOGIN',
  UPLOAD = 'UPLOAD',
  DOWNLOAD = 'DOWNLOAD',
  DELETE = 'DELETE',
  RENAME = 'RENAME',
  SHARE = 'SHARE',
  UNSHARE = 'UNSHARE',
  CREATE_FOLDER = 'CREATE_FOLDER',
  UPDATE_CONTENT = 'UPDATE_CONTENT',
  MOVE = 'MOVE',
  EMPTY_TRASH = 'EMPTY_TRASH',
}

export enum EntityType {
  USER = 'USER',
  FILE = 'FILE',
  FOLDER = 'FOLDER',
  SYSTEM = 'SYSTEM',
}

export interface AuditLogEntry {
  userId: string;
  action: AuditAction;
  entityType: EntityType;
  entityId?: string;
  details?: any;
  ipAddress?: string;
  userAgent?: string;
}

/**
 * Logs an action to the audit_logs table using the service role client
 * to ensure logs are always recorded regardless of user RLS.
 */
export const logAudit = async (entry: AuditLogEntry) => {
  try {
    const { error } = await supabase
      .from('audit_logs')
      .insert([
        {
          user_id: entry.userId,
          action: entry.action,
          entity_type: entry.entityType,
          entity_id: entry.entityId,
          details: entry.details,
          ip_address: entry.ipAddress,
          user_agent: entry.userAgent,
        }
      ]);

    if (error) {
      console.error('Failed to log audit:', error);
    }
  } catch (err) {
    console.error('Audit logger error:', err);
  }
};
