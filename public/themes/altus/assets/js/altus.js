/**
 * Altus Personal Cloud - Vanilla ES6+ Application State Manager & UI Controller
 * Constraints: Zero external UI frameworks (No React, Vue, Tailwind, Bootstrap).
 * Icons: Google Material Symbols Outlined exclusively.
 * Impeccable Mode: Operate (Fast, scan-friendly, keyboard-aware, accessible).
 */

(function () {
  'use strict';

  // =========================================================================
  // 1. Utilities & Formatters
  // =========================================================================

  function formatBytes(bytes, decimals = 1) {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
  }

  function formatDate(timestamp) {
    if (!timestamp) return '—';
    let date;
    if (typeof timestamp === 'number') {
      date = new Date(timestamp * 1000);
    } else {
      date = new Date(timestamp);
    }
    if (isNaN(date.getTime())) return '—';

    const now = new Date();
    const isThisYear = date.getFullYear() === now.getFullYear();

    const options = isThisYear
      ? { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }
      : { year: 'numeric', month: 'short', day: 'numeric' };

    return date.toLocaleDateString(undefined, options);
  }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function sanitizeName(name) {
    if (!name) return '';
    return name.trim().replace(/[\x00-\x1F\x7F/\\:]/g, '');
  }

  function getFileIconAndColor(mimeType, extension) {
    const ext = (extension || '').toLowerCase().replace(/^\./, '');
    const mime = (mimeType || '').toLowerCase();

    if (mime.startsWith('image/')) {
      return { icon: 'image', color: 'var(--file-image)', isImage: true, typeLabel: (ext.toUpperCase() || 'Image') + ' Image' };
    }
    if (mime.startsWith('video/')) {
      return { icon: 'movie', color: 'var(--file-video)', isImage: false, typeLabel: (ext.toUpperCase() || 'Video') + ' Video' };
    }
    if (mime.startsWith('audio/')) {
      return { icon: 'audiotrack', color: 'var(--file-audio)', isImage: false, typeLabel: (ext.toUpperCase() || 'Audio') + ' Audio' };
    }
    if (mime === 'application/pdf' || ext === 'pdf') {
      return { icon: 'picture_as_pdf', color: 'var(--file-pdf)', isImage: false, typeLabel: 'PDF Document' };
    }
    if (
      mime.includes('zip') ||
      mime.includes('tar') ||
      mime.includes('gzip') ||
      ['zip', 'rar', 'tar', 'gz', '7z', 'bz2', 'xz'].includes(ext)
    ) {
      return { icon: 'folder_zip', color: 'var(--file-archive)', isImage: false, typeLabel: (ext.toUpperCase() || 'Archive') + ' Archive' };
    }
    if (
      mime.includes('javascript') ||
      mime.includes('json') ||
      mime.includes('html') ||
      mime.includes('xml') ||
      mime.includes('css') ||
      mime.includes('php') ||
      mime.includes('sql') ||
      ['js', 'mjs', 'ts', 'py', 'php', 'html', 'css', 'json', 'md', 'xml', 'sql', 'sh', 'c', 'cpp', 'rs', 'go'].includes(ext)
    ) {
      return { icon: 'code', color: 'var(--file-code)', isImage: false, typeLabel: (ext.toUpperCase() || 'Code') + ' Source' };
    }
    if (
      mime.includes('text') ||
      ['txt', 'log', 'rtf', 'doc', 'docx', 'odt', 'csv'].includes(ext)
    ) {
      return { icon: 'description', color: 'var(--file-doc)', isImage: false, typeLabel: (ext.toUpperCase() || 'Document') + ' Document' };
    }
    return { icon: 'draft', color: 'var(--file-default)', isImage: false, typeLabel: (ext ? ext.toUpperCase() + ' File' : 'Generic File') };
  }

  function formatTime(seconds) {
    if (isNaN(seconds) || seconds < 0) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
  }

  function getFilePreviewType(mimeType, extension) {
    const ext = (extension || '').toLowerCase().replace(/^\./, '');
    const mime = (mimeType || '').toLowerCase();

    if (mime.startsWith('image/') || ['jpg', 'jpeg', 'png', 'webp', 'gif', 'svg', 'bmp', 'ico', 'avif'].includes(ext)) {
      return 'image';
    }
    if (mime === 'application/pdf' || ext === 'pdf') {
      return 'pdf';
    }
    if (mime.startsWith('audio/') || ['mp3', 'wav', 'ogg', 'm4a', 'flac', 'aac', 'opus', 'wma'].includes(ext)) {
      return 'audio';
    }
    if (mime.startsWith('video/') || ['mp4', 'webm', 'ogv', 'mov', 'm4v', 'mkv'].includes(ext)) {
      return 'video';
    }
    if (
      mime.startsWith('text/') ||
      mime.includes('javascript') ||
      mime.includes('json') ||
      mime.includes('xml') ||
      mime.includes('yaml') ||
      [
        'txt', 'md', 'markdown', 'json', 'csv', 'log', 'xml', 'html', 'htm', 'css',
        'js', 'mjs', 'cjs', 'ts', 'tsx', 'jsx', 'php', 'py', 'sh', 'bash', 'zsh',
        'sql', 'yaml', 'yml', 'ini', 'conf', 'env', 'gitignore', 'htaccess',
        'c', 'cpp', 'h', 'hpp', 'java', 'rs', 'go', 'toml'
      ].includes(ext)
    ) {
      return 'code';
    }
    return 'unsupported';
  }

  // =========================================================================
  // 2. API Service Layer
  // =========================================================================

  class AltusAPI {
    static async request(url, options = {}) {
      const defaultHeaders = {
        'Accept': 'application/json'
      };

      if (window.ALTUS_CSRF_TOKEN) {
        defaultHeaders['X-CSRF-Token'] = window.ALTUS_CSRF_TOKEN;
      }

      if (options.body && !(options.body instanceof FormData)) {
        defaultHeaders['Content-Type'] = 'application/json';
      }

      options.headers = { ...defaultHeaders, ...(options.headers || {}) };
      options.credentials = 'same-origin';

      try {
        const response = await fetch(url, options);
        const isCredentialCheck = /\/api\/v1\/auth\/(login|verify)\b/.test(url);

        if (response.status === 401 && !isCredentialCheck) {
          app.handleUnauthenticated();
          throw new Error('Session expired. Please log in.');
        }

        const data = await response.json().catch(() => null);

        if (!response.ok) {
          const errMsg = data?.errors?.[0] || data?.message || `Request failed (${response.status})`;
          throw new Error(errMsg);
        }

        return data;
      } catch (err) {
        console.error(`API Error [${url}]:`, err);
        throw err;
      }
    }

    // Authentication Endpoints
    static login(username, password) {
      return this.request('/api/v1/auth/login', {
        method: 'POST',
        body: JSON.stringify({ username, password })
      });
    }

    static verify2FA(userId, code) {
      return this.request('/api/v1/auth/verify', {
        method: 'POST',
        body: JSON.stringify({ user_id: userId, code })
      });
    }

    static logout() {
      return this.request('/api/v1/auth/logout', { method: 'POST' });
    }

    static getProfile() {
      return this.request('/api/v1/auth/me', { method: 'GET' });
    }

    // User Settings & Security Endpoints (Task 7.1)
    static updatePassword(currentPassword, newPassword) {
      return this.request('/api/v1/user/password', {
        method: 'POST',
        body: JSON.stringify({
          current_password: currentPassword,
          new_password: newPassword
        })
      });
    }

    static setupTOTP() {
      return this.request('/api/v1/user/totp/setup', {
        method: 'POST'
      });
    }

    static verifyTOTP(code) {
      return this.request('/api/v1/user/totp/verify', {
        method: 'POST',
        body: JSON.stringify({ code })
      });
    }

    static disableTOTP(password) {
      return this.request('/api/v1/user/totp/disable', {
        method: 'POST',
        body: JSON.stringify({ password })
      });
    }

    // Folders Endpoints
    static getFolders(parentId = 0, sort = 'name_asc') {
      return this.request(`/api/v1/folders?parent_id=${encodeURIComponent(parentId)}&sort=${encodeURIComponent(sort)}`, { method: 'GET' });
    }

    static getAllFolders() {
      return this.request('/api/v1/folders?all=1', { method: 'GET' });
    }

    static createFolder(name, parentId = 0, color = '#64748b') {
      return this.request('/api/v1/folders', {
        method: 'POST',
        body: JSON.stringify({ name, parent_id: parentId, color })
      });
    }

    static updateFolder(id, data) {
      return this.request(`/api/v1/folders/${encodeURIComponent(id)}`, {
        method: 'PUT',
        body: JSON.stringify(data)
      });
    }

    static deleteFolder(id) {
      return this.request(`/api/v1/folders/${encodeURIComponent(id)}`, { method: 'DELETE' });
    }

    static toggleFolderFavorite(id, isFavorite) {
      return this.updateFolder(id, { is_favorite: isFavorite ? 1 : 0 });
    }

    static getFavoriteFolders(sort = 'name_asc') {
      return this.request(`/api/v1/folders?favorites=1&sort=${encodeURIComponent(sort)}`, { method: 'GET' });
    }

    // Files Endpoints
    static getFiles(folderId = 0, sort = 'name_asc', search = '') {
      let url = `/api/v1/files?folder_id=${encodeURIComponent(folderId)}&sort=${encodeURIComponent(sort)}`;
      if (search && search.trim()) {
        url += `&search=${encodeURIComponent(search.trim())}`;
      }
      return this.request(url, { method: 'GET' });
    }

    static getFavoriteFiles(sort = 'name_asc') {
      return this.request(`/api/v1/files?favorites=1&sort=${encodeURIComponent(sort)}`, { method: 'GET' });
    }

    static updateFile(id, data) {
      return this.request(`/api/v1/files/${encodeURIComponent(id)}`, {
        method: 'PUT',
        body: JSON.stringify(data)
      });
    }

    static toggleFileFavorite(id, isFavorite) {
      return this.updateFile(id, { is_favorite: isFavorite ? 1 : 0 });
    }

    static deleteFile(id) {
      return this.request(`/api/v1/files/${encodeURIComponent(id)}`, { method: 'DELETE' });
    }

    // File Upload via XHR with Progress Tracking (Task 5.1)
    static uploadFile(file, folderId = 0, onProgress = null) {
      return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('POST', '/api/v1/files/upload', true);

        if (window.ALTUS_CSRF_TOKEN) {
          xhr.setRequestHeader('X-CSRF-Token', window.ALTUS_CSRF_TOKEN);
        }
        xhr.setRequestHeader('Accept', 'application/json');

        if (xhr.upload && onProgress) {
          xhr.upload.onprogress = (e) => {
            if (e.lengthComputable) {
              onProgress(e.loaded, e.total);
            }
          };
        }

        xhr.onload = () => {
          if (xhr.status === 401) {
            app.handleUnauthenticated();
            reject(new Error('Session expired.'));
            return;
          }

          let resData;
          try {
            resData = JSON.parse(xhr.responseText);
          } catch (e) {
            resData = null;
          }

          if (xhr.status >= 200 && xhr.status < 300 && resData?.success) {
            resolve(resData);
          } else {
            const err = resData?.errors?.[0] || resData?.message || `Upload failed (${xhr.status})`;
            reject(new Error(err));
          }
        };

        xhr.onerror = () => reject(new Error('Network error during upload.'));

        const formData = new FormData();
        formData.append('file', file);
        formData.append('folder_id', folderId);
        formData.append('conflict', 'keep_both');

        xhr.send(formData);
      });
    }

    // Disk-to-DB Quick Sync (Task 5.4)
    static triggerSync() {
      return this.request('/api/v1/sync', { method: 'POST' });
    }
  }

  // =========================================================================
  // 3. Application State & Controller
  // =========================================================================

  class AltusApp {
    constructor() {
      this.state = {
        user: window.ALTUS_INITIAL_USER || null,
        currentFolderId: 0,
        currentFolderPath: '/',
        breadcrumbs: [{ id: 0, name: 'Altus', path: '/' }],
        folders: [],
        files: [],
        allFolders: [],
        selectedFileIds: new Set(),
        viewMode: localStorage.getItem('altus_view_mode') || 'grid',
        sort: localStorage.getItem('altus_sort') || 'name_asc',
        theme: localStorage.getItem('altus_theme') || (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'),
        searchQuery: '',
        activeNav: 'root',
        isLoading: false,
        isSyncing: false,
        activeContextItem: null, // { type: 'folder' | 'file', data: ... }
        activeMoveItem: null,    // { type: 'folder' | 'file', data: ... }
        selectedTargetFolderId: 0,
        pending2FAUserId: null,
        uploadQueue: [],
        dragCounter: 0,
        preview: {
          isOpen: false,
          file: null,
          filesList: [],
          currentIndex: -1,
          type: null,
          zoom: {
            scale: 1,
            minScale: 0.25,
            maxScale: 5,
            isPanning: false,
            startX: 0,
            startY: 0,
            translateX: 0,
            translateY: 0
          },
          audioElement: null,
          videoElement: null,
          isCodeWrapped: false,
          currentCodeText: ''
        }
      };

      this.dom = {};
      this.searchDebounceTimer = null;
    }

    init() {
      this.cacheDOM();
      this.applyTheme(this.state.theme);
      this.bindEvents();
      this.bindDragAndDrop();
      this.applyViewMode(this.state.viewMode);
      if (this.dom.sortSelect) {
        this.dom.sortSelect.value = this.state.sort;
      }

      if (!this.state.user) {
        this.showAuthOverlay();
      } else {
        this.updateUserUI(this.state.user);
        this.handleInitialRoute();
      }
    }

    cacheDOM() {
      this.dom.appContainer = document.getElementById('appContainer');
      this.dom.appSidebar = document.getElementById('appSidebar');
      this.dom.sidebarBackdrop = document.getElementById('sidebarBackdrop');
      this.dom.mobileMenuToggle = document.getElementById('mobileMenuToggle');
      this.dom.sidebarCloseBtn = document.getElementById('sidebarCloseBtn');

      // Header controls
      this.dom.breadcrumbsNav = document.getElementById('breadcrumbsNav');
      this.dom.headerSearchInput = document.getElementById('headerSearchInput');
      this.dom.searchClearBtn = document.getElementById('searchClearBtn');
      this.dom.viewGridBtn = document.getElementById('viewGridBtn');
      this.dom.viewListBtn = document.getElementById('viewListBtn');
      this.dom.sortSelect = document.getElementById('sortSelect');
      this.dom.headerSyncBtn = document.getElementById('headerSyncBtn');
      this.dom.navQuickSync = document.getElementById('navQuickSync');
      this.dom.syncStatusBadge = document.getElementById('syncStatusBadge');
      this.dom.syncNavIcon = document.getElementById('syncNavIcon');

      // Containers
      this.dom.foldersSection = document.getElementById('foldersSection');
      this.dom.foldersGrid = document.getElementById('foldersGrid');
      this.dom.foldersCountBadge = document.getElementById('foldersCountBadge');

      this.dom.filesSection = document.getElementById('filesSection');
      this.dom.filesContainer = document.getElementById('filesContainer');
      this.dom.filesCountBadge = document.getElementById('filesCountBadge');

      this.dom.emptyState = document.getElementById('emptyState');
      this.dom.emptyStateTitle = document.getElementById('emptyStateTitle');
      this.dom.emptyStateDesc = document.getElementById('emptyStateDesc');
      this.dom.emptyStateActionBtn = document.getElementById('emptyStateActionBtn');

      // Sidebar items
      this.dom.btnNewMenu = document.getElementById('btnNewMenu');
      this.dom.newActionMenu = document.getElementById('newActionMenu');
      this.dom.actionNewFolder = document.getElementById('actionNewFolder');
      this.dom.actionUploadFile = document.getElementById('actionUploadFile');
      this.dom.hiddenFileInput = document.getElementById('hiddenFileInput');
      this.dom.mobileFab = document.getElementById('mobileFab');
      this.dom.navMyCloud = document.getElementById('navMyCloud');
      this.dom.navFavorites = document.getElementById('navFavorites');
      this.dom.navRecent = document.getElementById('navRecent');
      this.dom.badgeTotalItems = document.getElementById('badgeTotalItems');
      this.dom.quotaValueText = document.getElementById('quotaValueText');
      this.dom.quotaProgressFill = document.getElementById('quotaProgressFill');

      // User card
      this.dom.userAvatar = document.getElementById('userAvatar');
      this.dom.userNameLabel = document.getElementById('userNameLabel');
      this.dom.userEmailLabel = document.getElementById('userEmailLabel');
      this.dom.btnLogout = document.getElementById('btnLogout');
      this.dom.btnOpenSettings = document.getElementById('btnOpenSettings');
      this.dom.themeToggleBtn = document.getElementById('themeToggleBtn');
      this.dom.themeToggleIcon = document.getElementById('themeToggleIcon');

      // Context Menus
      this.dom.folderContextMenu = document.getElementById('folderContextMenu');
      this.dom.ctxFolderOpen = document.getElementById('ctxFolderOpen');
      this.dom.ctxFolderRename = document.getElementById('ctxFolderRename');
      this.dom.ctxFolderMove = document.getElementById('ctxFolderMove');
      this.dom.ctxFolderFavorite = document.getElementById('ctxFolderFavorite');
      this.dom.ctxFolderFavoriteIcon = document.getElementById('ctxFolderFavoriteIcon');
      this.dom.ctxFolderFavoriteText = document.getElementById('ctxFolderFavoriteText');
      this.dom.ctxFolderColorRow = document.getElementById('ctxFolderColorRow');
      this.dom.ctxFolderDelete = document.getElementById('ctxFolderDelete');

      this.dom.fileContextMenu = document.getElementById('fileContextMenu');
      this.dom.ctxFileFavorite = document.getElementById('ctxFileFavorite');
      this.dom.ctxFileFavoriteIcon = document.getElementById('ctxFileFavoriteIcon');
      this.dom.ctxFileFavoriteText = document.getElementById('ctxFileFavoriteText');
      this.dom.ctxFileDownload = document.getElementById('ctxFileDownload');
      this.dom.ctxFileRename = document.getElementById('ctxFileRename');
      this.dom.ctxFileMove = document.getElementById('ctxFileMove');
      this.dom.ctxFileDelete = document.getElementById('ctxFileDelete');

      // Modals
      this.dom.newFolderModal = document.getElementById('newFolderModal');
      this.dom.newFolderForm = document.getElementById('newFolderForm');
      this.dom.newFolderNameInput = document.getElementById('newFolderNameInput');
      this.dom.newFolderColorPicker = document.getElementById('newFolderColorPicker');

      this.dom.renameModal = document.getElementById('renameModal');
      this.dom.renameForm = document.getElementById('renameForm');
      this.dom.renameInput = document.getElementById('renameInput');

      this.dom.deleteModal = document.getElementById('deleteModal');
      this.dom.deleteMessage = document.getElementById('deleteMessage');
      this.dom.confirmDeleteBtn = document.getElementById('confirmDeleteBtn');

      // Move Modal (Task 5.3)
      this.dom.moveModal = document.getElementById('moveModal');
      this.dom.moveForm = document.getElementById('moveForm');
      this.dom.moveItemDesc = document.getElementById('moveItemDesc');
      this.dom.moveFolderTree = document.getElementById('moveFolderTree');
      this.dom.confirmMoveBtn = document.getElementById('confirmMoveBtn');

      // Drag & Drop & Upload Queue (Task 5.1)
      this.dom.dropZoneOverlay = document.getElementById('dropZoneOverlay');
      this.dom.dropZoneDestName = document.getElementById('dropZoneDestName');
      this.dom.uploadQueueWidget = document.getElementById('uploadQueueWidget');
      this.dom.uploadQueueTitleText = document.getElementById('uploadQueueTitleText');
      this.dom.uploadQueueList = document.getElementById('uploadQueueList');
      this.dom.uploadQueueMinimizeBtn = document.getElementById('uploadQueueMinimizeBtn');
      this.dom.uploadQueueCloseBtn = document.getElementById('uploadQueueCloseBtn');

      // Contextual Selection Bar (Task 5.5)
      this.dom.selectionBar = document.getElementById('selectionBar');
      this.dom.selectionCountText = document.getElementById('selectionCountText');
      this.dom.btnBatchDownload = document.getElementById('btnBatchDownload');
      this.dom.btnBatchDelete = document.getElementById('btnBatchDelete');
      this.dom.btnBatchClear = document.getElementById('btnBatchClear');

      // Mobile Action Sheet (Task 5.6)
      this.dom.mobileSheetBackdrop = document.getElementById('mobileSheetBackdrop');
      this.dom.mobileActionSheet = document.getElementById('mobileActionSheet');
      this.dom.sheetItemIcon = document.getElementById('sheetItemIcon');
      this.dom.sheetItemName = document.getElementById('sheetItemName');
      this.dom.sheetItemMeta = document.getElementById('sheetItemMeta');
      this.dom.sheetActionsList = document.getElementById('sheetActionsList');

      // Auth Overlay
      this.dom.authOverlay = document.getElementById('authOverlay');
      this.dom.authLoginForm = document.getElementById('authLoginForm');
      this.dom.authUsernameInput = document.getElementById('authUsernameInput');
      this.dom.authPasswordInput = document.getElementById('authPasswordInput');
      this.dom.totpGroup = document.getElementById('totpGroup');
      this.dom.authTotpInput = document.getElementById('authTotpInput');
      this.dom.authSubmitBtn = document.getElementById('authSubmitBtn');

      this.dom.toastContainer = document.getElementById('toastContainer');

      // Media Preview System (Tasks 6.1 - 6.6)
      this.dom.previewModal = document.getElementById('previewModal');
      this.dom.previewTypeIcon = document.getElementById('previewTypeIcon');
      this.dom.previewFilename = document.getElementById('previewFilename');
      this.dom.previewFilesize = document.getElementById('previewFilesize');
      this.dom.previewFileIndex = document.getElementById('previewFileIndex');
      this.dom.imageToolbarGroup = document.getElementById('imageToolbarGroup');
      this.dom.btnZoomOut = document.getElementById('btnZoomOut');
      this.dom.zoomLevelBadge = document.getElementById('zoomLevelBadge');
      this.dom.btnZoomIn = document.getElementById('btnZoomIn');
      this.dom.btnZoomReset = document.getElementById('btnZoomReset');
      this.dom.btnZoomFit = document.getElementById('btnZoomFit');
      this.dom.codeToolbarGroup = document.getElementById('codeToolbarGroup');
      this.dom.btnToggleWrap = document.getElementById('btnToggleWrap');
      this.dom.btnCopyCode = document.getElementById('btnCopyCode');
      this.dom.copyCodeIcon = document.getElementById('copyCodeIcon');
      this.dom.copyCodeLabel = document.getElementById('copyCodeLabel');
      this.dom.btnPreviewFavorite = document.getElementById('btnPreviewFavorite');
      this.dom.previewFavoriteIcon = document.getElementById('previewFavoriteIcon');
      this.dom.btnPreviewNewTab = document.getElementById('btnPreviewNewTab');
      this.dom.btnPreviewDownload = document.getElementById('btnPreviewDownload');
      this.dom.btnPreviewClose = document.getElementById('btnPreviewClose');
      this.dom.previewNavPrev = document.getElementById('previewNavPrev');
      this.dom.previewNavNext = document.getElementById('previewNavNext');
      this.dom.previewStage = document.getElementById('previewStage');
      this.dom.previewFooterInfo = document.getElementById('previewFooterInfo');
      this.dom.ctxFilePreview = document.getElementById('ctxFilePreview');

      // Account Settings Modal (Task 7.1)
      this.dom.settingsModal = document.getElementById('settingsModal');
      this.dom.settingsAvatar = document.getElementById('settingsAvatar');
      this.dom.settingsUsername = document.getElementById('settingsUsername');
      this.dom.settingsEmail = document.getElementById('settingsEmail');
      this.dom.settingsRoleBadge = document.getElementById('settingsRoleBadge');
      this.dom.settings2faBadge = document.getElementById('settings2faBadge');

      this.dom.tabSecurityBtn = document.getElementById('tabSecurityBtn');
      this.dom.tabTotpBtn = document.getElementById('tabTotpBtn');
      this.dom.panelSecurity = document.getElementById('panelSecurity');
      this.dom.panelTotp = document.getElementById('panelTotp');

      this.dom.passwordChangeForm = document.getElementById('passwordChangeForm');
      this.dom.settingsCurrentPassword = document.getElementById('settingsCurrentPassword');
      this.dom.settingsNewPassword = document.getElementById('settingsNewPassword');
      this.dom.settingsConfirmPassword = document.getElementById('settingsConfirmPassword');
      this.dom.passwordErrorAlert = document.getElementById('passwordErrorAlert');
      this.dom.btnSubmitPassword = document.getElementById('btnSubmitPassword');

      this.dom.totpDisabledView = document.getElementById('totpDisabledView');
      this.dom.totpSetupView = document.getElementById('totpSetupView');
      this.dom.totpEnabledView = document.getElementById('totpEnabledView');

      this.dom.btnStartTotpSetup = document.getElementById('btnStartTotpSetup');
      this.dom.totpQrContainer = document.getElementById('totpQrContainer');
      this.dom.totpSecretCodeText = document.getElementById('totpSecretCodeText');
      this.dom.btnCopyTotpSecret = document.getElementById('btnCopyTotpSecret');
      this.dom.totpVerifyForm = document.getElementById('totpVerifyForm');
      this.dom.totpVerifyCodeInput = document.getElementById('totpVerifyCodeInput');
      this.dom.btnSubmitTotpVerify = document.getElementById('btnSubmitTotpVerify');
      this.dom.btnCancelTotpSetup = document.getElementById('btnCancelTotpSetup');
      this.dom.totpVerifyErrorAlert = document.getElementById('totpVerifyErrorAlert');

      this.dom.totpDisableForm = document.getElementById('totpDisableForm');
      this.dom.totpDisablePasswordInput = document.getElementById('totpDisablePasswordInput');
      this.dom.btnSubmitTotpDisable = document.getElementById('btnSubmitTotpDisable');
      this.dom.totpDisableErrorAlert = document.getElementById('totpDisableErrorAlert');
    }

    bindEvents() {
      // Mobile Drawer Toggle
      this.dom.mobileMenuToggle?.addEventListener('click', () => this.toggleMobileSidebar(true));
      this.dom.sidebarCloseBtn?.addEventListener('click', () => this.toggleMobileSidebar(false));
      this.dom.sidebarBackdrop?.addEventListener('click', () => this.toggleMobileSidebar(false));

      // View Mode Toggle
      this.dom.viewGridBtn?.addEventListener('click', () => this.setViewMode('grid'));
      this.dom.viewListBtn?.addEventListener('click', () => this.setViewMode('list'));

      // Sort Select
      this.dom.sortSelect?.addEventListener('change', (e) => {
        this.setSort(e.target.value);
      });

      // Search Inputs
      this.dom.headerSearchInput?.addEventListener('input', (e) => {
        const query = e.target.value;
        this.dom.searchClearBtn?.classList.toggle('visible', !!query);
        this.handleSearchInput(query);
      });

      this.dom.searchClearBtn?.addEventListener('click', () => {
        this.dom.headerSearchInput.value = '';
        this.dom.searchClearBtn.classList.remove('visible');
        this.handleSearchInput('');
        this.dom.headerSearchInput.focus();
      });

      // Quick Sync Triggers (Task 5.4)
      this.dom.headerSyncBtn?.addEventListener('click', () => this.runQuickSync());
      this.dom.navQuickSync?.addEventListener('click', () => this.runQuickSync());

      // + New Action Menu
      this.dom.btnNewMenu?.addEventListener('click', (e) => {
        e.stopPropagation();
        this.toggleDropdown(this.dom.newActionMenu);
      });

      this.dom.mobileFab?.addEventListener('click', (e) => {
        e.stopPropagation();
        this.openNewFolderModal();
      });

      this.dom.actionNewFolder?.addEventListener('click', () => {
        this.closeAllDropdowns();
        this.openNewFolderModal();
      });

      this.dom.actionUploadFile?.addEventListener('click', () => {
        this.closeAllDropdowns();
        this.dom.hiddenFileInput?.click();
      });

      this.dom.hiddenFileInput?.addEventListener('change', (e) => {
        if (e.target.files && e.target.files.length > 0) {
          this.handleFilesUpload(e.target.files);
          e.target.value = ''; // Reset input
        }
      });

      this.dom.emptyStateActionBtn?.addEventListener('click', () => {
        this.openNewFolderModal();
      });

      // Navigation Items
      this.dom.navMyCloud?.addEventListener('click', () => {
        this.setNav('root');
        this.navigateToFolder(0);
        this.toggleMobileSidebar(false);
      });

      this.dom.navFavorites?.addEventListener('click', () => {
        this.setNav('favorites');
        this.toggleMobileSidebar(false);
      });

      this.dom.navRecent?.addEventListener('click', () => {
        this.setNav('recent');
        this.toggleMobileSidebar(false);
      });

      // User Profile & Settings
      this.dom.btnLogout?.addEventListener('click', () => this.logout());
      this.dom.btnOpenSettings?.addEventListener('click', () => this.openSettingsModal());
      this.dom.themeToggleBtn?.addEventListener('click', () => this.toggleTheme());
      document.querySelector('.user-profile-info')?.addEventListener('click', () => this.openSettingsModal());

      // Settings Tabs & Submissions (Task 7.1)
      this.dom.tabSecurityBtn?.addEventListener('click', () => this.switchSettingsTab('security'));
      this.dom.tabTotpBtn?.addEventListener('click', () => this.switchSettingsTab('totp'));
      this.dom.passwordChangeForm?.addEventListener('submit', (e) => this.handlePasswordChangeSubmit(e));
      this.dom.btnStartTotpSetup?.addEventListener('click', () => this.startTotpSetup());
      this.dom.btnCopyTotpSecret?.addEventListener('click', () => this.copyTotpSecret());
      this.dom.btnCancelTotpSetup?.addEventListener('click', () => this.cancelTotpSetup());
      this.dom.totpVerifyForm?.addEventListener('submit', (e) => this.handleTotpVerifySubmit(e));
      this.dom.totpDisableForm?.addEventListener('submit', (e) => this.handleTotpDisableSubmit(e));

      // Modal Closers & Backdrop Dismissal
      document.querySelectorAll('[data-close-modal]').forEach(btn => {
        btn.addEventListener('click', () => this.closeAllModals());
      });
      document.querySelectorAll('.modal-backdrop').forEach(modal => {
        modal.addEventListener('click', (e) => {
          if (e.target === modal && (modal.id !== 'authOverlay' || this.state.user)) {
            this.closeAllModals();
          }
        });
      });

      // Forms
      this.dom.newFolderForm?.addEventListener('submit', (e) => this.handleNewFolderSubmit(e));
      this.dom.renameForm?.addEventListener('submit', (e) => this.handleRenameSubmit(e));
      this.dom.moveForm?.addEventListener('submit', (e) => this.handleMoveSubmit(e));
      this.dom.confirmDeleteBtn?.addEventListener('click', () => this.handleDeleteConfirm());
      this.dom.authLoginForm?.addEventListener('submit', (e) => this.handleAuthSubmit(e));

      // Color picker swatch selection in New Folder Modal
      this.dom.newFolderColorPicker?.querySelectorAll('.color-swatch-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          this.dom.newFolderColorPicker.querySelectorAll('.color-swatch-btn').forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
        });
      });

      // Context Menu Actions
      this.dom.ctxFolderOpen?.addEventListener('click', () => {
        if (this.state.activeContextItem?.data) {
          this.navigateToFolder(this.state.activeContextItem.data.ID);
        }
        this.closeAllDropdowns();
      });

      this.dom.ctxFolderRename?.addEventListener('click', () => {
        if (this.state.activeContextItem?.data) {
          this.openRenameModal('folder', this.state.activeContextItem.data);
        }
        this.closeAllDropdowns();
      });

      this.dom.ctxFolderMove?.addEventListener('click', () => {
        if (this.state.activeContextItem?.data) {
          this.openMoveModal('folder', this.state.activeContextItem.data);
        }
        this.closeAllDropdowns();
      });

      this.dom.ctxFolderFavorite?.addEventListener('click', () => {
        if (this.state.activeContextItem?.data) {
          const folder = this.state.activeContextItem.data;
          this.toggleFolderFavorite(folder.ID, !Number(folder.IS_FAVORITE));
        }
        this.closeAllDropdowns();
      });

      this.dom.ctxFolderDelete?.addEventListener('click', () => {
        if (this.state.activeContextItem?.data) {
          this.openDeleteModal('folder', this.state.activeContextItem.data);
        }
        this.closeAllDropdowns();
      });

      // Color selection on existing folder context menu
      this.dom.ctxFolderColorRow?.querySelectorAll('.color-swatch-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const color = btn.getAttribute('data-color');
          if (this.state.activeContextItem?.data && color) {
            this.updateFolderColor(this.state.activeContextItem.data.ID, color);
          }
          this.closeAllDropdowns();
        });
      });

      this.dom.ctxFilePreview?.addEventListener('click', () => {
        if (this.state.activeContextItem?.data) {
          this.openPreview(this.state.activeContextItem.data);
        }
        this.closeAllDropdowns();
      });

      this.dom.ctxFileFavorite?.addEventListener('click', () => {
        if (this.state.activeContextItem?.data) {
          const file = this.state.activeContextItem.data;
          this.toggleFileFavorite(file.ID, !Number(file.IS_FAVORITE));
        }
        this.closeAllDropdowns();
      });

      this.dom.ctxFileDownload?.addEventListener('click', () => {
        if (this.state.activeContextItem?.data) {
          this.triggerDownload(this.state.activeContextItem.data.ID);
        }
        this.closeAllDropdowns();
      });

      this.dom.ctxFileRename?.addEventListener('click', () => {
        if (this.state.activeContextItem?.data) {
          this.openRenameModal('file', this.state.activeContextItem.data);
        }
        this.closeAllDropdowns();
      });

      this.dom.ctxFileMove?.addEventListener('click', () => {
        if (this.state.activeContextItem?.data) {
          this.openMoveModal('file', this.state.activeContextItem.data);
        }
        this.closeAllDropdowns();
      });

      this.dom.ctxFileDelete?.addEventListener('click', () => {
        if (this.state.activeContextItem?.data) {
          this.openDeleteModal('file', this.state.activeContextItem.data);
        }
        this.closeAllDropdowns();
      });

      // Multi-selection Batch Actions (Task 5.5)
      this.dom.btnBatchDownload?.addEventListener('click', () => this.handleBatchDownload());
      this.dom.btnBatchDelete?.addEventListener('click', () => this.handleBatchDelete());
      this.dom.btnBatchClear?.addEventListener('click', () => this.clearSelection());

      // Upload Queue Actions (Task 5.1)
      this.dom.uploadQueueMinimizeBtn?.addEventListener('click', () => {
        const isHidden = this.dom.uploadQueueList.style.display === 'none';
        this.dom.uploadQueueList.style.display = isHidden ? 'flex' : 'none';
      });

      this.dom.uploadQueueCloseBtn?.addEventListener('click', () => {
        this.dom.uploadQueueWidget.classList.remove('visible');
      });

      // Mobile Action Sheet Backdrop Closer (Task 5.6)
      this.dom.mobileSheetBackdrop?.addEventListener('click', () => this.closeMobileActionSheet());

      // Global window click to dismiss menus
      window.addEventListener('click', () => {
        this.closeAllDropdowns();
      });

      // Global keyboard shortcuts
      window.addEventListener('keydown', (e) => {
        if (this.state.preview.isOpen) {
          this.handlePreviewKeydown(e);
          return;
        }

        if (e.key === 'Escape') {
          this.closeAllDropdowns();
          this.closeAllModals();
          this.closeMobileActionSheet();
          this.clearSelection();
        } else if (e.key === '/' && document.activeElement !== this.dom.headerSearchInput) {
          e.preventDefault();
          this.dom.headerSearchInput?.focus();
        }
      });

      // Media Preview System Events (Tasks 6.1 - 6.6)
      this.bindPreviewEvents();

      // Browser History
      window.addEventListener('popstate', () => {
        this.handleRouteFromHash();
      });
    }

    // =======================================================================
    // 4. Drag & Drop Upload Engine (Task 5.1)
    // =======================================================================

    bindDragAndDrop() {
      const overlay = this.dom.dropZoneOverlay;
      if (!overlay) return;

      window.addEventListener('dragenter', (e) => {
        e.preventDefault();
        this.state.dragCounter++;
        if (e.dataTransfer && Array.from(e.dataTransfer.types).includes('Files')) {
          const currentFolderName = this.state.breadcrumbs[this.state.breadcrumbs.length - 1]?.name || 'My Cloud';
          this.dom.dropZoneDestName.textContent = currentFolderName;
          overlay.classList.add('active');
        }
      });

      window.addEventListener('dragover', (e) => {
        e.preventDefault();
      });

      window.addEventListener('dragleave', (e) => {
        e.preventDefault();
        this.state.dragCounter--;
        if (this.state.dragCounter <= 0) {
          this.state.dragCounter = 0;
          overlay.classList.remove('active');
        }
      });

      window.addEventListener('drop', (e) => {
        e.preventDefault();
        this.state.dragCounter = 0;
        overlay.classList.remove('active');

        if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length > 0) {
          this.handleFilesUpload(e.dataTransfer.files);
        }
      });
    }

    async handleFilesUpload(filesList) {
      const files = Array.from(filesList);
      if (files.length === 0) return;

      this.dom.uploadQueueWidget.classList.add('visible');
      this.dom.uploadQueueList.style.display = 'flex';
      this.dom.uploadQueueTitleText.textContent = `Uploading ${files.length} file(s)...`;

      const targetFolderId = this.state.currentFolderId;
      let completedCount = 0;
      let failedCount = 0;

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const queueItem = this.createQueueItemDOM(file);
        this.dom.uploadQueueList.prepend(queueItem);

        const progressBar = queueItem.querySelector('.upload-progress-bar');
        const statusIcon = queueItem.querySelector('.upload-item-status-icon');

        try {
          await AltusAPI.uploadFile(file, targetFolderId, (loaded, total) => {
            const ratio = Math.min(loaded / total, 1.0);
            progressBar.style.transform = `scaleX(${ratio})`;
          });

          progressBar.classList.add('complete');
          statusIcon.textContent = 'check_circle';
          statusIcon.className = 'material-symbols-outlined upload-item-status-icon success';
          completedCount++;
        } catch (err) {
          progressBar.classList.add('failed');
          statusIcon.textContent = 'error';
          statusIcon.className = 'material-symbols-outlined upload-item-status-icon error';
          statusIcon.title = err.message || 'Upload failed';
          failedCount++;
        }
      }

      this.dom.uploadQueueTitleText.textContent = `Finished: ${completedCount} uploaded${failedCount > 0 ? `, ${failedCount} failed` : ''}`;

      if (completedCount > 0) {
        this.showToast(`Successfully uploaded ${completedCount} file(s)`, 'success');
        await this.fetchCurrentFolder();
      }
      if (failedCount > 0) {
        this.showToast(`${failedCount} file(s) failed to upload`, 'error');
      }
    }

    createQueueItemDOM(file) {
      const item = document.createElement('div');
      item.className = 'upload-queue-item';

      item.innerHTML = `
        <div class="upload-queue-item-info">
          <span class="upload-item-name" title="${escapeHtml(file.name)}">${escapeHtml(file.name)}</span>
          <span class="material-symbols-outlined upload-item-status-icon pending">sync</span>
        </div>
        <div class="upload-progress-track">
          <div class="upload-progress-bar" style="transform: scaleX(0.02);"></div>
        </div>
      `;

      return item;
    }

    // =======================================================================
    // 5. Routing & Folder Navigation
    // =======================================================================

    handleInitialRoute() {
      this.handleRouteFromHash();
    }

    handleRouteFromHash() {
      const hash = window.location.hash;
      const match = hash.match(/#\/folder\/(\d+)/);
      if (match && match[1]) {
        const folderId = parseInt(match[1], 10);
        this.navigateToFolder(folderId, false);
      } else {
        this.navigateToFolder(0, false);
      }
    }

    async setNav(navName) {
      this.state.activeNav = navName;
      this.dom.navMyCloud?.classList.toggle('active', navName === 'root');
      this.dom.navFavorites?.classList.toggle('active', navName === 'favorites');
      this.dom.navRecent?.classList.toggle('active', navName === 'recent');

      if (navName === 'root') {
        await this.navigateToFolder(0);
      } else if (navName === 'favorites') {
        this.state.currentFolderId = 0;
        this.clearSelection();
        this.renderLoadingSkeletons();
        await this.fetchCurrentFolder();
      } else if (navName === 'recent') {
        this.state.sort = 'mtime_desc';
        if (this.dom.sortSelect) this.dom.sortSelect.value = 'mtime_desc';
        localStorage.setItem('altus_sort', 'mtime_desc');
        await this.navigateToFolder(0);
      }
    }

    async navigateToFolder(folderId = 0, updateHash = true) {
      if (this.state.activeNav !== 'root') {
        this.state.activeNav = 'root';
        this.dom.navMyCloud?.classList.add('active');
        this.dom.navFavorites?.classList.remove('active');
        this.dom.navRecent?.classList.remove('active');
      }
      this.state.currentFolderId = folderId;
      this.clearSelection();

      if (updateHash) {
        if (folderId === 0) {
          history.pushState(null, '', window.location.pathname);
        } else {
          history.pushState(null, '', `#/folder/${folderId}`);
        }
      }

      this.renderLoadingSkeletons();
      await this.fetchCurrentFolder();
    }

    async fetchCurrentFolder() {
      this.state.isLoading = true;
      try {
        if (this.state.activeNav === 'favorites') {
          const [foldersRes, filesRes] = await Promise.all([
            AltusAPI.getFavoriteFolders(this.state.sort),
            AltusAPI.getFavoriteFiles(this.state.sort)
          ]);

          this.state.folders = foldersRes?.data?.folders || [];
          this.state.files = filesRes?.data?.files || [];

          this.state.breadcrumbs = [
            { id: 0, name: 'Altus' },
            { id: 'favorites', name: 'Favorites' }
          ];
          this.renderBreadcrumbs();
          this.renderFolders();
          this.renderFiles();
          this.updateStats();
          return;
        }

        const [foldersRes, filesRes] = await Promise.all([
          AltusAPI.getFolders(this.state.currentFolderId, this.state.sort),
          AltusAPI.getFiles(this.state.currentFolderId, this.state.sort, this.state.searchQuery)
        ]);

        this.state.folders = foldersRes?.data?.folders || [];
        this.state.files = filesRes?.data?.files || [];

        // Update Breadcrumbs
        const serverBreadcrumbs = foldersRes?.data?.breadcrumbs || [];
        this.updateBreadcrumbs(serverBreadcrumbs);

        // Render UI
        this.renderFolders();
        this.renderFiles();
        this.updateStats();
      } catch (err) {
        this.showToast(err.message || 'Error loading directory', 'error');
      } finally {
        this.state.isLoading = false;
      }
    }

    updateBreadcrumbs(serverBreadcrumbs) {
      const trail = [{ id: 0, name: 'Altus' }];

      if (Array.isArray(serverBreadcrumbs)) {
        serverBreadcrumbs.forEach(crumb => {
          trail.push({ id: crumb.ID, name: crumb.NAME });
        });
      }

      this.state.breadcrumbs = trail;
      this.renderBreadcrumbs();
    }

    renderBreadcrumbs() {
      const container = this.dom.breadcrumbsNav;
      if (!container) return;
      container.innerHTML = '';

      this.state.breadcrumbs.forEach((item, index) => {
        const isLast = index === this.state.breadcrumbs.length - 1;

        if (index > 0) {
          const sep = document.createElement('span');
          sep.className = 'material-symbols-outlined breadcrumb-separator';
          sep.textContent = 'chevron_right';
          container.appendChild(sep);
        }

        const btn = document.createElement('button');
        btn.className = `breadcrumb-item ${isLast ? 'active' : ''}`;
        btn.setAttribute('data-folder-id', item.id);

        if (index === 0) {
          btn.innerHTML = `
            <span class="material-symbols-outlined icon-md">cloud</span>
            <span>${escapeHtml(item.name)}</span>
          `;
        } else {
          btn.innerHTML = `<span>${escapeHtml(item.name)}</span>`;
        }

        if (!isLast) {
          btn.addEventListener('click', () => this.navigateToFolder(item.id));
        }

        container.appendChild(btn);
      });
    }

    // =======================================================================
    // 6. Folder Card Rendering (Task 4.5 & Task 5.2/5.3)
    // =======================================================================

    renderFolders() {
      const grid = this.dom.foldersGrid;
      const countBadge = this.dom.foldersCountBadge;
      if (!grid) return;

      const folders = this.getFilteredFolders();
      countBadge.textContent = folders.length;

      if (folders.length === 0) {
        this.dom.foldersSection.style.display = 'none';
        grid.innerHTML = '';
        return;
      }

      this.dom.foldersSection.style.display = 'flex';
      grid.innerHTML = '';

      folders.forEach(folder => {
        const card = document.createElement('div');
        card.className = 'folder-card';
        card.setAttribute('role', 'button');
        card.setAttribute('tabindex', '0');
        card.setAttribute('data-folder-id', folder.ID);

        const folderColor = folder.COLOR || 'var(--folder-slate)';
        const isFav = !!Number(folder.IS_FAVORITE);

        card.innerHTML = `
          <div class="folder-color-ribbon" style="background-color: ${escapeHtml(folderColor)};"></div>
          <div class="folder-card-main">
            <span class="material-symbols-outlined folder-icon" style="color: ${escapeHtml(folderColor)};">folder</span>
            <div class="folder-details">
              <span class="folder-name" title="${escapeHtml(folder.NAME)}">${escapeHtml(folder.NAME)}</span>
              <span class="folder-meta">Folder</span>
            </div>
          </div>
          <div class="folder-actions-row">
            <button class="folder-fav-btn ${isFav ? 'fav-active' : ''}" aria-label="Toggle favorite" title="${isFav ? 'Remove from favorites' : 'Add to favorites'}">
              <span class="material-symbols-outlined icon-md">${isFav ? 'star' : 'star_border'}</span>
            </button>
            <button class="folder-menu-btn" aria-label="Folder actions" title="More options">
              <span class="material-symbols-outlined icon-md">more_vert</span>
            </button>
          </div>
        `;

        card.querySelector('.folder-card-main').addEventListener('click', (e) => {
          e.stopPropagation();
          this.navigateToFolder(folder.ID);
        });

        card.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            this.navigateToFolder(folder.ID);
          }
        });

        const favBtn = card.querySelector('.folder-fav-btn');
        favBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          this.toggleFolderFavorite(folder.ID, !Number(folder.IS_FAVORITE));
        });

        const menuBtn = card.querySelector('.folder-menu-btn');
        menuBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          this.handleItemActionTrigger('folder', folder, e);
        });

        grid.appendChild(card);
      });
    }

    // =======================================================================
    // 7. File Grid & List View Renderers (Task 4.6 & Task 5.5 Multi-Select)
    // =======================================================================

    renderFiles() {
      const container = this.dom.filesContainer;
      const countBadge = this.dom.filesCountBadge;
      if (!container) return;

      const files = this.getFilteredFiles();
      countBadge.textContent = files.length;

      const totalItems = (this.state.folders?.length || 0) + files.length;
      if (totalItems === 0) {
        this.dom.filesSection.style.display = 'none';
        this.dom.emptyState.style.display = 'flex';
        return;
      }

      this.dom.emptyState.style.display = 'none';

      if (files.length === 0) {
        this.dom.filesSection.style.display = 'none';
        container.innerHTML = '';
        return;
      }

      this.dom.filesSection.style.display = 'flex';

      if (this.state.viewMode === 'list') {
        this.renderFilesListView(files, container);
      } else {
        this.renderFilesGridView(files, container);
      }
    }

    renderFilesGridView(files, container) {
      container.innerHTML = '';
      const grid = document.createElement('div');
      grid.className = 'files-grid';
      if (this.state.selectedFileIds.size > 0) {
        grid.classList.add('selection-active');
      }

      files.forEach(file => {
        const card = document.createElement('div');
        const isSelected = this.state.selectedFileIds.has(file.ID);
        card.className = `file-card ${isSelected ? 'selected' : ''}`;
        card.setAttribute('role', 'button');
        card.setAttribute('tabindex', '0');
        card.setAttribute('data-file-id', file.ID);

        const { icon, color, isImage, typeLabel } = getFileIconAndColor(file.MIME_TYPE, file.EXTENSION);

        let previewMarkup = '';
        if (isImage) {
          previewMarkup = `
            <img class="file-thumb-img" src="/api/v1/files/${file.ID}/stream" alt="${escapeHtml(file.NAME)}" loading="lazy">
          `;
        } else {
          previewMarkup = `
            <span class="material-symbols-outlined file-type-icon" style="color: ${color};">${icon}</span>
          `;
        }

        const extLabel = file.EXTENSION ? file.EXTENSION.toUpperCase() : '';
        const isFav = !!Number(file.IS_FAVORITE);

        card.innerHTML = `
          <div class="item-checkbox ${isSelected ? 'checked' : ''}" title="Select item">
            <span class="material-symbols-outlined" style="font-size: 14px;">check</span>
          </div>
          <button class="file-card-fav-btn ${isFav ? 'fav-active' : ''}" aria-label="Toggle favorite" title="${isFav ? 'Remove from favorites' : 'Add to favorites'}">
            <span class="material-symbols-outlined">${isFav ? 'star' : 'star_border'}</span>
          </button>
          <div class="file-thumb-wrap">
            ${previewMarkup}
            ${extLabel ? `<span class="file-ext-badge">${escapeHtml(extLabel)}</span>` : ''}
          </div>
          <div class="file-card-body">
            <div class="file-card-title-row">
              <span class="file-name" title="${escapeHtml(file.NAME)}">${escapeHtml(file.NAME)}</span>
              <button class="btn-icon-subtle file-menu-btn" aria-label="File options" title="More options">
                <span class="material-symbols-outlined icon-md">more_vert</span>
              </button>
            </div>
            <div class="file-card-meta">
              <span>${formatBytes(file.SIZE)}</span>
              <span>${formatDate(file.MTIME)}</span>
            </div>
          </div>
        `;

        // Checkbox click
        const checkbox = card.querySelector('.item-checkbox');
        checkbox.addEventListener('click', (e) => {
          e.stopPropagation();
          this.toggleFileSelection(file.ID);
        });

        // Favorite button click
        const favBtn = card.querySelector('.file-card-fav-btn');
        favBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          this.toggleFileFavorite(file.ID, !Number(file.IS_FAVORITE));
        });

        // Card click / double-click
        card.addEventListener('click', (e) => {
          if (!e.target.closest('.file-menu-btn') && !e.target.closest('.item-checkbox') && !e.target.closest('.file-card-fav-btn')) {
            if (e.shiftKey || this.state.selectedFileIds.size > 0) {
              this.toggleFileSelection(file.ID);
            } else {
              this.openPreview(file);
            }
          }
        });

        card.addEventListener('dblclick', () => {
          this.openPreview(file);
        });

        // Context Menu
        const menuBtn = card.querySelector('.file-menu-btn');
        menuBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          this.handleItemActionTrigger('file', file, e);
        });

        grid.appendChild(card);
      });

      container.appendChild(grid);
    }

    renderFilesListView(files, container) {
      container.innerHTML = '';
      const table = document.createElement('table');
      table.className = 'files-list-table';

      const sort = this.state.sort;
      const getIndicator = (field) => {
        if (field === 'name') {
          return sort === 'name_asc' ? ' ↑' : (sort === 'name_desc' ? ' ↓' : '');
        }
        if (field === 'mtime') {
          return sort === 'mtime_asc' ? ' ↑' : (sort === 'mtime_desc' ? ' ↓' : '');
        }
        if (field === 'size') {
          return sort === 'size_asc' ? ' ↑' : (sort === 'size_desc' ? ' ↓' : '');
        }
        return '';
      };

      table.innerHTML = `
        <thead>
          <tr>
            <th style="width: 36px;">
              <input type="checkbox" id="selectAllCheckbox" title="Select all">
            </th>
            <th class="sortable" data-sort="name" style="cursor: pointer;" title="Sort by Name">Name${getIndicator('name')}</th>
            <th class="sortable" data-sort="mtime" style="cursor: pointer;" title="Sort by Date Modified">Date Modified${getIndicator('mtime')}</th>
            <th>Type</th>
            <th class="sortable" data-sort="size" style="cursor: pointer;" title="Sort by Size">Size${getIndicator('size')}</th>
            <th style="width: 48px; text-align: right;"></th>
          </tr>
        </thead>
        <tbody></tbody>
      `;

      table.querySelectorAll('th.sortable').forEach(th => {
        th.addEventListener('click', () => {
          const field = th.getAttribute('data-sort');
          let nextSort = 'name_asc';
          if (field === 'name') {
            nextSort = this.state.sort === 'name_asc' ? 'name_desc' : 'name_asc';
          } else if (field === 'mtime') {
            nextSort = this.state.sort === 'mtime_desc' ? 'mtime_asc' : 'mtime_desc';
          } else if (field === 'size') {
            nextSort = this.state.sort === 'size_desc' ? 'size_asc' : 'size_desc';
          }
          this.setSort(nextSort);
        });
      });

      const tbody = table.querySelector('tbody');
      const selectAllCb = table.querySelector('#selectAllCheckbox');

      const allSelected = files.length > 0 && files.every(f => this.state.selectedFileIds.has(f.ID));
      if (selectAllCb) {
        selectAllCb.checked = allSelected;
        selectAllCb.addEventListener('change', (e) => {
          if (e.target.checked) {
            files.forEach(f => this.state.selectedFileIds.add(f.ID));
          } else {
            this.state.selectedFileIds.clear();
          }
          this.updateSelectionBar();
          this.renderFiles();
        });
      }

      files.forEach(file => {
        const row = document.createElement('tr');
        const isSelected = this.state.selectedFileIds.has(file.ID);
        row.className = isSelected ? 'selected' : '';
        row.setAttribute('data-file-id', file.ID);

        const { icon, color, typeLabel } = getFileIconAndColor(file.MIME_TYPE, file.EXTENSION);
        const isFav = !!Number(file.IS_FAVORITE);

        row.innerHTML = `
          <td>
            <input type="checkbox" class="row-select-checkbox" ${isSelected ? 'checked' : ''}>
          </td>
          <td>
            <div class="table-file-name-cell">
              <button class="table-fav-btn ${isFav ? 'fav-active' : ''}" aria-label="Toggle favorite" title="${isFav ? 'Remove from favorites' : 'Add to favorites'}">
                <span class="material-symbols-outlined" style="font-size: 18px;">${isFav ? 'star' : 'star_border'}</span>
              </button>
              <span class="material-symbols-outlined table-file-icon" style="color: ${color};">${icon}</span>
              <span class="table-file-name" title="${escapeHtml(file.NAME)}">${escapeHtml(file.NAME)}</span>
            </div>
          </td>
          <td>${formatDate(file.MTIME)}</td>
          <td>${escapeHtml(typeLabel)}</td>
          <td>${formatBytes(file.SIZE)}</td>
          <td class="table-actions-cell">
            <button class="btn-icon-subtle file-menu-btn" aria-label="File actions" title="More options">
              <span class="material-symbols-outlined icon-md">more_vert</span>
            </button>
          </td>
        `;

        const rowCb = row.querySelector('.row-select-checkbox');
        rowCb.addEventListener('click', (e) => {
          e.stopPropagation();
          this.toggleFileSelection(file.ID);
        });

        const favBtn = row.querySelector('.table-fav-btn');
        favBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          this.toggleFileFavorite(file.ID, !Number(file.IS_FAVORITE));
        });

        row.addEventListener('click', (e) => {
          if (!e.target.closest('.file-menu-btn') && !e.target.closest('.row-select-checkbox') && !e.target.closest('.table-fav-btn')) {
            if (e.shiftKey || this.state.selectedFileIds.size > 0) {
              this.toggleFileSelection(file.ID);
            } else {
              this.openPreview(file);
            }
          }
        });

        row.addEventListener('dblclick', () => {
          this.openPreview(file);
        });

        const menuBtn = row.querySelector('.file-menu-btn');
        menuBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          this.handleItemActionTrigger('file', file, e);
        });

        tbody.appendChild(row);
      });

      container.appendChild(table);
    }

    toggleFileSelection(fileId) {
      if (this.state.selectedFileIds.has(fileId)) {
        this.state.selectedFileIds.delete(fileId);
      } else {
        this.state.selectedFileIds.add(fileId);
      }
      this.updateSelectionBar();
      this.renderFiles();
    }

    clearSelection() {
      this.state.selectedFileIds.clear();
      this.updateSelectionBar();
      this.renderFiles();
    }

    updateSelectionBar() {
      const count = this.state.selectedFileIds.size;
      const bar = this.dom.selectionBar;
      if (!bar) return;

      if (count > 0) {
        this.dom.selectionCountText.textContent = `${count} file${count > 1 ? 's' : ''} selected`;
        bar.classList.add('visible');
      } else {
        bar.classList.remove('visible');
      }
    }

    renderLoadingSkeletons() {
      if (this.dom.foldersGrid) {
        this.dom.foldersGrid.innerHTML = `
          <div class="folder-card skeleton skeleton-card"></div>
          <div class="folder-card skeleton skeleton-card"></div>
          <div class="folder-card skeleton skeleton-card"></div>
        `;
        this.dom.foldersSection.style.display = 'flex';
      }

      if (this.dom.filesContainer) {
        this.dom.filesContainer.innerHTML = `
          <div class="files-grid">
            <div class="file-card skeleton skeleton-card"></div>
            <div class="file-card skeleton skeleton-card"></div>
            <div class="file-card skeleton skeleton-card"></div>
            <div class="file-card skeleton skeleton-card"></div>
          </div>
        `;
        this.dom.filesSection.style.display = 'flex';
      }

      this.dom.emptyState.style.display = 'none';
    }

    // =======================================================================
    // 8. Filtering & Sorting
    // =======================================================================

    sortFolders(folders) {
      if (!Array.isArray(folders)) return [];
      const sort = this.state.sort || 'name_asc';
      return [...folders].sort((a, b) => {
        const nameA = a.NAME || '';
        const nameB = b.NAME || '';
        if (sort === 'name_desc') {
          return nameB.localeCompare(nameA, undefined, { sensitivity: 'base', numeric: true });
        }
        if (sort === 'mtime_desc') {
          const timeA = a.CDATE || a.MDATE ? new Date(a.CDATE || a.MDATE).getTime() : 0;
          const timeB = b.CDATE || b.MDATE ? new Date(b.CDATE || b.MDATE).getTime() : 0;
          return timeB - timeA;
        }
        if (sort === 'mtime_asc') {
          const timeA = a.CDATE || a.MDATE ? new Date(a.CDATE || a.MDATE).getTime() : 0;
          const timeB = b.CDATE || b.MDATE ? new Date(b.CDATE || b.MDATE).getTime() : 0;
          return timeA - timeB;
        }
        return nameA.localeCompare(nameB, undefined, { sensitivity: 'base', numeric: true });
      });
    }

    sortFiles(files) {
      if (!Array.isArray(files)) return [];
      const sort = this.state.sort || 'name_asc';
      return [...files].sort((a, b) => {
        const nameA = a.NAME || '';
        const nameB = b.NAME || '';
        switch (sort) {
          case 'name_desc':
            return nameB.localeCompare(nameA, undefined, { sensitivity: 'base', numeric: true });
          case 'name_asc':
            return nameA.localeCompare(nameB, undefined, { sensitivity: 'base', numeric: true });
          case 'mtime_desc':
            return (Number(b.MTIME) || 0) - (Number(a.MTIME) || 0);
          case 'mtime_asc':
            return (Number(a.MTIME) || 0) - (Number(b.MTIME) || 0);
          case 'size_desc':
            return (Number(b.SIZE) || 0) - (Number(a.SIZE) || 0);
          case 'size_asc':
            return (Number(a.SIZE) || 0) - (Number(b.SIZE) || 0);
          default:
            return nameA.localeCompare(nameB, undefined, { sensitivity: 'base', numeric: true });
        }
      });
    }

    getFilteredFolders() {
      if (!this.state.folders) return [];
      const query = this.state.searchQuery.toLowerCase().trim();
      let list = this.state.folders;
      if (query) {
        list = list.filter(f => f.NAME.toLowerCase().includes(query));
      }
      return this.sortFolders(list);
    }

    getFilteredFiles() {
      if (!this.state.files) return [];
      const query = this.state.searchQuery.toLowerCase().trim();
      let list = this.state.files;
      if (query) {
        list = list.filter(f => f.NAME.toLowerCase().includes(query));
      }
      return this.sortFiles(list);
    }

    handleSearchInput(query) {
      this.state.searchQuery = query;
      clearTimeout(this.searchDebounceTimer);
      this.searchDebounceTimer = setTimeout(() => {
        this.renderFolders();
        this.renderFiles();
      }, 150);
    }

    setSort(sortValue) {
      this.state.sort = sortValue;
      try {
        localStorage.setItem('altus_sort', sortValue);
      } catch (e) {}
      if (this.dom.sortSelect && this.dom.sortSelect.value !== sortValue) {
        this.dom.sortSelect.value = sortValue;
      }
      this.renderFolders();
      this.renderFiles();
      this.fetchCurrentFolder();
    }

    toggleTheme() {
      const nextTheme = this.state.theme === 'dark' ? 'light' : 'dark';
      this.setTheme(nextTheme);
      this.showToast(`Switched to ${nextTheme} mode`, 'info');
    }

    setTheme(theme) {
      this.state.theme = theme;
      try {
        localStorage.setItem('altus_theme', theme);
      } catch (e) {}
      this.applyTheme(theme);
    }

    applyTheme(theme) {
      document.documentElement.setAttribute('data-theme', theme);
      if (this.dom.themeToggleIcon) {
        this.dom.themeToggleIcon.textContent = theme === 'dark' ? 'light_mode' : 'dark_mode';
      }
      if (this.dom.themeToggleBtn) {
        const title = theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode';
        this.dom.themeToggleBtn.title = title;
        this.dom.themeToggleBtn.setAttribute('aria-label', title);
      }
    }

    setViewMode(mode) {
      this.state.viewMode = mode;
      localStorage.setItem('altus_view_mode', mode);
      this.applyViewMode(mode);
      this.renderFiles();
    }

    applyViewMode(mode) {
      if (mode === 'list') {
        this.dom.viewListBtn?.classList.add('active');
        this.dom.viewGridBtn?.classList.remove('active');
      } else {
        this.dom.viewGridBtn?.classList.add('active');
        this.dom.viewListBtn?.classList.remove('active');
      }
    }

    updateStats() {
      const totalFolders = this.state.folders?.length || 0;
      const totalFiles = this.state.files?.length || 0;
      const totalItems = totalFolders + totalFiles;

      if (this.dom.badgeTotalItems) {
        this.dom.badgeTotalItems.textContent = totalItems;
      }

      let totalBytes = 0;
      (this.state.files || []).forEach(f => {
        totalBytes += parseInt(f.SIZE, 10) || 0;
      });

      if (this.dom.quotaValueText) {
        this.dom.quotaValueText.textContent = formatBytes(totalBytes);
      }

      if (this.dom.quotaProgressFill) {
        const scale = Math.min(Math.max(totalBytes / (500 * 1024 * 1024), 0.02), 1.0);
        this.dom.quotaProgressFill.style.transform = `scaleX(${scale})`;
      }
    }

    // =======================================================================
    // 9. Operations & Modals (Tasks 5.2, 5.3, 5.4, 5.5, 5.6)
    // =======================================================================

    // Quick Sync (Task 5.4)
    async runQuickSync() {
      if (this.state.isSyncing) return;
      this.state.isSyncing = true;

      this.dom.syncStatusBadge.textContent = 'Syncing...';
      this.dom.syncNavIcon?.classList.add('spin-animation');
      this.dom.headerSyncBtn?.querySelector('.material-symbols-outlined')?.classList.add('spin-animation');

      try {
        const res = await AltusAPI.triggerSync();
        const data = res?.data || {};

        const msg = `Quick Sync complete: +${data.added_files || 0} files, updated ${data.updated_files || 0} in ${data.duration_ms || 0}ms`;
        this.showToast(msg, 'success');

        await this.fetchCurrentFolder();
      } catch (err) {
        this.showToast(err.message || 'Quick Sync failed', 'error');
      } finally {
        this.state.isSyncing = false;
        this.dom.syncStatusBadge.textContent = 'Ready';
        this.dom.syncNavIcon?.classList.remove('spin-animation');
        this.dom.headerSyncBtn?.querySelector('.material-symbols-outlined')?.classList.remove('spin-animation');
      }
    }

    // New Folder Modal (Task 5.2)
    openNewFolderModal() {
      this.dom.newFolderNameInput.value = '';
      this.dom.newFolderModal.classList.add('visible');
      setTimeout(() => this.dom.newFolderNameInput.focus(), 50);
    }

    async handleNewFolderSubmit(e) {
      e.preventDefault();
      const rawName = this.dom.newFolderNameInput.value;
      const name = sanitizeName(rawName);

      if (!name) {
        this.showToast('Please enter a valid folder name', 'error');
        return;
      }

      const activeColorBtn = this.dom.newFolderColorPicker.querySelector('.color-swatch-btn.active');
      const color = activeColorBtn ? activeColorBtn.getAttribute('data-color') : '#64748b';

      try {
        await AltusAPI.createFolder(name, this.state.currentFolderId, color);
        this.closeAllModals();
        this.showToast(`Folder "${name}" created`, 'success');
        await this.fetchCurrentFolder();
      } catch (err) {
        this.showToast(err.message || 'Failed to create folder', 'error');
      }
    }

    async updateFolderColor(folderId, color) {
      try {
        await AltusAPI.updateFolder(folderId, { color });
        this.showToast('Folder color updated', 'success');
        await this.fetchCurrentFolder();
      } catch (err) {
        this.showToast(err.message || 'Failed to update folder color', 'error');
      }
    }

    // Rename Modal (Task 5.3)
    openRenameModal(type, item) {
      this.state.activeContextItem = { type, data: item };
      this.dom.renameInput.value = item.NAME || '';
      document.getElementById('renameTitle').textContent = type === 'folder' ? 'Rename Folder' : 'Rename File';
      this.dom.renameModal.classList.add('visible');
      setTimeout(() => {
        this.dom.renameInput.focus();
        this.dom.renameInput.select();
      }, 50);
    }

    async handleRenameSubmit(e) {
      e.preventDefault();
      const rawName = this.dom.renameInput.value;
      const newName = sanitizeName(rawName);
      const item = this.state.activeContextItem?.data;
      const type = this.state.activeContextItem?.type;

      if (!newName || !item) {
        this.showToast('Please enter a valid name', 'error');
        return;
      }

      try {
        if (type === 'folder') {
          await AltusAPI.updateFolder(item.ID, { name: newName });
        } else {
          await AltusAPI.updateFile(item.ID, { name: newName });
        }
        this.closeAllModals();
        this.showToast(`Renamed to "${newName}"`, 'success');
        await this.fetchCurrentFolder();
      } catch (err) {
        this.showToast(err.message || 'Failed to rename item', 'error');
      }
    }

    // Move Modal (Task 5.3)
    async openMoveModal(type, item) {
      this.state.activeMoveItem = { type, data: item };
      this.state.selectedTargetFolderId = 0; // Default to root
      this.dom.moveItemDesc.textContent = `Move "${item.NAME}" to:`;
      this.dom.moveFolderTree.innerHTML = '<div style="padding: var(--space-3); color: var(--color-text-muted); font-size: var(--text-xs);">Loading folder hierarchy...</div>';
      this.dom.moveModal.classList.add('visible');

      try {
        const res = await AltusAPI.getAllFolders();
        this.state.allUserFolders = res?.data?.folders || [];
        this.renderMoveFolderTree(item, type);
      } catch (err) {
        this.dom.moveFolderTree.innerHTML = `<div style="padding: var(--space-3); color: var(--color-danger); font-size: var(--text-xs);">${escapeHtml(err.message)}</div>`;
      }
    }

    renderMoveFolderTree(movingItem, type) {
      const tree = this.dom.moveFolderTree;
      tree.innerHTML = '';

      // Root item
      const rootNode = document.createElement('button');
      rootNode.type = 'button';
      rootNode.className = 'tree-folder-node selected';
      rootNode.setAttribute('data-target-id', '0');
      rootNode.innerHTML = `
        <span class="material-symbols-outlined icon-sm">cloud</span>
        <span>My Cloud (Root)</span>
      `;
      rootNode.addEventListener('click', () => {
        tree.querySelectorAll('.tree-folder-node').forEach(n => n.classList.remove('selected'));
        rootNode.classList.add('selected');
        this.state.selectedTargetFolderId = 0;
      });
      tree.appendChild(rootNode);

      // Collect disabled folder IDs if moving a folder (disallow moving into self or subfolders)
      const disabledIds = new Set();
      if (type === 'folder') {
        disabledIds.add(movingItem.ID);
        const movingPrefix = movingItem.PATH + '/';
        this.state.allUserFolders.forEach(f => {
          if (f.PATH.startsWith(movingPrefix)) {
            disabledIds.add(f.ID);
          }
        });
      }

      this.state.allUserFolders.forEach(folder => {
        const depth = folder.PATH.split('/').length;
        const isDisabled = disabledIds.has(folder.ID);

        const node = document.createElement('button');
        node.type = 'button';
        node.className = `tree-folder-node ${isDisabled ? 'disabled' : ''}`;
        node.setAttribute('data-target-id', folder.ID);
        node.style.paddingLeft = `${(depth * 16) + 10}px`;

        node.innerHTML = `
          <span class="material-symbols-outlined icon-sm" style="color: ${escapeHtml(folder.COLOR || '#64748b')};">folder</span>
          <span>${escapeHtml(folder.NAME)}</span>
        `;

        if (!isDisabled) {
          node.addEventListener('click', () => {
            tree.querySelectorAll('.tree-folder-node').forEach(n => n.classList.remove('selected'));
            node.classList.add('selected');
            this.state.selectedTargetFolderId = folder.ID;
          });
        }

        tree.appendChild(node);
      });
    }

    async handleMoveSubmit(e) {
      e.preventDefault();
      const item = this.state.activeMoveItem?.data;
      const type = this.state.activeMoveItem?.type;
      const targetId = this.state.selectedTargetFolderId;

      if (!item) return;

      try {
        if (type === 'folder') {
          await AltusAPI.updateFolder(item.ID, { parent_id: targetId });
        } else {
          await AltusAPI.updateFile(item.ID, { folder_id: targetId });
        }
        this.closeAllModals();
        this.showToast(`Moved "${item.NAME}"`, 'success');
        await this.fetchCurrentFolder();
      } catch (err) {
        this.showToast(err.message || 'Failed to move item', 'error');
      }
    }

    // Delete Confirmation (Task 5.6)
    openDeleteModal(type, item) {
      this.state.activeContextItem = { type, data: item };
      if (type === 'folder') {
        this.dom.deleteMessage.textContent = `Are you sure you want to delete folder "${item.NAME}"? All subfolders and files contained inside will be permanently deleted from physical disk and database.`;
      } else {
        this.dom.deleteMessage.textContent = `Are you sure you want to delete file "${item.NAME}"? This file will be permanently removed from disk and database.`;
      }
      this.dom.deleteModal.classList.add('visible');
    }

    async handleDeleteConfirm() {
      const item = this.state.activeContextItem?.data;
      const type = this.state.activeContextItem?.type;
      if (!item) return;

      try {
        if (type === 'folder') {
          await AltusAPI.deleteFolder(item.ID);
        } else {
          await AltusAPI.deleteFile(item.ID);
        }
        this.closeAllModals();
        this.showToast(`Deleted "${item.NAME}"`, 'info');
        await this.fetchCurrentFolder();
      } catch (err) {
        this.showToast(err.message || 'Deletion failed', 'error');
      }
    }

    // Batch Actions (Task 5.5)
    handleBatchDownload() {
      const ids = Array.from(this.state.selectedFileIds);
      if (ids.length === 0) return;

      this.showToast(`Packaging ${ids.length} files into ZIP archive...`, 'info');
      window.location.href = `/api/v1/stream/batchDownload?file_ids=${ids.join(',')}`;
    }

    handleBatchDelete() {
      const ids = Array.from(this.state.selectedFileIds);
      if (ids.length === 0) return;

      this.dom.deleteMessage.textContent = `Are you sure you want to delete ${ids.length} selected file(s)? They will be permanently removed from disk and database.`;
      this.state.activeContextItem = { type: 'batch_files', data: ids };
      this.dom.deleteModal.classList.add('visible');

      this.dom.confirmDeleteBtn.onclick = async () => {
        try {
          for (const id of ids) {
            await AltusAPI.deleteFile(id);
          }
          this.closeAllModals();
          this.clearSelection();
          this.showToast(`Deleted ${ids.length} files`, 'info');
          await this.fetchCurrentFolder();
        } catch (err) {
          this.showToast(err.message || 'Error during batch deletion', 'error');
        }
      };
    }

    triggerDownload(fileId) {
      window.location.href = `/api/v1/files/${fileId}/download`;
    }

    async toggleFolderFavorite(folderId, isFavorite) {
      try {
        await AltusAPI.toggleFolderFavorite(folderId, isFavorite);
        this.showToast(isFavorite ? 'Folder added to favorites' : 'Folder removed from favorites', 'info');
        const folder = this.state.folders.find(f => f.ID === folderId);
        if (folder) folder.IS_FAVORITE = isFavorite ? 1 : 0;
        if (this.state.activeNav === 'favorites') {
          await this.fetchCurrentFolder();
        } else {
          this.renderFolders();
        }
      } catch (err) {
        this.showToast(err.message || 'Failed to update folder favorite status', 'error');
      }
    }

    async toggleFileFavorite(fileId, isFavorite) {
      try {
        await AltusAPI.toggleFileFavorite(fileId, isFavorite);
        this.showToast(isFavorite ? 'File added to favorites' : 'File removed from favorites', 'info');
        const file = this.state.files.find(f => f.ID === fileId);
        if (file) file.IS_FAVORITE = isFavorite ? 1 : 0;

        if (this.state.preview.isOpen && this.state.preview.file?.ID === fileId) {
          this.state.preview.file.IS_FAVORITE = isFavorite ? 1 : 0;
          if (this.dom.previewFavoriteIcon && this.dom.btnPreviewFavorite) {
            this.dom.previewFavoriteIcon.textContent = isFavorite ? 'star' : 'star_border';
            this.dom.btnPreviewFavorite.classList.toggle('fav-active', isFavorite);
            this.dom.btnPreviewFavorite.title = isFavorite ? 'Remove from favorites' : 'Add to favorites';
          }
        }

        if (this.state.activeNav === 'favorites') {
          await this.fetchCurrentFolder();
        } else {
          this.renderFiles();
        }
      } catch (err) {
        this.showToast(err.message || 'Failed to update file favorite status', 'error');
      }
    }

    async togglePreviewFavorite() {
      if (!this.state.preview.file) return;
      const file = this.state.preview.file;
      const isFav = !Number(file.IS_FAVORITE);
      await this.toggleFileFavorite(file.ID, isFav);
    }

    // =======================================================================
    // 10. Responsive Action Triggers & Mobile Bottom Sheet (Task 5.6)
    // =======================================================================

    handleItemActionTrigger(type, item, event) {
      const isMobile = window.innerWidth < 768;
      if (isMobile) {
        this.openMobileActionSheet(type, item);
      } else {
        this.openContextMenu(type, item, event);
      }
    }

    openMobileActionSheet(type, item) {
      this.closeAllDropdowns();
      this.state.activeContextItem = { type, data: item };

      const sheet = this.dom.mobileActionSheet;
      const backdrop = this.dom.mobileSheetBackdrop;
      const iconEl = this.dom.sheetItemIcon;
      const nameEl = this.dom.sheetItemName;
      const metaEl = this.dom.sheetItemMeta;
      const listEl = this.dom.sheetActionsList;

      if (!sheet || !backdrop) return;

      nameEl.textContent = item.NAME;
      const isFav = !!Number(item.IS_FAVORITE);

      if (type === 'folder') {
        iconEl.textContent = 'folder';
        iconEl.style.color = item.COLOR || 'var(--folder-slate)';
        metaEl.textContent = 'Folder';

        listEl.innerHTML = `
          <button class="sheet-action-btn" id="sheetFolderOpen">
            <span class="material-symbols-outlined icon-md">folder_open</span>
            <span>Open Folder</span>
          </button>
          <button class="sheet-action-btn" id="sheetFolderFavorite">
            <span class="material-symbols-outlined icon-md">${isFav ? 'star' : 'star_border'}</span>
            <span>${isFav ? 'Remove Favorite' : 'Favorite'}</span>
          </button>
          <button class="sheet-action-btn" id="sheetFolderRename">
            <span class="material-symbols-outlined icon-md">edit</span>
            <span>Rename</span>
          </button>
          <button class="sheet-action-btn" id="sheetFolderMove">
            <span class="material-symbols-outlined icon-md">drive_file_move</span>
            <span>Move</span>
          </button>
          <button class="sheet-action-btn danger" id="sheetFolderDelete">
            <span class="material-symbols-outlined icon-md">delete</span>
            <span>Delete</span>
          </button>
        `;

        listEl.querySelector('#sheetFolderOpen').onclick = () => {
          this.closeMobileActionSheet();
          this.navigateToFolder(item.ID);
        };
        listEl.querySelector('#sheetFolderFavorite').onclick = () => {
          this.closeMobileActionSheet();
          this.toggleFolderFavorite(item.ID, !isFav);
        };
        listEl.querySelector('#sheetFolderRename').onclick = () => {
          this.closeMobileActionSheet();
          this.openRenameModal('folder', item);
        };
        listEl.querySelector('#sheetFolderMove').onclick = () => {
          this.closeMobileActionSheet();
          this.openMoveModal('folder', item);
        };
        listEl.querySelector('#sheetFolderDelete').onclick = () => {
          this.closeMobileActionSheet();
          this.openDeleteModal('folder', item);
        };
      } else {
        const { icon, color, typeLabel } = getFileIconAndColor(item.MIME_TYPE, item.EXTENSION);
        iconEl.textContent = icon;
        iconEl.style.color = color;
        metaEl.textContent = `${formatBytes(item.SIZE)} • ${typeLabel}`;

        listEl.innerHTML = `
          <button class="sheet-action-btn" id="sheetFilePreview">
            <span class="material-symbols-outlined icon-md">visibility</span>
            <span>Preview File</span>
          </button>
          <button class="sheet-action-btn" id="sheetFileFavorite">
            <span class="material-symbols-outlined icon-md">${isFav ? 'star' : 'star_border'}</span>
            <span>${isFav ? 'Remove Favorite' : 'Favorite'}</span>
          </button>
          <button class="sheet-action-btn" id="sheetFileDownload">
            <span class="material-symbols-outlined icon-md">download</span>
            <span>Download</span>
          </button>
          <button class="sheet-action-btn" id="sheetFileRename">
            <span class="material-symbols-outlined icon-md">edit</span>
            <span>Rename</span>
          </button>
          <button class="sheet-action-btn" id="sheetFileMove">
            <span class="material-symbols-outlined icon-md">drive_file_move</span>
            <span>Move</span>
          </button>
          <button class="sheet-action-btn danger" id="sheetFileDelete">
            <span class="material-symbols-outlined icon-md">delete</span>
            <span>Delete</span>
          </button>
        `;

        listEl.querySelector('#sheetFilePreview').onclick = () => {
          this.closeMobileActionSheet();
          this.openPreview(item);
        };
        listEl.querySelector('#sheetFileFavorite').onclick = () => {
          this.closeMobileActionSheet();
          this.toggleFileFavorite(item.ID, !isFav);
        };
        listEl.querySelector('#sheetFileDownload').onclick = () => {
          this.closeMobileActionSheet();
          this.triggerDownload(item.ID);
        };
        listEl.querySelector('#sheetFileRename').onclick = () => {
          this.closeMobileActionSheet();
          this.openRenameModal('file', item);
        };
        listEl.querySelector('#sheetFileMove').onclick = () => {
          this.closeMobileActionSheet();
          this.openMoveModal('file', item);
        };
        listEl.querySelector('#sheetFileDelete').onclick = () => {
          this.closeMobileActionSheet();
          this.openDeleteModal('file', item);
        };
      }

      backdrop.classList.add('visible');
      sheet.classList.add('open');
    }

    closeMobileActionSheet() {
      this.dom.mobileActionSheet?.classList.remove('open');
      this.dom.mobileSheetBackdrop?.classList.remove('visible');
    }

    openContextMenu(type, item, event) {
      this.closeAllDropdowns();
      this.state.activeContextItem = { type, data: item };

      if (type === 'folder') {
        const isFav = !!Number(item.IS_FAVORITE);
        if (this.dom.ctxFolderFavoriteIcon) {
          this.dom.ctxFolderFavoriteIcon.textContent = isFav ? 'star' : 'star_border';
        }
        if (this.dom.ctxFolderFavoriteText) {
          this.dom.ctxFolderFavoriteText.textContent = isFav ? 'Remove Favorite' : 'Favorite';
        }
      } else {
        const isFav = !!Number(item.IS_FAVORITE);
        if (this.dom.ctxFileFavoriteIcon) {
          this.dom.ctxFileFavoriteIcon.textContent = isFav ? 'star' : 'star_border';
        }
        if (this.dom.ctxFileFavoriteText) {
          this.dom.ctxFileFavoriteText.textContent = isFav ? 'Remove Favorite' : 'Favorite';
        }
      }

      const menu = type === 'folder' ? this.dom.folderContextMenu : this.dom.fileContextMenu;
      if (!menu) return;

      const triggerRect = event.currentTarget.getBoundingClientRect();
      menu.style.top = `${triggerRect.bottom + window.scrollY + 4}px`;
      menu.style.left = `${Math.min(triggerRect.left + window.scrollX - 120, window.innerWidth - 200)}px`;
      menu.classList.add('visible');
    }

    toggleDropdown(dropdown) {
      const isVisible = dropdown.classList.contains('visible');
      this.closeAllDropdowns();
      if (!isVisible) {
        dropdown.classList.add('visible');
      }
    }

    closeAllDropdowns() {
      document.querySelectorAll('.dropdown-menu').forEach(m => m.classList.remove('visible'));
    }

    closeAllModals() {
      document.querySelectorAll('.modal-backdrop').forEach(m => {
        if (m.id !== 'authOverlay' || this.state.user) {
          m.classList.remove('visible');
        }
      });
    }

    toggleMobileSidebar(open) {
      this.dom.appSidebar?.classList.toggle('open', open);
      this.dom.sidebarBackdrop?.classList.toggle('visible', open);
    }

    // =======================================================================
    // 11. Authentication Flow
    // =======================================================================

    showAuthOverlay() {
      this.dom.authOverlay.classList.add('visible');
      this.dom.totpGroup.style.display = 'none';
      this.dom.authUsernameInput.focus();
    }

    async handleAuthSubmit(e) {
      e.preventDefault();
      const username = this.dom.authUsernameInput.value.trim();
      const password = this.dom.authPasswordInput.value;
      const totpCode = this.dom.authTotpInput.value.trim();

      try {
        if (this.state.pending2FAUserId) {
          const res = await AltusAPI.verify2FA(this.state.pending2FAUserId, totpCode);
          this.onLoginSuccess(res?.data?.user);
          return;
        }

        const res = await AltusAPI.login(username, password);
        const data = res?.data;

        if (data?.totp_required) {
          this.state.pending2FAUserId = data.user_id;
          this.dom.totpGroup.style.display = 'flex';
          this.dom.authTotpInput.required = true;
          this.dom.authTotpInput.focus();
          this.showToast('Please enter your 2FA verification code', 'info');
          return;
        }

        this.onLoginSuccess(data?.user);
      } catch (err) {
        this.showToast(err.message || 'Authentication failed', 'error');
      }
    }

    onLoginSuccess(user) {
      this.state.user = user;
      this.dom.authOverlay.classList.remove('visible');
      this.updateUserUI(user);
      this.showToast(`Welcome back, ${user.username}`, 'success');
      this.fetchCurrentFolder();
    }

    handleUnauthenticated() {
      this.state.user = null;
      this.showAuthOverlay();
    }

    async logout() {
      try {
        await AltusAPI.logout();
      } catch (e) {
        // Proceed with client logout
      }
      this.state.user = null;
      window.location.href = '/';
    }

    updateUserUI(user) {
      if (!user) return;
      if (this.dom.userAvatar) {
        this.dom.userAvatar.textContent = (user.username || 'U')[0].toUpperCase();
      }
      if (this.dom.userNameLabel) {
        this.dom.userNameLabel.textContent = user.name || user.username;
      }
      if (this.dom.userEmailLabel) {
        this.dom.userEmailLabel.textContent = user.email || 'Cloud User';
      }
    }

    // =======================================================================
    // 11.5 Account Settings & Security Modal (Task 7.1)
    // =======================================================================

    async openSettingsModal() {
      if (!this.state.user) {
        try {
          const res = await AltusAPI.getProfile();
          if (res?.data?.user) {
            this.state.user = res.data.user;
            this.updateUserUI(this.state.user);
          } else {
            this.showAuthOverlay();
            return;
          }
        } catch (e) {
          this.showAuthOverlay();
          return;
        }
      }

      const user = this.state.user;

      // Populate user overview
      if (this.dom.settingsAvatar) {
        this.dom.settingsAvatar.textContent = (user.username || 'U')[0].toUpperCase();
      }
      if (this.dom.settingsUsername) {
        this.dom.settingsUsername.textContent = user.name || user.username;
      }
      if (this.dom.settingsEmail) {
        this.dom.settingsEmail.textContent = user.email || 'user@altus.cloud';
      }
      if (this.dom.settingsRoleBadge) {
        const isSuper = user.permissions === 1;
        this.dom.settingsRoleBadge.innerHTML = `
          <span class="material-symbols-outlined icon-xs">${isSuper ? 'admin_panel_settings' : 'verified_user'}</span>
          <span>${isSuper ? 'Administrator' : 'Cloud User'}</span>
        `;
      }
      this.sync2FABadge();

      // Reset password form
      if (this.dom.passwordChangeForm) {
        this.dom.passwordChangeForm.reset();
      }
      if (this.dom.passwordErrorAlert) {
        this.dom.passwordErrorAlert.style.display = 'none';
        this.dom.passwordErrorAlert.textContent = '';
      }

      // Reset to Security tab by default
      this.switchSettingsTab('security');

      // Sync TOTP view based on user 2FA status
      this.syncTotpViews();

      this.closeAllModals();
      this.dom.settingsModal?.classList.add('visible');
    }

    sync2FABadge() {
      if (!this.dom.settings2faBadge) return;
      const isEnabled = !!this.state.user?.totp_enabled;
      if (isEnabled) {
        this.dom.settings2faBadge.className = 'badge badge-success';
        this.dom.settings2faBadge.innerHTML = `
          <span class="material-symbols-outlined icon-xs">check_circle</span>
          <span>2FA Enabled</span>
        `;
      } else {
        this.dom.settings2faBadge.className = 'badge badge-neutral';
        this.dom.settings2faBadge.innerHTML = `
          <span class="material-symbols-outlined icon-xs">lock</span>
          <span>2FA Disabled</span>
        `;
      }
    }

    switchSettingsTab(tabName) {
      if (tabName === 'security') {
        this.dom.tabSecurityBtn?.classList.add('active');
        this.dom.tabSecurityBtn?.setAttribute('aria-selected', 'true');
        this.dom.tabTotpBtn?.classList.remove('active');
        this.dom.tabTotpBtn?.setAttribute('aria-selected', 'false');

        if (this.dom.panelSecurity) this.dom.panelSecurity.style.display = 'block';
        if (this.dom.panelTotp) this.dom.panelTotp.style.display = 'none';
      } else if (tabName === 'totp') {
        this.dom.tabTotpBtn?.classList.add('active');
        this.dom.tabTotpBtn?.setAttribute('aria-selected', 'true');
        this.dom.tabSecurityBtn?.classList.remove('active');
        this.dom.tabSecurityBtn?.setAttribute('aria-selected', 'false');

        if (this.dom.panelTotp) this.dom.panelTotp.style.display = 'block';
        if (this.dom.panelSecurity) this.dom.panelSecurity.style.display = 'none';

        this.syncTotpViews();
      }
    }

    syncTotpViews() {
      const isEnabled = !!this.state.user?.totp_enabled;
      if (this.dom.totpSetupView) this.dom.totpSetupView.style.display = 'none';

      if (isEnabled) {
        if (this.dom.totpDisabledView) this.dom.totpDisabledView.style.display = 'none';
        if (this.dom.totpEnabledView) this.dom.totpEnabledView.style.display = 'block';
        if (this.dom.totpDisableForm) this.dom.totpDisableForm.reset();
        if (this.dom.totpDisableErrorAlert) this.dom.totpDisableErrorAlert.style.display = 'none';
      } else {
        if (this.dom.totpEnabledView) this.dom.totpEnabledView.style.display = 'none';
        if (this.dom.totpDisabledView) this.dom.totpDisabledView.style.display = 'block';
      }
    }

    async handlePasswordChangeSubmit(e) {
      e.preventDefault();
      const currentPassword = this.dom.settingsCurrentPassword?.value || '';
      const newPassword = this.dom.settingsNewPassword?.value || '';
      const confirmPassword = this.dom.settingsConfirmPassword?.value || '';

      if (this.dom.passwordErrorAlert) {
        this.dom.passwordErrorAlert.style.display = 'none';
        this.dom.passwordErrorAlert.textContent = '';
      }

      if (newPassword.length < 6) {
        this.showPasswordError('New password must be at least 6 characters long.');
        return;
      }

      if (newPassword !== confirmPassword) {
        this.showPasswordError('New passwords do not match. Please verify your entries.');
        return;
      }

      const submitBtn = this.dom.btnSubmitPassword;
      const originalText = submitBtn ? submitBtn.innerHTML : '';
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<span class="material-symbols-outlined icon-sm rotating">progress_activity</span><span>Updating...</span>';
      }

      try {
        await AltusAPI.updatePassword(currentPassword, newPassword);
        this.dom.passwordChangeForm?.reset();
        this.showToast('Password updated successfully.', 'success');
        this.closeAllModals();
      } catch (err) {
        const errorMsg = err.message || 'Failed to update password.';
        this.showPasswordError(errorMsg);
        this.showToast(errorMsg, 'error');
      } finally {
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.innerHTML = originalText;
        }
      }
    }

    showPasswordError(msg) {
      if (this.dom.passwordErrorAlert) {
        this.dom.passwordErrorAlert.textContent = msg;
        this.dom.passwordErrorAlert.style.display = 'block';
      }
    }

    async startTotpSetup() {
      const btn = this.dom.btnStartTotpSetup;
      const originalText = btn ? btn.innerHTML : '';
      if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<span class="material-symbols-outlined icon-sm rotating">progress_activity</span><span>Initializing 2FA...</span>';
      }

      try {
        const res = await AltusAPI.setupTOTP();
        const data = res?.data;
        if (!data || !data.secret) {
          throw new Error('Invalid response from TOTP setup endpoint.');
        }

        this.state.pendingTotpSecret = data.secret;

        // Populate manual secret text
        if (this.dom.totpSecretCodeText) {
          this.dom.totpSecretCodeText.textContent = data.secret;
        }

        // Render QR Code SVG
        if (this.dom.totpQrContainer) {
          if (typeof QRCode !== 'undefined') {
            try {
              const qr = new QRCode({
                content: data.provisioning_uri,
                width: 180,
                height: 180,
                padding: 2,
                color: '#0f172a',
                background: '#ffffff'
              });
              this.dom.totpQrContainer.innerHTML = qr.svg({ container: 'svg-viewbox' });
            } catch (qrErr) {
              this.dom.totpQrContainer.innerHTML = `<p class="step-desc text-danger">QR Code display unavailable. Please enter secret manually.</p>`;
            }
          } else {
            this.dom.totpQrContainer.innerHTML = `<p class="step-desc text-muted">Please enter secret key manually into your authenticator app.</p>`;
          }
        }

        // Switch to Setup view
        if (this.dom.totpDisabledView) this.dom.totpDisabledView.style.display = 'none';
        if (this.dom.totpEnabledView) this.dom.totpEnabledView.style.display = 'none';
        if (this.dom.totpSetupView) this.dom.totpSetupView.style.display = 'block';

        if (this.dom.totpVerifyForm) this.dom.totpVerifyForm.reset();
        if (this.dom.totpVerifyErrorAlert) this.dom.totpVerifyErrorAlert.style.display = 'none';
        setTimeout(() => this.dom.totpVerifyCodeInput?.focus(), 100);
      } catch (err) {
        this.showToast(err.message || 'Could not initiate 2FA setup.', 'error');
      } finally {
        if (btn) {
          btn.disabled = false;
          btn.innerHTML = originalText;
        }
      }
    }

    copyTotpSecret() {
      const secret = this.state.pendingTotpSecret || this.dom.totpSecretCodeText?.textContent;
      if (!secret || secret === '...') return;

      navigator.clipboard.writeText(secret).then(() => {
        this.showToast('2FA secret copied to clipboard.', 'success');
        const copyBtn = this.dom.btnCopyTotpSecret;
        if (copyBtn) {
          const icon = copyBtn.querySelector('.material-symbols-outlined');
          if (icon) icon.textContent = 'check';
          setTimeout(() => {
            if (icon) icon.textContent = 'content_copy';
          }, 2000);
        }
      }).catch(() => {
        this.showToast('Could not copy automatically. Please select and copy the text manually.', 'info');
      });
    }

    cancelTotpSetup() {
      this.state.pendingTotpSecret = null;
      this.syncTotpViews();
    }

    async handleTotpVerifySubmit(e) {
      e.preventDefault();
      const code = (this.dom.totpVerifyCodeInput?.value || '').trim();

      if (this.dom.totpVerifyErrorAlert) {
        this.dom.totpVerifyErrorAlert.style.display = 'none';
        this.dom.totpVerifyErrorAlert.textContent = '';
      }

      if (code.length !== 6) {
        if (this.dom.totpVerifyErrorAlert) {
          this.dom.totpVerifyErrorAlert.textContent = 'Please enter a valid 6-digit verification code.';
          this.dom.totpVerifyErrorAlert.style.display = 'block';
        }
        return;
      }

      const submitBtn = this.dom.btnSubmitTotpVerify;
      const originalText = submitBtn ? submitBtn.innerHTML : '';
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<span class="material-symbols-outlined icon-sm rotating">progress_activity</span><span>Verifying...</span>';
      }

      try {
        await AltusAPI.verifyTOTP(code);
        if (this.state.user) {
          this.state.user.totp_enabled = true;
        }
        this.state.pendingTotpSecret = null;
        this.sync2FABadge();
        this.syncTotpViews();
        this.showToast('Two-factor authentication enabled successfully.', 'success');
      } catch (err) {
        const errorMsg = err.message || 'Invalid verification code. Please check your authenticator.';
        if (this.dom.totpVerifyErrorAlert) {
          this.dom.totpVerifyErrorAlert.textContent = errorMsg;
          this.dom.totpVerifyErrorAlert.style.display = 'block';
        }
        this.showToast(errorMsg, 'error');
      } finally {
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.innerHTML = originalText;
        }
      }
    }

    async handleTotpDisableSubmit(e) {
      e.preventDefault();
      const password = this.dom.totpDisablePasswordInput?.value || '';

      if (this.dom.totpDisableErrorAlert) {
        this.dom.totpDisableErrorAlert.style.display = 'none';
        this.dom.totpDisableErrorAlert.textContent = '';
      }

      if (!password) {
        if (this.dom.totpDisableErrorAlert) {
          this.dom.totpDisableErrorAlert.textContent = 'Password confirmation is required to disable 2FA.';
          this.dom.totpDisableErrorAlert.style.display = 'block';
        }
        return;
      }

      const submitBtn = this.dom.btnSubmitTotpDisable;
      const originalText = submitBtn ? submitBtn.innerHTML : '';
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<span class="material-symbols-outlined icon-sm rotating">progress_activity</span><span>Disabling...</span>';
      }

      try {
        await AltusAPI.disableTOTP(password);
        if (this.state.user) {
          this.state.user.totp_enabled = false;
        }
        this.sync2FABadge();
        this.syncTotpViews();
        this.showToast('Two-factor authentication disabled successfully.', 'success');
      } catch (err) {
        const errorMsg = err.message || 'Failed to disable 2FA. Verify your password.';
        if (this.dom.totpDisableErrorAlert) {
          this.dom.totpDisableErrorAlert.textContent = errorMsg;
          this.dom.totpDisableErrorAlert.style.display = 'block';
        }
        this.showToast(errorMsg, 'error');
      } finally {
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.innerHTML = originalText;
        }
      }
    }

    // =======================================================================
    // 12. Toast Notifications
    // =======================================================================

    showToast(message, type = 'info', duration = 3500) {
      const container = this.dom.toastContainer;
      if (!container) return;

      const toast = document.createElement('div');
      toast.className = `toast toast-${type}`;

      let icon = 'info';
      if (type === 'success') icon = 'check_circle';
      if (type === 'error') icon = 'error';

      toast.innerHTML = `
        <span class="material-symbols-outlined icon-md">${icon}</span>
        <span>${escapeHtml(message)}</span>
      `;

      container.appendChild(toast);

      setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateY(12px) scale(0.95)';
        setTimeout(() => toast.remove(), 200);
      }, duration);
    }

    // =======================================================================
    // 13. Media Preview System (Tasks 6.1 - 6.6)
    // =======================================================================

    bindPreviewEvents() {
      // Close Preview
      this.dom.btnPreviewClose?.addEventListener('click', () => this.closePreview());
      this.dom.previewModal?.addEventListener('click', (e) => {
        if (e.target === this.dom.previewModal) {
          this.closePreview();
        }
      });

      // Navigation chevrons
      this.dom.previewNavPrev?.addEventListener('click', () => this.navigatePreview(-1));
      this.dom.previewNavNext?.addEventListener('click', () => this.navigatePreview(1));

      // Header actions
      this.dom.btnPreviewFavorite?.addEventListener('click', () => {
        this.togglePreviewFavorite();
      });

      this.dom.btnPreviewNewTab?.addEventListener('click', () => {
        if (this.state.preview.file) {
          window.open(`/api/v1/files/${this.state.preview.file.ID}/stream`, '_blank');
        }
      });

      this.dom.btnPreviewDownload?.addEventListener('click', () => {
        if (this.state.preview.file) {
          this.triggerDownload(this.state.preview.file.ID);
        }
      });

      // Image Zoom controls (Task 6.2)
      this.dom.btnZoomIn?.addEventListener('click', () => this.zoomImage(0.25));
      this.dom.btnZoomOut?.addEventListener('click', () => this.zoomImage(-0.25));
      this.dom.btnZoomReset?.addEventListener('click', () => this.resetImageZoom());
      this.dom.btnZoomFit?.addEventListener('click', () => this.fitImageZoom());

      // Code / Text controls (Task 6.6)
      this.dom.btnToggleWrap?.addEventListener('click', () => this.toggleCodeWrap());
      this.dom.btnCopyCode?.addEventListener('click', () => this.copyCodeToClipboard());
    }

    handlePreviewKeydown(e) {
      if (!this.state.preview.isOpen) return;

      if (e.key === 'Escape') {
        e.preventDefault();
        this.closePreview();
        return;
      }

      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        this.navigatePreview(-1);
        return;
      }

      if (e.key === 'ArrowRight') {
        e.preventDefault();
        this.navigatePreview(1);
        return;
      }

      const type = this.state.preview.type;

      if (type === 'image') {
        if (e.key === '+' || e.key === '=') {
          e.preventDefault();
          this.zoomImage(0.25);
        } else if (e.key === '-' || e.key === '_') {
          e.preventDefault();
          this.zoomImage(-0.25);
        } else if (e.key === '0') {
          e.preventDefault();
          this.resetImageZoom();
        } else if (e.key.toLowerCase() === 'f') {
          e.preventDefault();
          this.fitImageZoom();
        }
      } else if (type === 'video' || type === 'audio') {
        const mediaEl = (type === 'video')
          ? this.state.preview.videoElement
          : this.state.preview.audioElement;

        if (!mediaEl) return;

        if (e.key === ' ' || e.key.toLowerCase() === 'k') {
          e.preventDefault();
          if (mediaEl.paused) {
            mediaEl.play();
          } else {
            mediaEl.pause();
          }
        } else if (e.key.toLowerCase() === 'm') {
          e.preventDefault();
          mediaEl.muted = !mediaEl.muted;
        } else if (type === 'video' && e.key.toLowerCase() === 'f') {
          e.preventDefault();
          if (document.fullscreenElement) {
            document.exitFullscreen();
          } else if (mediaEl.requestFullscreen) {
            mediaEl.requestFullscreen();
          }
        }
      } else if (type === 'code') {
        if (e.key.toLowerCase() === 'w') {
          e.preventDefault();
          this.toggleCodeWrap();
        }
      }
    }

    openPreview(file) {
      if (!file) return;

      const filteredFiles = this.getFilteredFiles();
      let index = filteredFiles.findIndex(f => f.ID === file.ID);
      if (index === -1) {
        index = 0;
        this.state.preview.filesList = [file];
      } else {
        this.state.preview.filesList = filteredFiles;
      }

      this.state.preview.currentIndex = index;
      this.state.preview.isOpen = true;
      this.dom.previewModal.classList.add('visible');

      this.renderPreviewItem(file);
    }

    closePreview() {
      // Pause and release any media streaming elements
      if (this.state.preview.audioElement) {
        this.state.preview.audioElement.pause();
        this.state.preview.audioElement.src = '';
        this.state.preview.audioElement = null;
      }

      if (this.state.preview.videoElement) {
        this.state.preview.videoElement.pause();
        this.state.preview.videoElement.src = '';
        this.state.preview.videoElement = null;
      }

      this.dom.previewModal.classList.remove('visible');
      this.dom.previewStage.innerHTML = '';
      this.state.preview.isOpen = false;
      this.state.preview.file = null;
      this.state.preview.type = null;
    }

    navigatePreview(direction) {
      if (!this.state.preview.filesList.length) return;

      const newIndex = this.state.preview.currentIndex + direction;
      if (newIndex < 0 || newIndex >= this.state.preview.filesList.length) return;

      this.state.preview.currentIndex = newIndex;
      const nextFile = this.state.preview.filesList[newIndex];
      this.renderPreviewItem(nextFile);
    }

    renderPreviewItem(file) {
      // Pause previous playback
      if (this.state.preview.audioElement) {
        this.state.preview.audioElement.pause();
        this.state.preview.audioElement.src = '';
        this.state.preview.audioElement = null;
      }
      if (this.state.preview.videoElement) {
        this.state.preview.videoElement.pause();
        this.state.preview.videoElement.src = '';
        this.state.preview.videoElement = null;
      }

      this.state.preview.file = file;
      const type = getFilePreviewType(file.MIME_TYPE, file.EXTENSION);
      this.state.preview.type = type;

      // Header Metadata
      const { icon, color } = getFileIconAndColor(file.MIME_TYPE, file.EXTENSION);
      this.dom.previewTypeIcon.textContent = icon;
      this.dom.previewTypeIcon.style.color = color;
      this.dom.previewFilename.textContent = file.NAME;
      this.dom.previewFilesize.textContent = formatBytes(file.SIZE);

      const total = this.state.preview.filesList.length;
      const curr = this.state.preview.currentIndex + 1;
      this.dom.previewFileIndex.textContent = `${curr} of ${total}`;

      // Favorite button in preview header
      if (this.dom.btnPreviewFavorite && this.dom.previewFavoriteIcon) {
        const isFav = !!Number(file.IS_FAVORITE);
        this.dom.previewFavoriteIcon.textContent = isFav ? 'star' : 'star_border';
        this.dom.btnPreviewFavorite.classList.toggle('fav-active', isFav);
        this.dom.btnPreviewFavorite.title = isFav ? 'Remove from favorites' : 'Add to favorites';
      }

      // Navigation chevrons
      this.dom.previewNavPrev.classList.toggle('disabled', this.state.preview.currentIndex <= 0);
      this.dom.previewNavNext.classList.toggle('disabled', this.state.preview.currentIndex >= total - 1);

      // Toolbars
      this.dom.imageToolbarGroup.style.display = (type === 'image') ? 'flex' : 'none';
      this.dom.codeToolbarGroup.style.display = (type === 'code') ? 'flex' : 'none';

      // Footer reset
      this.dom.previewFooterInfo.textContent = '';

      // Stage Rendering
      this.dom.previewStage.innerHTML = '';

      switch (type) {
        case 'image':
          this.renderImagePreview(file);
          break;
        case 'pdf':
          this.renderPdfPreview(file);
          break;
        case 'audio':
          this.renderAudioPreview(file);
          break;
        case 'video':
          this.renderVideoPreview(file);
          break;
        case 'code':
          this.renderCodePreview(file);
          break;
        default:
          this.renderUnsupportedPreview(file);
          break;
      }
    }

    // Task 6.2: Image Previewer with Pan / Zoom
    renderImagePreview(file) {
      this.state.preview.zoom = {
        scale: 1,
        minScale: 0.25,
        maxScale: 5,
        isPanning: false,
        startX: 0,
        startY: 0,
        translateX: 0,
        translateY: 0
      };

      const viewport = document.createElement('div');
      viewport.className = 'image-stage-viewport';
      viewport.id = 'imageStageViewport';

      const img = document.createElement('img');
      img.className = 'preview-stage-image';
      img.id = 'previewImage';
      img.alt = file.NAME;
      img.draggable = false;
      img.src = `/api/v1/files/${file.ID}/stream`;

      img.onload = () => {
        this.dom.previewFooterInfo.textContent = `${img.naturalWidth} × ${img.naturalHeight} px • ${file.MIME_TYPE || 'Image'}`;
      };

      img.onerror = () => {
        viewport.innerHTML = `
          <div class="unsupported-stage-card">
            <span class="material-symbols-outlined unsupported-icon">broken_image</span>
            <h4 class="unsupported-title">Failed to load image</h4>
            <p class="unsupported-desc">The image format or data could not be rendered.</p>
          </div>
        `;
      };

      viewport.appendChild(img);
      this.dom.previewStage.appendChild(viewport);

      this.bindImageZoomAndPan(img, viewport);
      this.updateImageTransform();
    }

    bindImageZoomAndPan(img, viewport) {
      const zoom = this.state.preview.zoom;

      // Mouse Wheel Zoom
      viewport.addEventListener('wheel', (e) => {
        e.preventDefault();
        const delta = e.deltaY < 0 ? 0.2 : -0.2;
        this.zoomImage(delta);
      }, { passive: false });

      // Double-Click Toggle Fit vs 200%
      viewport.addEventListener('dblclick', (e) => {
        e.preventDefault();
        if (zoom.scale > 1.05) {
          this.resetImageZoom();
        } else {
          this.setZoomScale(2.0);
        }
      });

      // Pointer Drag to Pan (when zoomed)
      viewport.addEventListener('pointerdown', (e) => {
        if (zoom.scale <= 1.0) return;
        zoom.isPanning = true;
        zoom.startX = e.clientX - zoom.translateX;
        zoom.startY = e.clientY - zoom.translateY;
        viewport.classList.add('is-panning');
        viewport.setPointerCapture(e.pointerId);
      });

      viewport.addEventListener('pointermove', (e) => {
        if (!zoom.isPanning) return;
        zoom.translateX = e.clientX - zoom.startX;
        zoom.translateY = e.clientY - zoom.startY;
        this.updateImageTransform(false);
      });

      const stopPan = (e) => {
        if (zoom.isPanning) {
          zoom.isPanning = false;
          viewport.classList.remove('is-panning');
          try { viewport.releasePointerCapture(e.pointerId); } catch (_) {}
        }
      };

      viewport.addEventListener('pointerup', stopPan);
      viewport.addEventListener('pointercancel', stopPan);
    }

    setZoomScale(scale) {
      const zoom = this.state.preview.zoom;
      zoom.scale = Math.max(zoom.minScale, Math.min(zoom.maxScale, scale));
      if (zoom.scale <= 1.0) {
        zoom.translateX = 0;
        zoom.translateY = 0;
      }
      this.updateImageTransform();
    }

    zoomImage(delta) {
      const zoom = this.state.preview.zoom;
      this.setZoomScale(zoom.scale + delta);
    }

    resetImageZoom() {
      const zoom = this.state.preview.zoom;
      zoom.scale = 1.0;
      zoom.translateX = 0;
      zoom.translateY = 0;
      this.updateImageTransform();
    }

    fitImageZoom() {
      this.resetImageZoom();
    }

    updateImageTransform(smooth = true) {
      const img = document.getElementById('previewImage');
      const viewport = document.getElementById('imageStageViewport');
      const zoom = this.state.preview.zoom;
      if (!img || !zoom) return;

      img.style.transition = smooth ? 'transform 120ms ease-out' : 'none';
      img.style.transform = `translate(${zoom.translateX}px, ${zoom.translateY}px) scale(${zoom.scale})`;

      if (viewport) {
        viewport.classList.toggle('can-pan', zoom.scale > 1.0);
      }

      if (this.dom.zoomLevelBadge) {
        this.dom.zoomLevelBadge.textContent = `${Math.round(zoom.scale * 100)}%`;
      }
    }

    // Task 6.3: Embedded PDF Viewer
    renderPdfPreview(file) {
      const container = document.createElement('div');
      container.className = 'pdf-stage-container';

      const iframe = document.createElement('iframe');
      iframe.className = 'preview-pdf-frame';
      iframe.title = file.NAME;
      iframe.src = `/api/v1/files/${file.ID}/stream#toolbar=1`;

      container.appendChild(iframe);
      this.dom.previewStage.appendChild(container);
      this.dom.previewFooterInfo.textContent = `PDF Document • ${formatBytes(file.SIZE)}`;
    }

    // Task 6.4: HTML5 Audio Player
    renderAudioPreview(file) {
      const container = document.createElement('div');
      container.className = 'audio-stage-container';

      container.innerHTML = `
        <div class="audio-player-card">
          <div class="audio-visualizer-row">
            <div class="audio-disc-badge">
              <span class="material-symbols-outlined">audiotrack</span>
            </div>
            <div class="audio-waveform-bars" id="audioWaveformBars">
              <span class="wave-bar"></span>
              <span class="wave-bar"></span>
              <span class="wave-bar"></span>
              <span class="wave-bar"></span>
              <span class="wave-bar"></span>
              <span class="wave-bar"></span>
              <span class="wave-bar"></span>
            </div>
          </div>

          <div class="audio-meta-block">
            <h4 class="audio-track-title">${escapeHtml(file.NAME)}</h4>
            <span class="audio-track-sub">${formatBytes(file.SIZE)} • ${file.MIME_TYPE || 'Audio'}</span>
          </div>

          <div class="audio-timeline-wrap">
            <span class="audio-time-label" id="audioCurrentTime">0:00</span>
            <div class="audio-scrubber-track">
              <div class="audio-scrubber-fill" id="audioScrubberFill"></div>
              <input type="range" class="audio-scrub-input" id="audioScrubInput" min="0" max="100" value="0" step="0.1" aria-label="Audio scrubber">
            </div>
            <span class="audio-time-label" id="audioTotalDuration">0:00</span>
          </div>

          <div class="audio-controls-row">
            <div class="audio-ctrl-left">
              <button class="btn-audio-pill" id="audioSpeedBtn" title="Playback Speed">1x</button>
            </div>
            <div class="audio-ctrl-center">
              <button class="btn-audio-ctrl" id="audioSkipBackBtn" title="Rewind 10 seconds" aria-label="Rewind 10 seconds">
                <span class="material-symbols-outlined">replay_10</span>
              </button>
              <button class="btn-audio-play" id="audioPlayPauseBtn" title="Play / Pause" aria-label="Play / Pause">
                <span class="material-symbols-outlined" id="audioPlayIcon">play_arrow</span>
              </button>
              <button class="btn-audio-ctrl" id="audioSkipFwdBtn" title="Forward 10 seconds" aria-label="Forward 10 seconds">
                <span class="material-symbols-outlined">forward_10</span>
              </button>
            </div>
            <div class="audio-ctrl-right">
              <button class="btn-audio-ctrl" id="audioMuteBtn" title="Mute/Unmute" aria-label="Mute/Unmute">
                <span class="material-symbols-outlined" id="audioMuteIcon">volume_up</span>
              </button>
              <input type="range" class="audio-volume-slider" id="audioVolumeSlider" min="0" max="1" step="0.05" value="1" title="Volume" aria-label="Volume">
            </div>
          </div>
        </div>
      `;

      this.dom.previewStage.appendChild(container);

      // Create Audio Element
      const audio = new Audio();
      audio.preload = 'metadata';
      audio.src = `/api/v1/files/${file.ID}/stream`;
      this.state.preview.audioElement = audio;

      // Elements
      const waveBars = container.querySelector('#audioWaveformBars');
      const timeCurrent = container.querySelector('#audioCurrentTime');
      const timeDuration = container.querySelector('#audioTotalDuration');
      const scrubberFill = container.querySelector('#audioScrubberFill');
      const scrubInput = container.querySelector('#audioScrubInput');
      const playBtn = container.querySelector('#audioPlayPauseBtn');
      const playIcon = container.querySelector('#audioPlayIcon');
      const skipBackBtn = container.querySelector('#audioSkipBackBtn');
      const skipFwdBtn = container.querySelector('#audioSkipFwdBtn');
      const speedBtn = container.querySelector('#audioSpeedBtn');
      const muteBtn = container.querySelector('#audioMuteBtn');
      const muteIcon = container.querySelector('#audioMuteIcon');
      const volumeSlider = container.querySelector('#audioVolumeSlider');

      const speeds = [1, 1.25, 1.5, 2, 0.75];
      let speedIdx = 0;

      // Audio Event Listeners
      audio.addEventListener('loadedmetadata', () => {
        timeDuration.textContent = formatTime(audio.duration);
        this.dom.previewFooterInfo.textContent = `Audio Stream • RFC 7233 Range • ${formatTime(audio.duration)}`;
      });

      audio.addEventListener('timeupdate', () => {
        if (!audio.duration) return;
        const current = audio.currentTime;
        const total = audio.duration;
        const pct = (current / total);
        timeCurrent.textContent = formatTime(current);
        scrubInput.value = (pct * 100);
        scrubberFill.style.transform = `scaleX(${pct})`;
      });

      audio.addEventListener('play', () => {
        playIcon.textContent = 'pause';
        waveBars.classList.add('playing');
      });

      audio.addEventListener('pause', () => {
        playIcon.textContent = 'play_arrow';
        waveBars.classList.remove('playing');
      });

      audio.addEventListener('ended', () => {
        playIcon.textContent = 'play_arrow';
        waveBars.classList.remove('playing');
        scrubberFill.style.transform = 'scaleX(0)';
        scrubInput.value = 0;
      });

      // Controls Binding
      playBtn.addEventListener('click', () => {
        if (audio.paused) {
          audio.play().catch(e => console.error(e));
        } else {
          audio.pause();
        }
      });

      skipBackBtn.addEventListener('click', () => {
        audio.currentTime = Math.max(0, audio.currentTime - 10);
      });

      skipFwdBtn.addEventListener('click', () => {
        if (audio.duration) {
          audio.currentTime = Math.min(audio.duration, audio.currentTime + 10);
        }
      });

      scrubInput.addEventListener('input', (e) => {
        if (!audio.duration) return;
        const pct = parseFloat(e.target.value) / 100;
        audio.currentTime = pct * audio.duration;
        scrubberFill.style.transform = `scaleX(${pct})`;
        timeCurrent.textContent = formatTime(audio.currentTime);
      });

      speedBtn.addEventListener('click', () => {
        speedIdx = (speedIdx + 1) % speeds.length;
        const spd = speeds[speedIdx];
        audio.playbackRate = spd;
        speedBtn.textContent = `${spd}x`;
      });

      muteBtn.addEventListener('click', () => {
        audio.muted = !audio.muted;
        muteIcon.textContent = audio.muted ? 'volume_off' : (audio.volume < 0.5 ? 'volume_down' : 'volume_up');
      });

      volumeSlider.addEventListener('input', (e) => {
        const val = parseFloat(e.target.value);
        audio.volume = val;
        audio.muted = val === 0;
        muteIcon.textContent = val === 0 ? 'volume_off' : (val < 0.5 ? 'volume_down' : 'volume_up');
      });
    }

    // Task 6.5: HTML5 Video Player Utilizing HTTP 206 Range Streaming
    renderVideoPreview(file) {
      const container = document.createElement('div');
      container.className = 'video-stage-container';

      const wrapper = document.createElement('div');
      wrapper.className = 'video-player-wrapper';

      const video = document.createElement('video');
      video.className = 'preview-video-element';
      video.controls = true;
      video.playsInline = true;
      video.preload = 'metadata';
      video.src = `/api/v1/files/${file.ID}/stream`;

      wrapper.appendChild(video);
      container.appendChild(wrapper);
      this.dom.previewStage.appendChild(container);

      this.state.preview.videoElement = video;

      video.addEventListener('loadedmetadata', () => {
        const resolution = (video.videoWidth && video.videoHeight)
          ? `${video.videoWidth} × ${video.videoHeight} • `
          : '';
        this.dom.previewFooterInfo.textContent = `${resolution}${formatTime(video.duration)} • RFC 7233 Byte-Range Video`;
      });

      video.addEventListener('error', () => {
        container.innerHTML = `
          <div class="unsupported-stage-card">
            <span class="material-symbols-outlined unsupported-icon">videocam_off</span>
            <h4 class="unsupported-title">Video playback failed</h4>
            <p class="unsupported-desc">Your browser could not decode this video format directly.</p>
            <button class="btn-primary" id="btnDownloadBrokenVideo">
              <span class="material-symbols-outlined">download</span>
              <span>Download File</span>
            </button>
          </div>
        `;
        container.querySelector('#btnDownloadBrokenVideo')?.addEventListener('click', () => {
          this.triggerDownload(file.ID);
        });
      });
    }

    // Task 6.6: Text and Code Viewer
    async renderCodePreview(file) {
      this.state.preview.isCodeWrapped = false;
      this.state.preview.currentCodeText = '';

      const container = document.createElement('div');
      container.className = 'code-stage-container';

      // Loader while fetching stream
      container.innerHTML = `
        <div class="preview-loader" style="margin: auto;">
          <div class="preview-spinner"></div>
          <span>Loading text stream...</span>
        </div>
      `;
      this.dom.previewStage.appendChild(container);

      try {
        const response = await fetch(`/api/v1/files/${file.ID}/stream`);
        if (!response.ok) {
          throw new Error(`HTTP Error ${response.status}`);
        }
        const text = await response.text();
        this.state.preview.currentCodeText = text;

        const lines = text.split('\n');
        const lineCount = lines.length;
        const lineNumbersHtml = Array.from({ length: lineCount }, (_, i) => i + 1).join('\n');

        container.innerHTML = `
          <div class="code-line-numbers" id="codeLineNumbers">${lineNumbersHtml}</div>
          <div class="code-body-wrapper" id="codeBodyWrapper">
            <pre class="code-pre" id="codePre"><code class="code-code" id="codeCode"></code></pre>
          </div>
        `;

        const codeCode = container.querySelector('#codeCode');
        codeCode.textContent = text; // Safe text injection prevents XSS

        // Synchronize scroll between code numbers and code body
        const codeWrapper = container.querySelector('#codeBodyWrapper');
        const codeGutter = container.querySelector('#codeLineNumbers');
        codeWrapper.addEventListener('scroll', () => {
          codeGutter.scrollTop = codeWrapper.scrollTop;
        });

        const charCount = text.length;
        this.dom.previewFooterInfo.textContent = `${lineCount} lines • ${charCount.toLocaleString()} chars • UTF-8 • ${formatBytes(file.SIZE)}`;
      } catch (err) {
        container.innerHTML = `
          <div class="unsupported-stage-card" style="margin: auto;">
            <span class="material-symbols-outlined unsupported-icon">error_outline</span>
            <h4 class="unsupported-title">Failed to load text</h4>
            <p class="unsupported-desc">${escapeHtml(err.message || 'Could not fetch file content')}</p>
          </div>
        `;
      }
    }

    toggleCodeWrap() {
      const codePre = document.getElementById('codePre');
      if (!codePre) return;
      this.state.preview.isCodeWrapped = !this.state.preview.isCodeWrapped;
      codePre.classList.toggle('code-wrapped', this.state.preview.isCodeWrapped);
      if (this.dom.btnToggleWrap) {
        this.dom.btnToggleWrap.classList.toggle('active', this.state.preview.isCodeWrapped);
      }
    }

    async copyCodeToClipboard() {
      const text = this.state.preview.currentCodeText;
      if (!text) return;

      try {
        await navigator.clipboard.writeText(text);
        if (this.dom.copyCodeIcon) this.dom.copyCodeIcon.textContent = 'check';
        if (this.dom.copyCodeLabel) this.dom.copyCodeLabel.textContent = 'Copied!';
        setTimeout(() => {
          if (this.dom.copyCodeIcon) this.dom.copyCodeIcon.textContent = 'content_copy';
          if (this.dom.copyCodeLabel) this.dom.copyCodeLabel.textContent = 'Copy';
        }, 2000);
      } catch (err) {
        this.showToast('Could not copy to clipboard', 'error');
      }
    }

    renderUnsupportedPreview(file) {
      const card = document.createElement('div');
      card.className = 'unsupported-stage-card';

      const { icon } = getFileIconAndColor(file.MIME_TYPE, file.EXTENSION);

      card.innerHTML = `
        <span class="material-symbols-outlined unsupported-icon">${icon}</span>
        <h4 class="unsupported-title">No preview available</h4>
        <p class="unsupported-desc">This file type (${escapeHtml(file.EXTENSION ? file.EXTENSION.toUpperCase() : 'binary')}) cannot be previewed in the browser. You can download it directly.</p>
        <button class="btn-primary" id="btnUnsupportedDownload">
          <span class="material-symbols-outlined">download</span>
          <span>Download ${escapeHtml(file.NAME)}</span>
        </button>
      `;

      card.querySelector('#btnUnsupportedDownload')?.addEventListener('click', () => {
        this.triggerDownload(file.ID);
      });

      this.dom.previewStage.appendChild(card);
      this.dom.previewFooterInfo.textContent = `${file.EXTENSION ? file.EXTENSION.toUpperCase() : 'Binary'} • ${formatBytes(file.SIZE)}`;
    }
  }

  // Add subtle spin animation rule dynamically
  const styleEl = document.createElement('style');
  styleEl.textContent = `
    @keyframes spin {
      100% { transform: rotate(360deg); }
    }
    .spin-animation {
      animation: spin 0.8s linear infinite;
    }
  `;
  document.head.appendChild(styleEl);

  // Initialize Altus Single Page Application
  const app = new AltusApp();
  window.Altus = app;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => app.init());
  } else {
    app.init();
  }

})();
