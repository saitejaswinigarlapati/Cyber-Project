import { Router } from 'express';
import * as authController from '../controllers/authController.ts';
import * as fileController from '../controllers/fileController.ts';
import * as folderController from '../controllers/folderController.ts';
import * as notificationController from '../controllers/notificationController.ts';
import * as adminController from '../controllers/adminController.ts';
import { authMiddleware } from '../middleware/auth.ts';
import { adminMiddleware } from '../middleware/adminMiddleware.ts';
import { upload } from '../middleware/upload.ts';

const router = Router();

// Auth
router.post('/auth/signup', authController.signup);
router.post('/auth/login', authController.login);
router.post('/auth/wallet-login', authController.loginWithWallet);
router.get('/auth/me', authMiddleware, authController.getMe);
router.post('/auth/forgot-password', authController.forgotPassword);
router.post('/auth/reset-password', authController.resetPassword);
router.post('/auth/resend-verification', authController.resendVerificationEmail);

// Files
router.post('/files/upload', authMiddleware, upload.array('files'), fileController.uploadFiles);
router.post('/files/create', authMiddleware, fileController.createEmptyFile);
router.get('/files', authMiddleware, fileController.getFiles);
router.delete('/files/:id', authMiddleware, fileController.deleteFile);
router.patch('/files/:id', authMiddleware, fileController.updateFile);
router.put('/files/:id/content', authMiddleware, fileController.updateFileContent);
router.get('/files/:id/download', authMiddleware, fileController.downloadFile);
router.post('/files/:id/share', authMiddleware, fileController.shareFile);
router.get('/files/shared', authMiddleware, fileController.getSharedFiles);
router.delete('/files/share/:id', authMiddleware, fileController.unshareFile);

// Folders
router.post('/folders', authMiddleware, folderController.createFolder);
router.get('/folders', authMiddleware, folderController.getFolders);
router.patch('/folders/:id', authMiddleware, folderController.updateFolder);
router.delete('/folders/:id', authMiddleware, folderController.deleteFolder);
router.get('/folders/:id/hierarchy', authMiddleware, folderController.getFolderHierarchy);

// Trash
router.delete('/trash', authMiddleware, fileController.emptyTrash);

// Notifications
router.get('/notifications', authMiddleware, notificationController.getNotifications);
router.patch('/notifications/:id/read', authMiddleware, notificationController.markAsRead);
router.delete('/notifications/:id', authMiddleware, notificationController.deleteNotification);

// Admin
router.get('/admin/users', authMiddleware, adminMiddleware, adminController.getAllUsers);
router.get('/admin/files', authMiddleware, adminMiddleware, adminController.getAllFiles);
router.get('/admin/logs', authMiddleware, adminMiddleware, adminController.getAuditLogs);
router.patch('/admin/users/:id/role', authMiddleware, adminMiddleware, adminController.updateUserRole);

export default router;
