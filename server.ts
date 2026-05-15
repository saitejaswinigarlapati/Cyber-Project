import express from 'express';
import { createServer as createViteServer } from 'vite';
import * as path from 'path';
import * as fs from 'fs';
import cors from 'cors';
import multer from 'multer';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';
import apiRoutes from './src/server/routes/api.ts';
import { supabase } from './src/server/lib/supabase.ts';

// Load environment variables
dotenv.config();

async function seedAdmin() {
  try {
    const adminEmail = 'admin@gmail.com';
    const adminPassword = '#cyber@123';
    
    console.log(`[Seed] Checking for admin: ${adminEmail}`);
    
    // Use admin client (service role) to check/create
    const { data, error: listError } = await supabase.auth.admin.listUsers();
    
    if (listError) {
      console.warn('[Seed] Could not list users, might be missing service role key permissions.');
      return;
    }
    
    const users = data.users as any[];
    const existingAdmin = users.find(u => u.email === adminEmail);
    
    if (existingAdmin) {
      console.log(`[Seed] Admin user already exists with ID: ${existingAdmin.id}`);
      
      // Ensure role is admin in public.users
      const { data: profile } = await supabase
        .from('users')
        .select('role')
        .eq('id', existingAdmin.id)
        .maybeSingle();
      
      if (!profile || profile.role !== 'admin') {
        console.log('[Seed] Updating admin role in database...');
        await supabase.from('users').upsert({
          id: existingAdmin.id,
          email: adminEmail,
          name: 'Cyber Admin',
          role: 'admin',
          updated_at: new Date().toISOString()
        });
      }
    } else {
      console.log('[Seed] Creating admin user...');
      const { data: newUser, error: createError } = await supabase.auth.admin.createUser({
        email: adminEmail,
        password: adminPassword,
        email_confirm: true,
        user_metadata: {
          full_name: 'Cyber Admin'
        }
      });
      
      if (createError) {
        console.error('[Seed] Failed to create admin user:', createError.message);
      } else if (newUser.user) {
        console.log(`[Seed] Admin user created with ID: ${newUser.user.id}`);
        // Create profile
        await supabase.from('users').insert({
          id: newUser.user.id,
          email: adminEmail,
          name: 'Cyber Admin',
          role: 'admin'
        });
      }
    }
  } catch (err) {
    console.error('[Seed] Unexpected error during seeding:', err);
  }
}

const rootDir = process.cwd();

// Ensure uploads directory exists
const uploadsDir = path.join(rootDir, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

async function startServer() {
  await seedAdmin();
  const app = express();
  const PORT = 3000;

  // Trust proxy for rate limiting (behind Nginx)
  app.set('trust proxy', 1);

  // Security Middlewares
  app.use(helmet({
    contentSecurityPolicy: false, 
    crossOriginResourcePolicy: { policy: "cross-origin" },
    crossOriginEmbedderPolicy: false,
    frameguard: false,
    xssFilter: false,
    noSniff: false,
  }));

  app.use((req, res, next) => {
    if (req.path.includes('/download')) {
      console.log(`Download request: ${req.path} - Token in query: ${!!req.query.token}`);
    }
    next();
  });
  app.use(cors());
  
  // Custom middleware to avoid json parsing for multipart requests
  app.use((req, res, next) => {
    const contentType = req.headers['content-type']?.toLowerCase() || '';
    if (contentType.includes('multipart/form-data')) {
      return next();
    }
    express.json()(req, res, next);
  });
  app.use((req, res, next) => {
    const contentType = req.headers['content-type']?.toLowerCase() || '';
    if (contentType.includes('multipart/form-data')) {
      return next();
    }
    express.urlencoded({ extended: true })(req, res, next);
  });

  // Rate Limiting
  const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 1000, // Increased for dev sessions
    message: 'Too many requests from this IP, please try again after 15 minutes',
  });
  app.use('/api', limiter);

  // Health check
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  app.use('/api', apiRoutes);

  // Multer Error Handling Middleware
  app.use((err: any, req: any, res: any, next: any) => {
    console.error('Global Error Handler:', err);
    if (err instanceof multer.MulterError) {
      console.error('Multer Error Detected:', err.code, err.message);
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ error: 'File too large', details: 'The maximum file size is 10MB.' });
      }
      return res.status(400).json({ error: `Upload Error: ${err.message}`, details: err.code });
    }
    next(err);
  });

  // Serve uploaded files
  app.use('/uploads', express.static(uploadsDir));

  // Vite Integration
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(rootDir, 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running at http://localhost:${PORT}`);
  });
}

startServer();
