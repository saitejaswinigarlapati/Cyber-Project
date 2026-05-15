import React, { useState, useEffect, useCallback } from 'react';
import { useParams, Link, useLocation, useSearchParams, useNavigate } from 'react-router-dom';
import { 
  FolderPlus, 
  Upload, 
  ChevronRight, 
  ChevronLeft,
  MoreVertical, 
  Download, 
  Trash2, 
  Edit2, 
  FileIcon, 
  Folder as FolderIcon,
  Search,
  LayoutGrid,
  List as ListIcon,
  Loader2,
  X,
  Plus,
  Star,
  Clock,
  ArrowUpDown,
  Eye,
  Save,
  RotateCcw,
  ExternalLink,
  Share2,
  UserPlus,
  Users,
  ShieldCheck
} from 'lucide-react';
import api from '../services/api.ts';
import { cn, formatFileSize, formatDate } from '../lib/utils.ts';
import { motion, AnimatePresence } from 'motion/react';
import { Reveal, StaggerContainer } from '../components/animations/Reveal.tsx';
import { TiltCard } from '../components/animations/TiltCard.tsx';
import { Magnetic } from '../components/animations/Magnetic.tsx';
import { pdfjs, Document, Page } from 'react-pdf';

// Configure PDF.js worker
pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';

import { useAuth } from '../context/AuthContext.tsx';
import { useModals } from '../context/ModalContext.tsx';

const Dashboard: React.FC = () => {
  const { folderId } = useParams();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const { user, token: authToken } = useAuth();
  const { activeModal, closeModal, openModal, uploadFolderMode, setUploadFolderMode } = useModals();
  const currentPath = location.pathname;
  const searchQuery = searchParams.get('q') || '';
  const navigate = useNavigate();

  const [files, setFiles] = useState<any[]>([]);
  const [folders, setFolders] = useState<any[]>([]);
  const [hierarchy, setHierarchy] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [sortBy, setSortBy] = useState<'name' | 'size' | 'date'>('date');
  const [newFolderName, setNewFolderName] = useState('');
  const [newFileName, setNewFileName] = useState('');
  const [newFileContent, setNewFileContent] = useState('');
  const [uploading, setUploading] = useState(false);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [selectedFileForPreview, setSelectedFileForPreview] = useState<any | null>(null);
  const [previewContent, setPreviewContent] = useState<string | null>(null);
  const [isEditingPreview, setIsEditingPreview] = useState(false);
  const [saveLoading, setSaveLoading] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  const getFilter = () => {
    if (searchQuery) return 'search';
    if (currentPath === '/recent') return 'recent';
    if (currentPath === '/starred') return 'starred';
    if (currentPath === '/trash') return 'trash';
    if (currentPath === '/shared') return 'shared';
    if (currentPath === '/folders') return 'all-folders';
    if (currentPath === '/spam') return 'spam';
    return null;
  };

  const getPageTitle = () => {
    if (searchQuery) return `Search results for "${searchQuery}"`;
    if (currentPath === '/shared') return 'Shared Files';
    if (currentPath === '/recent') return 'Recent Files';
    if (currentPath === '/starred') return 'Starred Files';
    if (currentPath === '/trash') return 'Trash';
    if (currentPath === '/folders') return 'All Folders';
    if (currentPath === '/spam') return 'Spam';
    if (folderId) return hierarchy[hierarchy.length - 1]?.name || 'Folder';
    return 'All Files';
  };

  const [pdfBlobUrl, setPdfBlobUrl] = useState<string | null>(null);
  const [isPdfLoading, setIsPdfLoading] = useState(false);
  const [numPages, setNumPages] = useState<number>(0);
  const [pageNumber, setPageNumber] = useState<number>(1);
  const [sharingFile, setSharingFile] = useState<any | null>(null);
  const [shareEmail, setShareEmail] = useState('');
  const [sharePermission, setSharePermission] = useState<'view' | 'edit'>('view');
  const [shareLoading, setShareLoading] = useState(false);

  const [previewError, setPreviewError] = useState<string | null>(null);

  function onDocumentLoadSuccess({ numPages }: { numPages: number }) {
    setNumPages(numPages);
    setPageNumber(1);
  }

  useEffect(() => {
    let url: string | null = null;
    
    const loadPdf = async () => {
      if (selectedFileForPreview && selectedFileForPreview.mime_type?.includes('pdf')) {
        setIsPdfLoading(true);
        setPreviewError(null);
        console.log(`[PDF Preview] Initiating fetch for file: ${selectedFileForPreview.name} (${selectedFileForPreview.id})`);
        try {
          // Use arraybuffer for maximum cross-browser reliability then wrap in Blob
          const response = await api.get(`/files/${selectedFileForPreview.id}/download`, {
            params: { inline: 'true' },
            responseType: 'arraybuffer'
          });
          
          const contentType = response.headers['content-type'] || 'application/pdf';
          const buffer = response.data;
          
          console.log(`[PDF Preview] Headers received:`, response.headers);
          console.log(`[PDF Preview] Buffer length: ${buffer.byteLength} bytes`);

          // VALIDATION: Prevent HTML leakage
          const contentTypeStr = (response.headers['content-type'] || '').toString().toLowerCase();
          
          // Check if it's an error JSON instead of binary
          if (contentTypeStr.includes('application/json')) {
            const textContent = new TextDecoder().decode(new Uint8Array(buffer));
            try {
              const errJson = JSON.parse(textContent);
              throw new Error(errJson.error || 'Server returned an error');
            } catch (e) {
              throw new Error('Failed to parse error response');
            }
          }

          if (contentTypeStr.includes('text/html')) {
            console.error('[PDF Preview] Server returned HTML for download endpoint. Likely a fallback or redirect.');
            throw new Error('File not found or access denied (Invalid format received)');
          }

          // Critical Validation: Check if it looks like a PDF (PDF header is %PDF-)
          const header = new TextDecoder().decode(new Uint8Array(buffer.slice(0, 5)));
          console.log(`[PDF Preview] File header magic: "${header}"`);

          if (header !== '%PDF-') {
            console.warn('[PDF Preview] Warning: File header does not look like a standard PDF.');
            // Check if it's an error message (JSON or HTML)
            if (buffer.byteLength < 5000) {
              const textContent = new TextDecoder().decode(new Uint8Array(buffer));
              if (textContent.includes('<html') || textContent.includes('{"error"')) {
                console.error('[PDF Preview] Detected error content instead of binary PDF:', textContent);
                throw new Error('Server returned an error page or JSON instead of a PDF binary.');
              }
            }
          }

          const blob = new Blob([buffer], { type: 'application/pdf' });
          console.log(`[PDF Preview] Blob created. Size: ${blob.size}, Type: ${blob.type}`);

          if (blob.size === 0) {
            throw new Error('Blob creation resulted in an empty file.');
          }
          
          // Use FileReader for potentially better reliability in iframes
          console.log(`[PDF Preview] Converting blob to Data URL...`);
          const reader = new FileReader();
          reader.onloadend = () => {
             const dataUrl = reader.result as string;
             setPdfBlobUrl(dataUrl);
             console.log(`[PDF Preview] Data URL generated (Length: ${dataUrl.length})`);
          };
          reader.onerror = () => {
             console.error('[PDF Preview] FileReader failed');
             setPreviewError('Failed to process binary data');
          };
          reader.readAsDataURL(blob);
        } catch (error: any) {
          console.error('[PDF Preview] Pipeline failed:', error);
          const msg = error.response?.data?.error || error.message || 'Failed to load PDF preview';
          setPreviewError(msg);
          setPdfBlobUrl(null);
        } finally {
          setIsPdfLoading(false);
        }
      } else {
        setPdfBlobUrl(null);
        setPreviewError(null);
      }
    };

    loadPdf();

    // No need to revoke if we use Data URLs, but we should clear if we switch back to Object URLs
  }, [selectedFileForPreview]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    const filter = getFilter();
    try {
      const [filesRes, foldersRes] = await Promise.all([
        (filter === 'all-folders' || filter === 'spam') ? Promise.resolve({ data: [] }) : 
        (filter === 'shared') ? api.get('/files/shared') :
        api.get(`/files?folderId=${folderId || 'null'}${filter ? `&filter=${filter}` : ''}${searchQuery ? `&q=${searchQuery}` : ''}`),
        (filter === 'all-folders') ? api.get('/folders?filter=all') : 
        (filter && filter !== 'search' ? Promise.resolve({ data: [] }) : api.get(`/folders?parentId=${folderId || 'null'}${searchQuery ? `&q=${searchQuery}` : ''}`)),
      ]);
      setFiles(filesRes.data);
      setFolders(foldersRes.data);

      if (folderId) {
        const hierarchyRes = await api.get(`/folders/${folderId}/hierarchy`);
        setHierarchy(hierarchyRes.data);
      } else {
        setHierarchy([]);
      }
    } catch (error: any) {
      console.error('Failed to fetch data', error);
      const message = error.response?.data?.error || error.message || 'Failed to fetch data';
      const details = error.response?.data?.details;
      // Show error but don't block the UI with alerts constantly
      // Only alert if it's a persistent 500 error
      if (error.response?.status === 500) {
        alert(`Data Integrity Error: ${message}${details ? `\n\nDetail: ${details}` : ''}`);
      }
    } finally {
      setLoading(false);
    }
  }, [folderId, currentPath, searchQuery]);

  const sortedFiles = [...files].sort((a, b) => {
    if (sortBy === 'name') return a.name.localeCompare(b.name);
    if (sortBy === 'size') return b.size - a.size;
    return new Date(b.created_at || b.createdAt).getTime() - new Date(a.created_at || a.createdAt).getTime();
  });

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.05
      }
    }
  };

  const itemVariants = {
    hidden: { y: 20, opacity: 0 },
    visible: {
      y: 0,
      opacity: 1,
      transition: {
        type: 'spring',
        stiffness: 300,
        damping: 24
      }
    }
  };

  useEffect(() => {
    fetchData();
    setSelectedFileForPreview(null);
  }, [fetchData]);

  const handleCreateFolder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFolderName.trim()) return;

    const injectionPatterns = /['";]|<script.*?>.*?<\/script>i|\$where|\{.*\}/;
    if (injectionPatterns.test(newFolderName)) {
      alert('Invalid characters in folder name');
      return;
    }

    try {
      await api.post('/folders', { name: newFolderName, parentId: folderId || null });
      setNewFolderName('');
      closeModal();
      fetchData();
    } catch (error: any) {
      console.error('Failed to create folder', error);
      const message = error.response?.data?.error || error.message || 'Failed to create folder';
      const details = error.response?.data?.details;
      alert(`Folder Cluster Error: ${message}${details ? `\n\nSolution: ${details}` : ''}`);
    }
  };

  const handleCreateFile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFileName.trim()) return;

    const injectionPatterns = /['";]|<script.*?>.*?<\/script>i|\$where|\{.*\}/;
    if (injectionPatterns.test(newFileName)) {
      alert('Invalid characters in file name');
      return;
    }

    try {
      await api.post('/files/create', { 
        name: newFileName, 
        folderId: folderId || null,
        content: newFileContent
      });
      setNewFileName('');
      setNewFileContent('');
      closeModal();
      fetchData();
    } catch (error: any) {
      console.error('Failed to create file', error);
      const message = error.response?.data?.error || error.message || 'Failed to create file';
      alert(`Vault Error: ${message}${error.response?.data?.details ? `\n\nDetails: ${error.response.data.details}` : ''}`);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const filesList = e.target.files;
    if (!filesList || filesList.length === 0) return;

    setUploading(true);
    const formData = new FormData();
    for (let i = 0; i < filesList.length; i++) {
        formData.append('files', filesList[i]);
    }
    if (folderId) formData.append('folderId', folderId);

    try {
      await api.post('/files/upload', formData);
      closeModal();
      await fetchData();
    } catch (error: any) {
      console.error('Failed to upload file:', error);
      const message = error.response?.data?.error || error.message || 'Failed to upload file';
      const details = error.response?.data?.details;
      alert(`Upload Error: ${message}${details ? `\n\nDetails: ${details}` : ''}`);
    } finally {
      setUploading(false);
      // Reset input value to allow selecting same file again
      e.target.value = '';
    }
  };

  const handleDeleteFile = async (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    console.log('Attempting to delete file:', id);
    try {
      const res = await api.delete(`/files/${id}`);
      console.log('Delete file response:', res.data);
      fetchData();
    } catch (error: any) {
      console.error('Failed to delete file', error);
      const message = error.response?.data?.error || error.message || 'Failed to delete file';
      alert(message);
    }
  };

  const handleDeleteFolder = async (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    console.log('Attempting to delete folder:', id);
    try {
      const res = await api.delete(`/folders/${id}`);
      console.log('Delete folder response:', res.data);
      fetchData();
    } catch (error: any) {
      console.error('Failed to delete folder', error);
      const message = error.response?.data?.error || error.message || 'Failed to delete folder';
      alert(message);
    }
  };

  const handleDownload = (id: string, name: string) => {
    window.open(`/api/files/${id}/download?token=${authToken}`, '_blank');
  };

  const handleToggleStar = async (id: string, currentStarred: boolean) => {
    try {
      await api.patch(`/files/${id}`, { is_starred: !currentStarred });
      fetchData();
    } catch (error) {
      console.error('Failed to toggle star', error);
    }
  };

  const handleRestoreFile = async (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    try {
      await api.patch(`/files/${id}`, { is_trash: false });
      fetchData();
    } catch (error) {
      console.error('Failed to restore file', error);
    }
  };

  const handleRestoreFolder = async (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    try {
      await api.patch(`/folders/${id}`, { is_trash: false });
      fetchData();
    } catch (error) {
      console.error('Failed to restore folder', error);
    }
  };

  const handleRenameFile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!renamingId || !editingName.trim()) return;

    const injectionPatterns = /['";]|<script.*?>.*?<\/script>i|\$where|\{.*\}/;
    if (injectionPatterns.test(editingName)) {
      alert('Invalid characters in name');
      return;
    }

    try {
      await api.patch(`/files/${renamingId}`, { name: editingName.trim() });
      setRenamingId(null);
      setEditingName('');
      fetchData();
    } catch (error: any) {
      console.error('Failed to rename file', error);
      const message = error.response?.data?.error || error.message || 'Failed to rename file';
      alert(message);
    }
  };

  const [imageError, setImageError] = useState(false);

  const handlePreview = async (file: any) => {
    console.log('Previewing file:', file);
    setSelectedFileForPreview(file);
    setIsEditingPreview(false);
    setImageError(false); // Reset error state
    
    const mimeType = file.mime_type || file.mimeType;
    const isText = (mimeType && mimeType.startsWith('text/')) || 
                   file.name.endsWith('.txt') || 
                   file.name.endsWith('.md') ||
                   file.name.endsWith('.js') ||
                   file.name.endsWith('.ts') ||
                   file.name.endsWith('.json');
    
    if (isText) {
      setPreviewLoading(true);
      try {
        const res = await api.get(`/files/${file.id}/download?inline=true`, { responseType: 'text' });
        setPreviewContent(res.data);
      } catch (error) {
        console.error('Failed to load file preview', error);
        setPreviewContent('Failed to load preview content.');
      } finally {
        setPreviewLoading(false);
      }
    } else {
      setPreviewContent(null);
      setPreviewLoading(false);
    }
  };

  const handleSavePreview = async () => {
    if (!selectedFileForPreview) return;
    setSaveLoading(true);
    try {
      await api.put(`/files/${selectedFileForPreview.id}/content`, { content: previewContent });
      setIsEditingPreview(false);
      fetchData();
    } catch (error) {
      console.error('Failed to save file content', error);
      alert('Failed to save file content');
    } finally {
      setSaveLoading(false);
    }
  };

  const handleEmptyTrash = async () => {
    console.log('Attempting to empty trash');
    try {
      const res = await api.delete('/trash');
      console.log('Empty trash response:', res.data);
      fetchData();
    } catch (error) {
      console.error('Failed to empty trash', error);
    }
  };

  const handleShare = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sharingFile || !shareEmail.trim()) return;

    setShareLoading(true);
    try {
      const isEmail = shareEmail.includes('@');
      const payload: any = { permission: sharePermission };
      
      if (isEmail) {
        payload.email = shareEmail.trim();
      } else {
        payload.name = shareEmail.trim();
      }

      const response = await api.post(`/files/${sharingFile.id}/share`, payload);
      setShareEmail('');
      setSharePermission('view');
      setSharingFile(null);
      alert(response.data.message || 'File shared successfully');
    } catch (error: any) {
      console.error('Failed to share file:', error);
      let message = 'Failed to share file';
      let details = '';
      
      if (error.response) {
        // The server responded with a status code that falls out of the range of 2xx
        const errorData = error.response.data;
        message = typeof errorData === 'string' ? errorData : (errorData?.error || `Server Error: ${error.response.status}`);
        details = errorData?.details || '';
      } else if (error.request) {
        // The request was made but no response was received
        message = 'No response from server. Check your internet connection.';
      } else {
        // Something happened in setting up the request that triggered an Error
        message = error.message;
      }
      
      alert(`${message}${details ? `\n\n${details}` : ''}`);
    } finally {
      setShareLoading(false);
    }
  };

  const handleUnshare = async (shareId: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (!confirm('Are you sure you want to remove access to this file?')) return;

    try {
      await api.delete(`/files/share/${shareId}`);
      fetchData();
    } catch (error: any) {
      console.error('Failed to unshare', error);
      alert(error.response?.data?.error || 'Failed to unshare');
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    
    if (uploading) return;

    const filesList = e.dataTransfer.files;
    if (!filesList || filesList.length === 0) return;

    setUploading(true);
    const formData = new FormData();
    for (let i = 0; i < filesList.length; i++) {
        formData.append('files', filesList[i]);
    }
    if (folderId) formData.append('folderId', folderId);

    try {
      await api.post('/files/upload', formData);
      closeModal();
      await fetchData();
    } catch (error: any) {
      console.error('Failed to upload via drop:', error);
      const message = error.response?.data?.error || error.message || 'Upload failed';
      const details = error.response?.data?.details;
      alert(`Drop Upload Error: ${message}${details ? `\n\nDetails: ${details}` : ''}`);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto space-y-8 animate-in fade-in duration-500">
      {/* Breadcrumbs and Actions */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black text-white tracking-tighter mb-2 italic uppercase">
            {getPageTitle()}
          </h1>
          <nav className="flex items-center gap-1 text-[10px] font-black uppercase tracking-widest overflow-x-auto pb-2 md:pb-0 scrollbar-hide">
            <Link to="/" className="text-gray-500 hover:text-blue-500 transition-colors whitespace-nowrap">Dashboard</Link>
            {hierarchy.map((item) => (
              <React.Fragment key={`breadcrumb-${item.id}`}>
                <ChevronRight className="w-4 h-4 text-gray-700 shrink-0" />
                <Link to={`/folder/${item.id}`} className="text-gray-500 hover:text-blue-500 transition-colors whitespace-nowrap">
                  {item.name}
                </Link>
              </React.Fragment>
            ))}
            {(currentPath === '/shared' || getFilter() === 'shared') && (
              <React.Fragment key="breadcrumb-shared">
                <ChevronRight className="w-4 h-4 text-gray-700 shrink-0" />
                <span className="text-blue-500 whitespace-nowrap">Shared Files</span>
              </React.Fragment>
            )}
          </nav>
        </div>

        <div className="flex items-center gap-3 self-end md:self-auto">
          <div className="flex items-center gap-2 bg-[#141416] border border-white/5 rounded-xl px-4 py-2.5 shadow-xl">
            <ArrowUpDown className="w-4 h-4 text-gray-500" />
            <select 
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              className="text-[10px] font-black uppercase tracking-widest text-gray-400 bg-transparent outline-none cursor-pointer"
            >
              <option value="date">Date</option>
              <option value="name">Name</option>
              <option value="size">Size</option>
            </select>
          </div>

          <div className="flex items-center p-1 bg-white/5 rounded-xl border border-white/5">
            <button 
              onClick={() => setViewMode('grid')}
              className={cn("p-2 rounded-lg transition-all", viewMode === 'grid' ? "bg-white/10 text-blue-500 shadow-xl" : "text-gray-600")}
            >
              <LayoutGrid className="w-4 h-4" />
            </button>
            <button 
              onClick={() => setViewMode('list')}
              className={cn("p-2 rounded-lg transition-all", viewMode === 'list' ? "bg-white/10 text-blue-500 shadow-xl" : "text-gray-600")}
            >
              <ListIcon className="w-4 h-4" />
            </button>
          </div>
          {!getFilter() && (
            <>
              <Magnetic padding={0.1}>
                <button 
                  onClick={() => openModal('folder')}
                  className="flex items-center gap-2 px-6 py-2.5 bg-[#141416] border border-white/5 rounded-xl text-xs font-black uppercase tracking-widest text-gray-300 hover:bg-white/5 hover:border-blue-500/50 transition-all shadow-xl"
                >
                  <FolderPlus className="w-4 h-4 text-blue-500" />
                  New Folder
                </button>
              </Magnetic>
              <Magnetic padding={0.1}>
                <button 
                  onClick={() => { setUploadFolderMode(false); openModal('upload'); }}
                  className="flex items-center gap-2 px-6 py-2.5 bg-blue-600 rounded-xl text-xs font-black uppercase tracking-widest text-white hover:bg-blue-500 shadow-2xl shadow-blue-900/20 transition-all active:scale-[0.98]"
                >
                  <Upload className="w-4 h-4" />
                  Upload Files
                </button>
              </Magnetic>
            </>
          )}
          {getFilter() === 'trash' && (
            <button 
              onClick={handleEmptyTrash}
              className="flex items-center gap-2 px-6 py-2.5 bg-red-600/10 border border-red-500/20 rounded-xl text-xs font-black uppercase tracking-widest text-red-500 hover:bg-red-500/20 transition-all shadow-xl italic"
            >
              <Trash2 className="w-4 h-4" />
              Empty Trash
            </button>
          )}
        </div>
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-32 space-y-4">
          <Loader2 className="w-12 h-12 text-blue-500 animate-spin" />
          <p className="text-gray-500 font-medium animate-pulse">Loading files...</p>
        </div>
      ) : (
        <div className="space-y-12 pb-20">
          {/* Starred / Quick Access (Only on root dash) */}
          {!folderId && !searchQuery && currentPath === '/' && files.some(f => f.is_starred || f.isStarred) && (
            <section className="space-y-4">
              <Reveal className="flex items-center justify-between ml-1">
                <h2 className="text-sm font-bold text-gray-500 uppercase tracking-wider flex items-center gap-2">
                  <Star className="w-4 h-4 text-yellow-500 fill-current" />
                  Quick Access
                </h2>
              </Reveal>
              <StaggerContainer 
                className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6"
              >
                {files.filter(f => f.is_starred || f.isStarred).slice(0, 4).map((file) => (
                  <motion.div
                    key={`starred-${file.id}`}
                    variants={itemVariants}
                    layoutId={`starred-${file.id}`}
                    onDoubleClick={() => handlePreview(file)}
                    className="relative"
                  >
                    <TiltCard intensity={10} className="h-full">
                      <div className="group bg-[#141416] p-5 rounded-[2rem] border border-white/5 shadow-xl hover:shadow-blue-900/10 hover:border-blue-500/30 transition-all flex flex-col gap-4 relative cursor-pointer h-full">
                        <div className="flex items-start justify-between">
                          <div className="w-10 h-10 bg-blue-500/10 rounded-xl flex items-center justify-center text-blue-500">
                            <FileIcon className="w-5 h-5" />
                          </div>
                          <button 
                            onClick={() => handleToggleStar(file.id, true)}
                            className="p-1.5 text-yellow-500 bg-yellow-500/10 rounded-lg transition-all"
                          >
                            <Star className="w-4 h-4 fill-current" />
                          </button>
                        </div>
                        <div className="min-w-0">
                          <h3 className="font-black text-white truncate text-xs uppercase tracking-wider" title={file.name}>{file.name}</h3>
                          <p className="text-[9px] text-gray-500 font-black uppercase tracking-widest mt-1">{formatDate(file.updated_at || file.updatedAt)}</p>
                        </div>
                        <button 
                          onClick={() => handleDownload(file.id, file.name)}
                          className="mt-auto w-full py-2 bg-white/5 border border-white/10 text-gray-400 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-blue-600 hover:text-white hover:border-blue-600 transition-all shadow-sm"
                        >
                          Download
                        </button>
                      </div>
                    </TiltCard>
                  </motion.div>
                ))}
              </StaggerContainer>
            </section>
          )}

          {/* Folders Section */}
          {folders.length > 0 && (
            <section className="space-y-4">
              <h2 className="text-[10px] font-black text-gray-500 uppercase tracking-widest ml-1">Folders</h2>
              <StaggerContainer 
                className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4"
              >
                {folders.map((folder) => (
                  <motion.div
                    key={folder.id}
                    variants={itemVariants}
                    layoutId={folder.id}
                    onDoubleClick={() => getFilter() !== 'trash' && navigate(`/folder/${folder.id}`)}
                    className="relative"
                  >
                    <TiltCard intensity={5}>
                      <div className="group relative bg-[#141416] p-4 rounded-2xl border border-white/5 shadow-xl hover:shadow-blue-900/10 hover:border-blue-500/30 transition-all cursor-pointer overflow-hidden">
                        <div className="flex items-center gap-4 relative z-10">
                          <div className="p-3 bg-blue-500/10 rounded-xl text-blue-500 group-hover:scale-110 transition-transform">
                            <FolderIcon className="w-6 h-6 fill-current" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <h3 className="font-black text-white truncate text-xs uppercase tracking-wider">{folder.name}</h3>
                            <p className="text-[9px] text-gray-500 font-black uppercase tracking-widest">Modified {formatDate(folder.updated_at || folder.updatedAt)}</p>
                          </div>
                          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all">
                            {getFilter() === 'trash' ? (
                              <>
                                <button 
                                  onClick={(e) => handleRestoreFolder(folder.id, e)}
                                  className="p-1.5 text-gray-600 hover:text-blue-500 hover:bg-blue-500/10 rounded-lg transition-all"
                                  title="Restore"
                                >
                                  <RotateCcw className="w-4 h-4" />
                                </button>
                                <button 
                                  onClick={(e) => handleDeleteFolder(folder.id, e)}
                                  className="p-1.5 text-gray-600 hover:text-red-500 hover:bg-red-500/10 rounded-lg transition-all"
                                  title="Delete Permanently"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </>
                            ) : (
                              <button 
                                onClick={(e) => handleDeleteFolder(folder.id, e)}
                                className="p-1.5 text-gray-600 hover:text-red-500 hover:bg-red-500/10 rounded-lg transition-all"
                              >
                                <Trash2 className="w-4 h-4" />
                                </button>
                            )}
                          </div>
                        </div>
                      </div>
                    </TiltCard>
                  </motion.div>
                ))}
              </StaggerContainer>
            </section>
          )}

          {/* Files Section */}
          <section className="space-y-4">
            <h2 className="text-[10px] font-black text-gray-500 uppercase tracking-widest ml-1">{getFilter() === 'all-folders' ? '' : 'Files'}</h2>
            {files.length === 0 ? (
              folders.length === 0 && (
                <Reveal width="w-full">
                  <div className="bg-[#141416]/50 border border-white/5 rounded-[3rem] p-16 flex flex-col items-center justify-center text-center space-y-6 shadow-2xl backdrop-blur-sm">
                    <div className="w-24 h-24 bg-white/5 rounded-full flex items-center justify-center text-gray-700">
                      <FileIcon className="w-12 h-12" />
                    </div>
                    <div className="space-y-2">
                      <h3 className="text-xl font-black text-white tracking-tight uppercase italic">
                        {getFilter() === 'trash' ? "Trash is empty" : 
                         getFilter() === 'shared' ? "No shared files" : 
                         getFilter() === 'spam' ? "Inbox Zero (Spam)" : 
                         getFilter() === 'all-folders' ? "No folders created" :
                         folderId ? "Folder is empty" : "No files yet"}
                      </h3>
                      <p className="text-gray-500 max-w-xs mx-auto text-xs font-bold uppercase tracking-wider">
                        {getFilter() === 'trash' 
                          ? "Items you delete will show up here." 
                          : getFilter() === 'shared'
                            ? "Files shared with you will appear here."
                            : getFilter() === 'spam'
                              ? "You have no quarantined items. Your inbox is clean."
                              : getFilter() === 'all-folders'
                                ? "Organize your vault by creating folders."
                                : folderId 
                                  ? "Move your data into this secure cluster." 
                                  : "Start your journey by uploading assets."
                        }
                      </p>
                    </div>
                    {getFilter() !== 'trash' && !['shared', 'spam'].includes(getFilter() || '') && (
                      <button 
                        onClick={() => openModal(getFilter() === 'all-folders' ? 'folder' : 'upload')}
                        className="mt-4 text-blue-500 font-black uppercase tracking-widest text-xs hover:text-blue-400 transition-colors inline-flex items-center gap-2 px-8 py-3 bg-blue-500/10 rounded-xl hover:bg-blue-500/20 transition-all font-black"
                      >
                        <Plus className="w-4 h-4" />
                        {getFilter() === 'all-folders' ? 'Create First Folder' : 'Upload Assets'}
                      </button>
                    )}
                  </div>
                </Reveal>
              )
            ) : viewMode === 'grid' ? (
              <StaggerContainer 
                className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6"
              >
                {sortedFiles.map((file) => (
                  <motion.div
                    key={file.id}
                    variants={itemVariants}
                    layoutId={file.id}
                    onDoubleClick={() => getFilter() !== 'trash' && handlePreview(file)}
                    className="relative"
                  >
                    <TiltCard intensity={8}>
                      <div className="group bg-[#141416]/80 backdrop-blur-sm p-6 rounded-[2.5rem] border border-white/5 shadow-xl hover:shadow-blue-900/10 hover:border-blue-500/30 transition-all flex flex-col gap-5 relative cursor-pointer">
                        <div className="flex items-start justify-between">
                          <div className="w-12 h-12 bg-white/5 rounded-2xl flex items-center justify-center group-hover:bg-blue-500/10 group-hover:text-blue-500 transition-all">
                            <FileIcon className="w-6 h-6 text-gray-600 group-hover:text-blue-500" />
                          </div>
                          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all transform translate-y-1 group-hover:translate-y-0 text-white">
                            {getFilter() === 'trash' ? (
                              <>
                                <button 
                                  onClick={(e) => handleRestoreFile(file.id, e)}
                                  className="p-2 text-gray-500 hover:text-blue-500 hover:bg-blue-500/10 rounded-lg transition-all"
                                  title="Restore"
                                >
                                  <RotateCcw className="w-4 h-4" />
                                </button>
                                <button 
                                  onClick={(e) => handleDeleteFile(file.id, e)}
                                  className="p-2 text-gray-500 hover:text-red-500 hover:bg-red-500/10 rounded-lg transition-all"
                                  title="Delete Permanently"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </>
                            ) : (
                              <>
                                <button 
                                  onClick={() => handleToggleStar(file.id, file.is_starred || file.isStarred)}
                                  className={cn(
                                    "p-2 rounded-lg transition-all",
                                    (file.is_starred || file.isStarred) ? "text-yellow-500 bg-yellow-500/10" : "text-gray-500 hover:text-blue-500 hover:bg-blue-500/10"
                                  )}
                                  title={(file.is_starred || file.isStarred) ? "Unstar" : "Star"}
                                >
                                  <Star className={cn("w-4 h-4", (file.is_starred || file.isStarred) && "fill-current")} />
                                </button>
                                <button 
                                  onClick={() => handlePreview(file)}
                                  className="p-2 text-gray-500 hover:text-blue-500 hover:bg-blue-500/10 rounded-lg transition-all"
                                  title="Preview"
                                >
                                  <Eye className="w-4 h-4" />
                                </button>
                                <button 
                                  onClick={() => handleDownload(file.id, file.name)}
                                  className="p-2 text-gray-500 hover:text-blue-500 hover:bg-blue-500/10 rounded-lg transition-all"
                                  title="Download"
                                >
                                  <Download className="w-4 h-4" />
                                </button>
                                <button 
                                  onClick={() => setSharingFile(file)}
                                  className="p-2 text-gray-500 hover:text-indigo-500 hover:bg-indigo-500/10 rounded-lg transition-all"
                                  title="Share"
                                >
                                  <Share2 className="w-4 h-4" />
                                </button>
                                {getFilter() !== 'shared' && (
                                  <button 
                                    onClick={() => { setRenamingId(file.id); setEditingName(file.name); }}
                                    className="p-2 text-gray-500 hover:text-blue-500 hover:bg-blue-500/10 rounded-lg transition-all"
                                    title="Rename"
                                  >
                                    <Edit2 className="w-4 h-4" />
                                  </button>
                                )}
                                <button 
                                  onClick={(e) => getFilter() === 'shared' ? handleUnshare(file.share_id, e) : handleDeleteFile(file.id, e)}
                                  className="p-2 text-gray-500 hover:text-red-500 hover:bg-red-500/10 rounded-lg transition-all"
                                  title={getFilter() === 'shared' ? "Remove Share" : "Delete"}
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </>
                            )}
                          </div>
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center justify-between mb-2">
                            <h3 className="font-black text-white truncate text-xs uppercase tracking-wider" title={file.name}>{file.name}</h3>
                            <div className="w-5 h-5 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-[7px] font-black text-gray-500 uppercase overflow-hidden shrink-0 ml-2" title={file.shared_by_email || 'You'}>
                              {(file.shared_by_email || user?.email || 'U').charAt(0)}
                            </div>
                          </div>
                          
                          <div className="flex items-center gap-2 text-[9px] text-gray-500 font-black uppercase tracking-widest mt-2 border-t border-white/5 pt-2">
                            <span>{formatFileSize(file.size)}</span>
                            <span className="w-1 h-1 bg-gray-800 rounded-full" />
                            <span>{file.shared_at || file.created_at || file.createdAt ? formatDate(file.shared_at || file.created_at || file.createdAt) : 'N/A'}</span>
                          </div>

                          {file.shared_by_email && (
                            <div className="mt-2 flex items-center gap-1.5 px-2 py-1 bg-indigo-500/5 rounded-lg border border-indigo-500/10">
                              <Users className="w-2.5 h-2.5 text-indigo-400" />
                              <span className="text-[8px] text-indigo-400/80 font-black uppercase tracking-widest truncate">
                                Shared by {file.shared_by_email}
                              </span>
                            </div>
                          )}
                        </div>
                      </div>
                    </TiltCard>
                  </motion.div>
                ))}
              </StaggerContainer>
            ) : (
              <div className="bg-[#141416] rounded-3xl border border-white/5 shadow-xl overflow-hidden">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-white/5 bg-white/5">
                      <th className="px-6 py-4 text-[10px] font-black text-gray-500 uppercase tracking-widest">Name</th>
                      <th className="px-6 py-4 text-[10px] font-black text-gray-500 uppercase tracking-widest">
                        {getFilter() === 'shared' ? 'Shared by' : 'Owner'}
                      </th>
                      <th className="px-6 py-4 text-[10px] font-black text-gray-500 uppercase tracking-widest">Size</th>
                      <th className="px-6 py-4 text-[10px] font-black text-gray-500 uppercase tracking-widest">Type</th>
                      <th className="px-6 py-4 text-[10px] font-black text-gray-500 uppercase tracking-widest">
                        {getFilter() === 'shared' ? 'Shared At' : 'Modified'}
                      </th>
                      <th className="px-6 py-4 text-[10px] font-black text-gray-500 uppercase tracking-widest text-right">Actions</th>
                    </tr>
                  </thead>
                  <motion.tbody
                    variants={containerVariants}
                    initial="hidden"
                    animate="visible"
                  >
                    {sortedFiles.map((file) => (
                      <motion.tr 
                        key={file.id} 
                        variants={itemVariants}
                        onDoubleClick={() => getFilter() !== 'trash' && handlePreview(file)}
                        className="group hover:bg-white/5 transition-colors border-b border-white/5 last:border-0 cursor-pointer"
                      >
                        <td className="px-6 py-5">
                          <div className="flex items-center gap-3">
                            <FileIcon className="w-4 h-4 text-gray-600" />
                            <span className="font-black text-white text-xs uppercase tracking-wide truncate max-w-xs">{file.name}</span>
                          </div>
                        </td>
                        <td className="px-6 py-5">
                          <div className="flex items-center gap-2">
                            <div className="w-6 h-6 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-[8px] font-black text-gray-400 uppercase">
                              {(getFilter() === 'shared' ? (file.shared_by_email || 'U') : (user?.email || 'U')).charAt(0)}
                            </div>
                            <div className="flex flex-col">
                              <span className={cn(
                                "text-[10px] font-black uppercase tracking-widest",
                                getFilter() === 'shared' ? "text-indigo-400" : "text-gray-400"
                              )}>
                                {getFilter() === 'shared' ? (file.shared_by_email || 'Unknown') : 'Me'}
                              </span>
                              {file.shared_by_email && (
                                <span className="text-[7px] text-gray-600 font-bold uppercase tracking-widest mt-0.5">
                                  {file.permission === 'edit' ? 'Can Edit' : 'Read Only'}
                                </span>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-5 font-bold text-gray-500 text-[10px] uppercase tracking-widest whitespace-nowrap">{formatFileSize(file.size)}</td>
                        <td className="px-6 py-5 font-bold text-gray-500 text-[10px] uppercase tracking-widest">{(file.mime_type || file.mimeType || 'application/unknown').split('/')[1]?.toUpperCase() || 'FILE'}</td>
                        <td className="px-6 py-5 font-bold text-gray-500 text-[10px] uppercase tracking-widest whitespace-nowrap">
                          {getFilter() === 'shared' 
                            ? (file.shared_at ? formatDate(file.shared_at) : 'N/A')
                            : formatDate(file.updated_at || file.updatedAt || file.created_at || file.createdAt)
                          }
                        </td>
                        <td className="px-6 py-5 text-right">
                          <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-all transform translate-x-2 group-hover:translate-x-0">
                            {getFilter() === 'trash' ? (
                              <>
                                <button 
                                  onClick={(e) => handleRestoreFile(file.id, e)}
                                  className="p-2 text-gray-500 hover:text-blue-500 hover:bg-blue-500/10 rounded-lg transition-all"
                                  title="Restore"
                                >
                                  <RotateCcw className="w-4 h-4" />
                                </button>
                                <button 
                                  onClick={(e) => handleDeleteFile(file.id, e)}
                                  className="p-2 text-gray-500 hover:text-red-500 hover:bg-red-500/10 rounded-lg transition-all"
                                  title="Delete Permanently"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </>
                            ) : (
                              <>
                                <button 
                                  onClick={() => handleToggleStar(file.id, file.is_starred || file.isStarred)}
                                  className={cn(
                                    "p-2 rounded-lg transition-all",
                                    (file.is_starred || file.isStarred) ? "text-yellow-500 bg-yellow-500/10" : "text-gray-500 hover:text-blue-500 hover:bg-blue-500/10"
                                  )}
                                  title={(file.is_starred || file.isStarred) ? "Unstar" : "Star"}
                                >
                                  <Star className={cn("w-4 h-4", (file.is_starred || file.isStarred) && "fill-current")} />
                                </button>
                                <button 
                                  onClick={() => handlePreview(file)}
                                  className="p-2 text-gray-500 hover:text-blue-500 hover:bg-blue-500/10 rounded-lg transition-all"
                                  title="Preview"
                                >
                                  <Eye className="w-4 h-4" />
                                </button>
                                <button 
                                  onClick={() => handleDownload(file.id, file.name)}
                                  className="p-2 text-gray-500 hover:text-blue-500 hover:bg-blue-500/10 rounded-lg transition-all"
                                  title="Download"
                                >
                                  <Download className="w-4 h-4" />
                                </button>
                                <button 
                                  onClick={() => setSharingFile(file)}
                                  className="p-2 text-gray-500 hover:text-indigo-500 hover:bg-indigo-500/10 rounded-lg transition-all"
                                  title="Share"
                                >
                                  <Share2 className="w-4 h-4" />
                                </button>
                                {getFilter() !== 'shared' && (
                                  <button 
                                    onClick={() => { setRenamingId(file.id); setEditingName(file.name); }}
                                    className="p-2 text-gray-500 hover:text-blue-500 hover:bg-blue-500/10 rounded-lg transition-all"
                                    title="Rename"
                                  >
                                    <Edit2 className="w-4 h-4" />
                                  </button>
                                )}
                                <button 
                                  onClick={(e) => getFilter() === 'shared' ? handleUnshare(file.share_id, e) : handleDeleteFile(file.id, e)}
                                  className="p-2 text-gray-500 hover:text-red-500 hover:bg-red-500/10 rounded-lg transition-all"
                                  title={getFilter() === 'shared' ? "Remove Share" : "Delete"}
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                      </motion.tr>
                    ))}
                  </motion.tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      )}

      {/* Upload Modal */}
      <AnimatePresence>
        {activeModal === 'upload' && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => { if (!uploading) closeModal(); }}
              className="absolute inset-0 bg-black/80 backdrop-blur-md" 
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-[#1c1c1e] rounded-[3rem] shadow-2xl w-full max-w-md p-10 relative z-10 border border-white/5"
            >
              <button 
                onClick={() => closeModal()}
                className="absolute top-6 right-6 p-2 text-gray-500 hover:text-white hover:bg-white/5 rounded-xl transition-all"
              >
                <X className="w-5 h-5" />
              </button>
              <div className="flex flex-col items-center text-center space-y-6">
                <div className="w-20 h-20 bg-blue-500/10 rounded-2xl flex items-center justify-center text-blue-500">
                  {uploading ? (
                    <motion.div
                      animate={{ rotate: 360 }}
                      transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                    >
                      <Plus className="w-10 h-10" />
                    </motion.div>
                  ) : (
                    <Upload className="w-10 h-10" />
                  )}
                </div>
                <div className="space-y-2">
                  <h3 className="text-2xl font-black text-white tracking-tighter uppercase italic">
                    {uploading ? 'Encrypting Data...' : (uploadFolderMode ? 'Upload Folder' : 'Upload Files')}
                  </h3>
                  <p className="text-gray-500 text-[10px] font-black uppercase tracking-widest px-4 italic">
                    {uploading 
                      ? 'Please wait while we secure your assets in the vault.' 
                      : (uploadFolderMode 
                        ? 'Select a folder to upload all its contents.' 
                        : 'Select files to upload to your account.')}
                  </p>
                </div>
                
                <div className="w-full">
                  <label 
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={handleDrop}
                    className={cn(
                      "flex flex-col items-center justify-center w-full h-48 border-2 border-dashed rounded-[2.5rem] cursor-pointer transition-all group relative overflow-hidden",
                      isDragging ? "border-blue-500 bg-blue-500/10" : "border-white/5 hover:bg-white/5 hover:border-white/10",
                      uploading && "cursor-wait opacity-80"
                    )}
                  >
                    {uploading ? (
                      <div className="flex flex-col items-center space-y-6 w-full px-12">
                        <Loader2 className="w-12 h-12 text-blue-500 animate-spin" />
                        <div className="w-full bg-white/5 rounded-full h-1 overflow-hidden">
                          <motion.div 
                            initial={{ width: 0 }}
                            animate={{ width: "100%" }}
                            transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
                            className="bg-blue-500 h-full shadow-[0_0_15px_rgba(59,130,246,0.5)]"
                          />
                        </div>
                        <span className="text-[10px] font-black text-blue-400 uppercase tracking-widest italic animate-pulse">Syncing with Locker...</span>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center space-y-3 pointer-events-none">
                        <Plus className={cn("w-10 h-10 transition-all", isDragging ? "text-blue-500 scale-125" : "text-gray-600 group-hover:text-blue-500 group-hover:scale-110")} />
                        <span className="text-xs font-black text-gray-400 group-hover:text-white uppercase tracking-widest transition-colors">
                          {uploadFolderMode ? 'Choose Folder' : 'Choose Files'}
                        </span>
                        {!uploadFolderMode && <span className="text-[9px] text-gray-600 font-black uppercase tracking-[0.2em] italic">or drop them here</span>}
                      </div>
                    )}
                    <input 
                      type="file" 
                      className="hidden" 
                      onChange={handleFileUpload} 
                      disabled={uploading} 
                      multiple={!uploadFolderMode}
                      {...(uploadFolderMode ? { webkitdirectory: "", directory: "" } : {})}
                    />
                  </label>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Create File Modal */}
      <AnimatePresence>
        {activeModal === 'createFile' && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => closeModal()}
              className="absolute inset-0 bg-black/80 backdrop-blur-md" 
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-[#1c1c1e] rounded-[2.5rem] shadow-2xl w-full max-w-lg p-10 relative z-10 border border-white/5"
            >
              <h3 className="text-2xl font-black text-white tracking-tighter mb-6 flex items-center gap-3 uppercase italic">
                <div className="p-3 bg-blue-500/10 rounded-xl text-blue-500">
                  <FileIcon className="w-6 h-6" />
                </div>
                New Text File
              </h3>
              <form onSubmit={handleCreateFile} className="space-y-6">
                <div className="space-y-2">
                  <label className="text-xs font-black text-gray-500 uppercase tracking-widest ml-1">File Name</label>
                  <input
                    autoFocus
                    type="text"
                    value={newFileName}
                    onChange={(e) => setNewFileName(e.target.value)}
                    placeholder="E.g. notes.txt"
                    className="w-full bg-white/5 border border-white/5 focus:border-blue-500/50 rounded-2xl py-4 px-6 outline-none transition-all placeholder:text-gray-600 text-white font-bold uppercase tracking-widest text-xs"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-black text-gray-500 uppercase tracking-widest ml-1">Content (Optional)</label>
                  <textarea
                    value={newFileContent}
                    onChange={(e) => setNewFileContent(e.target.value)}
                    placeholder="Enter content here..."
                    className="w-full bg-white/5 border border-white/5 focus:border-blue-500/50 rounded-2xl py-4 px-6 outline-none transition-all placeholder:text-gray-600 font-mono text-xs min-h-[150px] resize-none text-blue-200/80 scrollbar-hide"
                  />
                </div>
                <div className="flex gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => closeModal()}
                    className="flex-1 px-4 py-4 bg-white/5 text-gray-400 font-black rounded-2xl hover:bg-white/10 transition-all uppercase tracking-widest text-xs"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="flex-1 px-4 py-4 bg-blue-600 text-white font-black rounded-2xl hover:bg-blue-500 shadow-xl shadow-blue-900/20 transition-all active:scale-[0.98] uppercase tracking-widest text-xs"
                  >
                    Create
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Rename Modal */}
      <AnimatePresence>
        {renamingId && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setRenamingId(null)}
              className="absolute inset-0 bg-black/80 backdrop-blur-md" 
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-[#1c1c1e] rounded-[2.5rem] shadow-2xl w-full max-w-sm p-10 relative z-10 border border-white/5"
            >
              <h3 className="text-2xl font-black text-white tracking-tighter mb-6 flex items-center gap-3 uppercase italic">
                <div className="p-3 bg-blue-500/10 rounded-xl text-blue-500">
                  <Edit2 className="w-6 h-6" />
                </div>
                Rename
              </h3>
              <form onSubmit={handleRenameFile} className="space-y-6">
                <div className="space-y-2">
                  <label className="text-xs font-black text-gray-500 uppercase tracking-widest ml-1">New Name</label>
                  <input
                    autoFocus
                    type="text"
                    value={editingName}
                    onChange={(e) => setEditingName(e.target.value)}
                    className="w-full bg-white/5 border border-white/5 focus:border-blue-500/50 rounded-2xl py-4 px-6 outline-none transition-all placeholder:text-gray-600 text-white font-bold uppercase tracking-widest text-xs"
                    required
                  />
                </div>
                <div className="flex gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setRenamingId(null)}
                    className="flex-1 px-4 py-4 bg-white/5 text-gray-400 font-black rounded-2xl hover:bg-white/10 transition-all uppercase tracking-widest text-xs"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="flex-1 px-4 py-4 bg-blue-600 text-white font-black rounded-2xl hover:bg-blue-500 shadow-xl shadow-blue-900/20 transition-all active:scale-[0.98] uppercase tracking-widest text-xs"
                  >
                    Update
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* New Folder Modal */}
      <AnimatePresence>
        {activeModal === 'folder' && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => closeModal()}
              className="absolute inset-0 bg-black/80 backdrop-blur-md" 
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-[#1c1c1e] rounded-[2.5rem] shadow-2xl w-full max-w-sm p-10 relative z-10 border border-white/5"
            >
              <h3 className="text-2xl font-black text-white tracking-tighter mb-6 flex items-center gap-3 uppercase italic">
                <div className="p-3 bg-blue-500/10 rounded-xl text-blue-500">
                  <FolderPlus className="w-6 h-6" />
                </div>
                New Folder
              </h3>
              <form onSubmit={handleCreateFolder} className="space-y-6">
                <div className="space-y-2">
                  <label className="text-xs font-black text-gray-500 uppercase tracking-widest ml-1">Folder Name</label>
                  <input
                    autoFocus
                    type="text"
                    value={newFolderName}
                    onChange={(e) => setNewFolderName(e.target.value)}
                    placeholder="E.g. Work"
                    className="w-full bg-white/5 border border-white/5 focus:border-blue-500/50 rounded-2xl py-4 px-6 outline-none transition-all placeholder:text-gray-600 text-white font-bold uppercase tracking-widest text-xs"
                    required
                  />
                </div>
                <div className="flex gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => closeModal()}
                    className="flex-1 px-4 py-4 bg-white/5 text-gray-400 font-black rounded-2xl hover:bg-white/10 transition-all uppercase tracking-widest text-xs"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="flex-1 px-4 py-4 bg-blue-600 text-white font-black rounded-2xl hover:bg-blue-500 shadow-xl shadow-blue-900/20 transition-all active:scale-[0.98] uppercase tracking-widest text-xs"
                  >
                    Create
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Share Modal */}
      <AnimatePresence>
        {sharingFile && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSharingFile(null)}
              className="absolute inset-0 bg-black/80 backdrop-blur-md" 
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-[#1c1c1e] rounded-[2.5rem] shadow-2xl w-full max-w-sm p-10 relative z-10 border border-white/5"
            >
              <h3 className="text-2xl font-black text-white tracking-tighter mb-4 flex items-center gap-3 uppercase italic">
                <div className="p-3 bg-indigo-500/10 rounded-xl text-indigo-500">
                  <Share2 className="w-6 h-6" />
                </div>
                Share Asset
              </h3>
              <p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest mb-6 px-1 leading-relaxed">
                Share <span className="text-white italic">"{sharingFile.name}"</span> with another user via their <span className="text-blue-400">email</span> or <span className="text-blue-400">full name</span>.
              </p>
              <form onSubmit={handleShare} className="space-y-6">
                <div className="space-y-2">
                  <label className="text-xs font-black text-gray-500 uppercase tracking-widest ml-1">Recipient</label>
                  <div className="relative">
                    <UserPlus className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                    <input
                      autoFocus
                      type="text"
                      value={shareEmail}
                      onChange={(e) => setShareEmail(e.target.value)}
                      placeholder="Email or Full Name"
                      className="w-full bg-white/5 border border-white/5 focus:border-indigo-500/50 rounded-2xl py-4 pl-12 pr-6 outline-none transition-all placeholder:text-gray-600 text-white font-bold tracking-widest text-xs"
                      required
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-black text-gray-500 uppercase tracking-widest ml-1">Access Level</label>
                  <div className="grid grid-cols-2 gap-2 p-1 bg-white/5 rounded-2xl border border-white/5">
                    <button
                      type="button"
                      onClick={() => setSharePermission('view')}
                      className={cn(
                        "flex items-center justify-center gap-2 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all",
                        sharePermission === 'view' ? "bg-indigo-600 text-white shadow-lg" : "text-gray-500 hover:text-gray-300"
                      )}
                    >
                      <Eye className="w-3.5 h-3.5" />
                      View Only
                    </button>
                    <button
                      type="button"
                      onClick={() => setSharePermission('edit')}
                      className={cn(
                        "flex items-center justify-center gap-2 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all",
                        sharePermission === 'edit' ? "bg-indigo-600 text-white shadow-lg" : "text-gray-500 hover:text-gray-300"
                      )}
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                      Can Edit
                    </button>
                  </div>
                </div>
                <div className="flex gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setSharingFile(null)}
                    className="flex-1 px-4 py-4 bg-white/5 text-gray-400 font-black rounded-2xl hover:bg-white/10 transition-all uppercase tracking-widest text-xs"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={shareLoading}
                    className="flex-1 px-4 py-4 bg-indigo-600 text-white font-black rounded-2xl hover:bg-indigo-500 shadow-xl shadow-indigo-900/20 transition-all active:scale-[0.98] uppercase tracking-widest text-xs flex items-center justify-center gap-2"
                  >
                    {shareLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Share2 className="w-4 h-4" />}
                    Share
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* File Preview Modal */}
      <AnimatePresence>
        {selectedFileForPreview && (
          <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelectedFileForPreview(null)}
              className="absolute inset-0 bg-black/95 backdrop-blur-xl" 
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 30 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 30 }}
              className="bg-[#141416] rounded-[3rem] shadow-2xl w-full max-w-6xl h-[85vh] flex flex-col relative z-10 border border-white/5 overflow-hidden"
            >
              <div className="p-8 border-b border-white/5 flex items-center justify-between bg-white/5 backdrop-blur-md sticky top-0 z-10">
                <div className="flex items-center gap-6">
                  <div className="w-14 h-14 bg-blue-500/10 rounded-[1.25rem] flex items-center justify-center text-blue-500 shadow-xl shadow-blue-900/10">
                    <FileIcon className="w-8 h-8" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="font-black text-white truncate max-w-md text-lg tracking-tight uppercase italic">{selectedFileForPreview.name}</h3>
                    <p className="text-[10px] text-gray-500 font-black uppercase tracking-[0.2em] mt-1">{formatFileSize(selectedFileForPreview.size)} • UPLOADED {formatDate(selectedFileForPreview.created_at || selectedFileForPreview.createdAt)}</p>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  {( (selectedFileForPreview.mime_type || selectedFileForPreview.mimeType).startsWith('text/') || selectedFileForPreview.name.endsWith('.txt') || selectedFileForPreview.name.endsWith('.md')) && (
                    <>
                      {isEditingPreview ? (
                        <button 
                          onClick={handleSavePreview}
                          disabled={saveLoading}
                          className="flex items-center gap-3 px-8 py-3 bg-green-500/10 text-green-500 border border-green-500/20 rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-green-500/20 transition-all shadow-xl disabled:opacity-50"
                        >
                          {saveLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                          Save Changes
                        </button>
                      ) : (
                        (!selectedFileForPreview.permission || selectedFileForPreview.permission === 'edit') && (
                          <button 
                            onClick={() => setIsEditingPreview(true)}
                            className="flex items-center gap-3 px-8 py-3 bg-white/5 border border-white/10 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-white/10 transition-all"
                          >
                            <Edit2 className="w-4 h-4" />
                            Edit File
                          </button>
                        )
                      )}
                    </>
                  )}
                  <button 
                    onClick={() => handleDownload(selectedFileForPreview.id, selectedFileForPreview.name)}
                    className="flex items-center gap-3 px-8 py-3 bg-blue-600 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-blue-500 shadow-2xl shadow-blue-900/20 transition-all active:scale-[0.98]"
                  >
                    <Download className="w-4 h-4" />
                    Download
                  </button>
                  <button 
                    onClick={() => setSelectedFileForPreview(null)}
                    className="p-3 text-gray-500 hover:text-white hover:bg-white/10 border border-transparent hover:border-white/10 rounded-2xl transition-all"
                  >
                    <X className="w-6 h-6" />
                  </button>
                </div>
              </div>

              <div className="flex-1 overflow-auto p-10 flex items-center justify-center bg-[#0a0a0b]/50 scrollbar-hide">
                {previewLoading ? (
                  <div className="flex flex-col items-center gap-6">
                    <Loader2 className="w-12 h-12 text-blue-500 animate-spin" />
                    <p className="text-gray-500 font-black uppercase tracking-[0.3em] text-xs italic animate-pulse">Loading preview...</p>
                  </div>
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    { (() => {
                      const mime = (selectedFileForPreview.mime_type || selectedFileForPreview.mimeType || '').toLowerCase();
                      const name = (selectedFileForPreview.name || '').toLowerCase();

                      if (mime.startsWith('image/')) {
                        return imageError ? (
                          <div className="flex flex-col items-center justify-center text-center space-y-4">
                            <div className="w-24 h-24 rounded-3xl bg-red-500/10 flex items-center justify-center text-red-500">
                              <FileIcon className="w-12 h-12" />
                            </div>
                            <h4 className="text-xl font-bold text-white uppercase italic">Failed to load image</h4>
                            <p className="text-gray-500 text-[10px] uppercase font-bold tracking-widest">The image could not be retrieved from the server.</p>
                          </div>
                        ) : (
                          <img 
                            src={`/api/files/${selectedFileForPreview.id}/download?token=${authToken}&inline=true`} 
                            alt={selectedFileForPreview.name}
                            className="max-w-full max-h-full object-contain rounded-3xl shadow-2xl shadow-black/80"
                            referrerPolicy="no-referrer"
                            onLoad={() => console.log('Image loaded successfully')}
                            onError={() => {
                              console.error('Image failed to load');
                              setImageError(true);
                            }}
                          />
                        );
                      }

                      if (mime.startsWith('video/')) {
                        return (
                          <video 
                            controls 
                            className="max-w-full max-h-full rounded-3xl shadow-2xl"
                            src={`/api/files/${selectedFileForPreview.id}/download?token=${authToken}&inline=true`}
                          >
                            Your browser does not support the video tag.
                          </video>
                        );
                      }

                      if (mime.startsWith('audio/')) {
                        return (
                          <div className="flex flex-col items-center gap-8">
                            <div className="w-32 h-32 bg-blue-500/10 rounded-full flex items-center justify-center text-blue-500 animate-pulse">
                              <FileIcon className="w-16 h-16" />
                            </div>
                            <audio 
                              controls 
                              className="w-full max-w-md"
                              src={`/api/files/${selectedFileForPreview.id}/download?token=${authToken}&inline=true`}
                            >
                              Your browser does not support the audio tag.
                            </audio>
                          </div>
                        );
                      }

                      if (mime.includes('pdf')) {
                        if (isPdfLoading) {
                          return (
                            <div className="flex flex-col items-center gap-6">
                              <Loader2 className="w-12 h-12 text-blue-500 animate-spin" />
                              <p className="text-gray-500 font-black uppercase tracking-[0.3em] text-xs italic animate-pulse">Rendering Secure Canvas...</p>
                            </div>
                          );
                        }

                        if (!pdfBlobUrl) {
                          return (
                            <div className="flex flex-col items-center justify-center text-center space-y-4">
                              <div className="w-24 h-24 rounded-3xl bg-red-500/10 flex items-center justify-center text-red-500">
                                <FileIcon className="w-12 h-12" />
                              </div>
                              <h4 className="text-xl font-bold text-white uppercase italic">Preview Failed</h4>
                              <p className="text-red-400/80 text-[10px] uppercase font-bold tracking-widest max-w-[250px] leading-relaxed">
                                {previewError || "Could not generate a secure preview for this PDF."}
                              </p>
                              <div className="flex flex-col gap-2 pt-2">
                                <a 
                                  href={`/api/files/${selectedFileForPreview.id}/download?token=${authToken}&inline=true`}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="px-6 py-2 bg-blue-600/20 text-blue-400 rounded-xl font-bold uppercase tracking-widest text-[10px] hover:bg-blue-600 hover:text-white transition-all flex items-center gap-2"
                                >
                                  <ExternalLink className="w-3 h-3" />
                                  Try direct link
                                </a>
                                <button
                                  onClick={() => navigate(0)}
                                  className="px-6 py-2 bg-gray-800/40 text-gray-400 rounded-xl font-bold uppercase tracking-widest text-[10px] hover:bg-gray-700 hover:text-white transition-all"
                                >
                                  Refresh Session
                                </button>
                              </div>
                            </div>
                          );
                        }

                        return (
                          <div className="w-full h-full flex flex-col items-center justify-start space-y-4 overflow-hidden">
                            <div className="w-full flex-1 relative group bg-black/40 rounded-3xl overflow-auto custom-scrollbar shadow-2xl flex justify-center p-4">
                              <Document
                                file={pdfBlobUrl}
                                onLoadSuccess={onDocumentLoadSuccess}
                                loading={
                                  <div className="flex flex-col items-center gap-4 py-20">
                                    <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
                                    <p className="text-gray-500 font-bold uppercase tracking-widest text-[10px]">Processing Pages...</p>
                                  </div>
                                }
                                error={
                                  <div className="text-red-400 font-bold p-10 text-center uppercase tracking-widest text-[10px]">
                                    Error loading PDF content
                                  </div>
                                }
                              >
                                <Page 
                                  pageNumber={pageNumber} 
                                  renderTextLayer={true}
                                  renderAnnotationLayer={true}
                                  width={Math.min(window.innerWidth * 0.5, 600)}
                                  className="shadow-2xl rounded-lg overflow-hidden"
                                />
                              </Document>
                            </div>

                            {numPages > 1 && (
                              <div className="flex items-center gap-4 bg-white/5 backdrop-blur-xl px-4 py-1.5 rounded-full border border-white/10">
                                <button
                                  onClick={() => setPageNumber(p => Math.max(1, p - 1))}
                                  disabled={pageNumber <= 1}
                                  className="p-1.5 hover:bg-white/10 rounded-full disabled:opacity-30 disabled:hover:bg-transparent transition-colors text-white"
                                >
                                  <ChevronLeft className="w-4 h-4" />
                                </button>
                                <span className="text-[10px] font-black uppercase tracking-widest text-gray-400">
                                  Page <span className="text-blue-400">{pageNumber}</span> / {numPages}
                                </span>
                                <button
                                  onClick={() => setPageNumber(p => Math.min(numPages, p + 1))}
                                  disabled={pageNumber >= numPages}
                                  className="p-1.5 hover:bg-white/10 rounded-full disabled:opacity-30 disabled:hover:bg-transparent transition-colors text-white"
                                >
                                  <ChevronRight className="w-4 h-4" />
                                </button>
                              </div>
                            )}

                            <div className="flex gap-4">
                              <a 
                                href={`/api/files/${selectedFileForPreview.id}/download?token=${authToken}&inline=true`}
                                target="_blank"
                                rel="noreferrer"
                                className="px-6 py-2 bg-blue-600/20 text-blue-400 rounded-xl font-bold uppercase tracking-widest text-[10px] hover:bg-blue-600 hover:text-white transition-all flex items-center gap-2 shadow-lg"
                              >
                                <ExternalLink className="w-3 h-3" />
                                Open Native
                              </a>
                              <a 
                                href={`/api/files/${selectedFileForPreview.id}/download?token=${authToken}`}
                                download={selectedFileForPreview.name}
                                className="px-6 py-2 bg-white/5 text-gray-400 rounded-xl font-bold uppercase tracking-widest text-[10px] hover:bg-white/10 transition-all flex items-center gap-2"
                              >
                                <Download className="w-3 h-3" />
                                Download
                              </a>
                            </div>
                            <p className="text-[9px] text-gray-600 font-bold uppercase tracking-widest opacity-50">
                              Canvas Rendering • Secure Authenticated Preview
                            </p>
                          </div>
                        );
                      }

                      if (
                        mime.includes('officedocument') || 
                        mime.includes('msword') ||
                        mime.includes('ms-excel') ||
                        mime.includes('ms-powerpoint') ||
                        name.endsWith('.docx') || 
                        name.endsWith('.xlsx') ||
                        name.endsWith('.pptx') ||
                        name.endsWith('.doc') ||
                        name.endsWith('.xls') ||
                        name.endsWith('.ppt')
                      ) {
                        const googleDocsUrl = `https://docs.google.com/gview?url=${encodeURIComponent(`${window.location.origin}/api/files/${selectedFileForPreview.id}/download?token=${authToken}&inline=true`)}&embedded=true`;
                        return (
                          <div className="w-full h-full flex flex-col items-center justify-center space-y-4">
                            <div className="w-full h-[85%] relative">
                              <iframe 
                                src={googleDocsUrl}
                                className="w-full h-full rounded-3xl border border-white/5 bg-white shadow-2xl"
                                title={selectedFileForPreview.name}
                              />
                            </div>
                            <div className="flex flex-col items-center gap-2">
                              <p className="text-gray-500 text-[10px] uppercase font-bold tracking-widest opacity-60">
                                Powered by Google Docs Viewer
                              </p>
                              <a 
                                href={`/api/files/${selectedFileForPreview.id}/download?token=${authToken}&inline=true`}
                                target="_blank"
                                rel="noreferrer"
                                className="px-6 py-2 bg-blue-600/20 text-blue-400 rounded-xl font-bold uppercase tracking-widest text-[10px] hover:bg-blue-600 hover:text-white transition-all flex items-center gap-2"
                              >
                                <ExternalLink className="w-3 h-3" />
                                Open in New Tab
                              </a>
                            </div>
                          </div>
                        );
                      }

                      if (previewContent !== null) {
                        return (
                          <div className="w-full h-full bg-black/40 p-12 rounded-[3.5rem] shadow-inner border border-white/5 flex flex-col relative overflow-hidden backdrop-blur-md">
                            <div className="absolute top-0 right-0 p-4">
                              <div className="flex gap-1">
                                <div className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-pulse" />
                                <div className="w-1.5 h-1.5 bg-blue-500/50 rounded-full" />
                                <div className="w-1.5 h-1.5 bg-blue-500/20 rounded-full" />
                              </div>
                            </div>
                            {isEditingPreview ? (
                              <textarea
                                value={previewContent || ''}
                                onChange={(e) => setPreviewContent(e.target.value)}
                                className="w-full h-full text-sm font-mono text-blue-100 bg-transparent rounded-2xl border-none focus:ring-0 outline-none resize-none leading-relaxed custom-scrollbar"
                                autoFocus
                              />
                            ) : (
                              <pre className="text-sm font-mono text-blue-100/90 whitespace-pre-wrap leading-relaxed overflow-auto flex-1 custom-scrollbar selection:bg-blue-600/30">
                                {previewContent}
                              </pre>
                            )}
                          </div>
                        );
                      }

                      return (
                        <div className="text-center space-y-8">
                          <div className="w-40 h-40 bg-white/5 rounded-[4rem] flex items-center justify-center mx-auto text-gray-800 border border-white/5">
                            <FileIcon className="w-20 h-20" />
                          </div>
                          <div className="space-y-3">
                            <h4 className="text-2xl font-black text-white italic uppercase tracking-tighter">
                              No Preview Available
                            </h4>
                            <p className="text-gray-500 font-bold max-w-xs mx-auto text-[10px] uppercase tracking-widest">
                              This file type cannot be previewed in the browser. Please download the file to view its full content.
                            </p>
                          </div>
                          <button 
                            onClick={() => handleDownload(selectedFileForPreview.id, selectedFileForPreview.name)}
                            className="px-10 py-4 bg-white/5 border border-white/10 text-white rounded-2xl font-black uppercase tracking-widest text-[10px] hover:bg-blue-600 hover:border-blue-600 transition-all shadow-xl"
                          >
                            Download File
                          </button>
                        </div>
                      );
                    })()}
                  </div>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default Dashboard;
