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

        if (response.status === 401) {
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

    // Folders Endpoints
    static getFolders(parentId = 0) {
      return this.request(`/api/v1/folders?parent_id=${encodeURIComponent(parentId)}`, { method: 'GET' });
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

    // Files Endpoints
    static getFiles(folderId = 0, sort = 'name_asc', search = '') {
      let url = `/api/v1/files?folder_id=${encodeURIComponent(folderId)}&sort=${encodeURIComponent(sort)}`;
      if (search && search.trim()) {
        url += `&search=${encodeURIComponent(search.trim())}`;
      }
      return this.request(url, { method: 'GET' });
    }

    static updateFile(id, data) {
      return this.request(`/api/v1/files/${encodeURIComponent(id)}`, {
        method: 'PUT',
        body: JSON.stringify(data)
      });
    }

    static deleteFile(id) {
      return this.request(`/api/v1/files/${encodeURIComponent(id)}`, { method: 'DELETE' });
    }

    // Disk-to-DB Quick Sync
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
        viewMode: localStorage.getItem('altus_view_mode') || 'grid',
        sort: localStorage.getItem('altus_sort') || 'name_asc',
        searchQuery: '',
        activeNav: 'root',
        isLoading: false,
        isSyncing: false,
        activeContextItem: null, // { type: 'folder' | 'file', data: ... }
        pending2FAUserId: null
      };

      this.dom = {};
      this.searchDebounceTimer = null;
    }

    init() {
      this.cacheDOM();
      this.bindEvents();
      this.applyViewMode(this.state.viewMode);
      this.dom.sortSelect.value = this.state.sort;

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
      this.dom.badgeTotalItems = document.getElementById('badgeTotalItems');
      this.dom.quotaValueText = document.getElementById('quotaValueText');
      this.dom.quotaProgressFill = document.getElementById('quotaProgressFill');

      // User card
      this.dom.userAvatar = document.getElementById('userAvatar');
      this.dom.userNameLabel = document.getElementById('userNameLabel');
      this.dom.userEmailLabel = document.getElementById('userEmailLabel');
      this.dom.btnLogout = document.getElementById('btnLogout');
      this.dom.btnOpenSettings = document.getElementById('btnOpenSettings');

      // Context Menus
      this.dom.folderContextMenu = document.getElementById('folderContextMenu');
      this.dom.ctxFolderOpen = document.getElementById('ctxFolderOpen');
      this.dom.ctxFolderRename = document.getElementById('ctxFolderRename');
      this.dom.ctxFolderColorRow = document.getElementById('ctxFolderColorRow');
      this.dom.ctxFolderDelete = document.getElementById('ctxFolderDelete');

      this.dom.fileContextMenu = document.getElementById('fileContextMenu');
      this.dom.ctxFileDownload = document.getElementById('ctxFileDownload');
      this.dom.ctxFileRename = document.getElementById('ctxFileRename');
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

      // Auth Overlay
      this.dom.authOverlay = document.getElementById('authOverlay');
      this.dom.authLoginForm = document.getElementById('authLoginForm');
      this.dom.authUsernameInput = document.getElementById('authUsernameInput');
      this.dom.authPasswordInput = document.getElementById('authPasswordInput');
      this.dom.totpGroup = document.getElementById('totpGroup');
      this.dom.authTotpInput = document.getElementById('authTotpInput');
      this.dom.authSubmitBtn = document.getElementById('authSubmitBtn');

      this.dom.toastContainer = document.getElementById('toastContainer');
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

      // Quick Sync Triggers
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

      this.dom.emptyStateActionBtn?.addEventListener('click', () => {
        this.openNewFolderModal();
      });

      // Navigation Items
      this.dom.navMyCloud?.addEventListener('click', () => {
        this.navigateToFolder(0);
        this.toggleMobileSidebar(false);
      });

      // User Logout
      this.dom.btnLogout?.addEventListener('click', () => this.logout());

      // Modal Closers
      document.querySelectorAll('[data-close-modal]').forEach(btn => {
        btn.addEventListener('click', () => this.closeAllModals());
      });

      // Forms
      this.dom.newFolderForm?.addEventListener('submit', (e) => this.handleNewFolderSubmit(e));
      this.dom.renameForm?.addEventListener('submit', (e) => this.handleRenameSubmit(e));
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

      this.dom.ctxFileDelete?.addEventListener('click', () => {
        if (this.state.activeContextItem?.data) {
          this.openDeleteModal('file', this.state.activeContextItem.data);
        }
        this.closeAllDropdowns();
      });

      // Global window click to dismiss menus
      window.addEventListener('click', () => {
        this.closeAllDropdowns();
      });

      // Global keyboard shortcuts
      window.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
          this.closeAllDropdowns();
          this.closeAllModals();
        } else if (e.key === '/' && document.activeElement !== this.dom.headerSearchInput) {
          e.preventDefault();
          this.dom.headerSearchInput?.focus();
        }
      });

      // Browser History
      window.addEventListener('popstate', () => {
        this.handleRouteFromHash();
      });
    }

    // =======================================================================
    // 4. Routing & History Navigation
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

    async navigateToFolder(folderId = 0, updateHash = true) {
      this.state.currentFolderId = folderId;

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
        const [foldersRes, filesRes] = await Promise.all([
          AltusAPI.getFolders(this.state.currentFolderId),
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
    // 5. Folder Card Rendering (Task 4.5)
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

        card.innerHTML = `
          <div class="folder-color-ribbon" style="background-color: ${escapeHtml(folderColor)};"></div>
          <div class="folder-card-main">
            <span class="material-symbols-outlined folder-icon" style="color: ${escapeHtml(folderColor)};">folder</span>
            <div class="folder-details">
              <span class="folder-name" title="${escapeHtml(folder.NAME)}">${escapeHtml(folder.NAME)}</span>
              <span class="folder-meta">Folder</span>
            </div>
          </div>
          <button class="folder-menu-btn" aria-label="Folder actions" title="More options">
            <span class="material-symbols-outlined icon-md">more_vert</span>
          </button>
        `;

        // Click on main area navigates into folder
        card.querySelector('.folder-card-main').addEventListener('click', (e) => {
          e.stopPropagation();
          this.navigateToFolder(folder.ID);
        });

        // Keyboard navigation
        card.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            this.navigateToFolder(folder.ID);
          }
        });

        // Context menu button
        const menuBtn = card.querySelector('.folder-menu-btn');
        menuBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          this.openContextMenu('folder', folder, e);
        });

        grid.appendChild(card);
      });
    }

    // =======================================================================
    // 6. File Grid & List View Renderers (Task 4.6)
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

      files.forEach(file => {
        const card = document.createElement('div');
        card.className = 'file-card';
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

        card.innerHTML = `
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

        // Click / Double click handlers
        card.addEventListener('click', (e) => {
          if (!e.target.closest('.file-menu-btn')) {
            // Future media preview or selection
          }
        });

        card.addEventListener('dblclick', () => {
          this.triggerDownload(file.ID);
        });

        // Context Menu
        const menuBtn = card.querySelector('.file-menu-btn');
        menuBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          this.openContextMenu('file', file, e);
        });

        grid.appendChild(card);
      });

      container.appendChild(grid);
    }

    renderFilesListView(files, container) {
      container.innerHTML = '';
      const table = document.createElement('table');
      table.className = 'files-list-table';

      table.innerHTML = `
        <thead>
          <tr>
            <th class="sortable" data-sort="name">Name</th>
            <th class="sortable" data-sort="mtime">Date Modified</th>
            <th>Type</th>
            <th class="sortable" data-sort="size">Size</th>
            <th style="width: 48px; text-align: right;"></th>
          </tr>
        </thead>
        <tbody></tbody>
      `;

      const tbody = table.querySelector('tbody');

      files.forEach(file => {
        const row = document.createElement('tr');
        row.setAttribute('data-file-id', file.ID);

        const { icon, color, typeLabel } = getFileIconAndColor(file.MIME_TYPE, file.EXTENSION);

        row.innerHTML = `
          <td>
            <div class="table-file-name-cell">
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

        row.addEventListener('dblclick', () => {
          this.triggerDownload(file.ID);
        });

        const menuBtn = row.querySelector('.file-menu-btn');
        menuBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          this.openContextMenu('file', file, e);
        });

        tbody.appendChild(row);
      });

      container.appendChild(table);
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
    // 7. Filtering & Sorting
    // =======================================================================

    getFilteredFolders() {
      if (!this.state.folders) return [];
      const query = this.state.searchQuery.toLowerCase().trim();
      if (!query) return this.state.folders;
      return this.state.folders.filter(f => f.NAME.toLowerCase().includes(query));
    }

    getFilteredFiles() {
      if (!this.state.files) return [];
      const query = this.state.searchQuery.toLowerCase().trim();
      if (!query) return this.state.files;
      return this.state.files.filter(f => f.NAME.toLowerCase().includes(query));
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
      localStorage.setItem('altus_sort', sortValue);
      this.fetchCurrentFolder();
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
        // Subtle decorative representation capped at realistic visual scale
        const scale = Math.min(Math.max(totalBytes / (500 * 1024 * 1024), 0.02), 1.0);
        this.dom.quotaProgressFill.style.transform = `scaleX(${scale})`;
      }
    }

    // =======================================================================
    // 8. Operations & Actions
    // =======================================================================

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

    openNewFolderModal() {
      this.dom.newFolderNameInput.value = '';
      this.dom.newFolderModal.classList.add('visible');
      setTimeout(() => this.dom.newFolderNameInput.focus(), 50);
    }

    async handleNewFolderSubmit(e) {
      e.preventDefault();
      const name = this.dom.newFolderNameInput.value.trim();
      if (!name) return;

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

    openRenameModal(type, item) {
      this.state.activeContextItem = { type, data: item };
      this.dom.renameInput.value = item.NAME || '';
      this.dom.renameModal.classList.add('visible');
      setTimeout(() => this.dom.renameInput.focus(), 50);
    }

    async handleRenameSubmit(e) {
      e.preventDefault();
      const newName = this.dom.renameInput.value.trim();
      const item = this.state.activeContextItem?.data;
      const type = this.state.activeContextItem?.type;

      if (!newName || !item) return;

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

    openDeleteModal(type, item) {
      this.state.activeContextItem = { type, data: item };
      this.dom.deleteMessage.textContent = `Are you sure you want to delete "${item.NAME}"? This will permanently delete it from disk and database.`;
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

    triggerDownload(fileId) {
      window.location.href = `/api/v1/files/${fileId}/download`;
    }

    // =======================================================================
    // 9. Context Menus & UI Helpers
    // =======================================================================

    openContextMenu(type, item, event) {
      this.closeAllDropdowns();
      this.state.activeContextItem = { type, data: item };

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
    // 10. Authentication Flow
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
      window.location.reload();
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
    // 11. Toast Notifications
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
  document.addEventListener('DOMContentLoaded', () => app.init());
  window.Altus = app;

})();
