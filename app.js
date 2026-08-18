// ContributionTracker Pro - Main Application Logic
// Handles UI interactions and business logic

const App = {
    currentFund: null,
    currentPanel: 'dashboard',
    analyticsDateRange: {
        type: 'allTime',
        startDate: null,
        endDate: null,
        label: 'All Time'
    },

    // Sync state management
    _syncDebounceTimer: null,
    _syncStatusChipTimer: null,
    _syncStatus: 'synced',  // 'pending', 'syncing', 'synced', 'error'

    // Database reference (defaults to legacy DB, overridden by FirestoreDB when available)
    _db: null,

    // Real-time listener management
    _activeListeners: [],

    // Data cache (preloaded for fast panel switching - ApartmentApp pattern)
    _cachedFunds: null,
    _cachedGroups: null,
    _cachedPayments: null,
    _cachedExpenses: null,
    _dataLoaded: false,

    /**
     * Get the active database instance (Firestore or fallback to IndexedDB)
     */
    getDB() {
        // Prefer FirestoreDB if available
        if (window.FirestoreDB) {
            return window.FirestoreDB;
        }
        // Fallback to legacy IndexedDB
        if (typeof DB !== 'undefined') {
            return DB;
        }
        throw new Error('No database available');
    },

    /**
     * Check if Firebase/Firestore is available and supports real-time listeners
     */
    isFirestoreAvailable() {
        return window.FirestoreDB && typeof window.FirestoreDB.onCollectionChanged === 'function';
    },

    /**
     * Clean up all active real-time listeners
     */
    cleanupListeners() {
        if (this._activeListeners.length > 0) {
            console.log(`🧹 Cleaning up ${this._activeListeners.length} active listeners`);
            this._activeListeners.forEach(unsubscribe => {
                if (typeof unsubscribe === 'function') {
                    unsubscribe();
                }
            });
            this._activeListeners = [];
        }
    },

    /**
     * Add a listener to the active listeners list
     */
    addListener(unsubscribe) {
        if (typeof unsubscribe === 'function') {
            this._activeListeners.push(unsubscribe);
        }
    },

    /**
     * Set up real-time listener for funds with automatic enrichment
     * Uses adapter's onFundsChanged to ensure funds have calculated totals
     */
    setupFundsListener(callback) {
        if (!this.isFirestoreAvailable()) {
            console.log('⚠️ Firestore not available, skipping real-time listeners');
            return null;
        }

        console.log('👂 Setting up real-time listener for funds (with enrichment)');
        const unsubscribe = this.getDB().onFundsChanged((enrichedFunds) => {
            console.log('🔄 Funds updated in real-time:', enrichedFunds.length, '(enriched with totals)');
            callback(enrichedFunds);
        });

        if (unsubscribe) {
            this.addListener(unsubscribe);
        }
        return unsubscribe;
    },

    /**
     * Set up real-time listener for groups (all groups or filtered by fundId)
     * @param {string|function} fundIdOrCallback - fundId for filtering, or callback for all groups
     * @param {function} callback - callback function (only if fundId provided)
     */
    setupGroupsListener(fundIdOrCallback, callback) {
        if (!this.isFirestoreAvailable()) return null;

        // Handle both signatures: (callback) for all, (fundId, callback) for filtered
        const isFiltered = typeof fundIdOrCallback === 'string';
        const fundId = isFiltered ? fundIdOrCallback : null;
        const cb = isFiltered ? callback : fundIdOrCallback;

        console.log('👂 Setting up real-time listener for groups', fundId ? `in fund: ${fundId}` : '(all) (enriched with totals)');

        // Use enriched listener for ALL groups (not filtered by fund)
        if (!fundId) {
            const unsubscribe = this.getDB().onGroupsChanged((enrichedGroups) => {
                console.log('🔄 Groups updated in real-time:', enrichedGroups.length, '(enriched with totalPaid/totalPledged)');
                cb(enrichedGroups);
            });

            if (unsubscribe) {
                this.addListener(unsubscribe);
            }
            return unsubscribe;
        }

        // For filtered by fund, use raw listener (less common case)
        const unsubscribe = this.getDB().onCollectionChanged('groups', (groups) => {
            console.log('🔄 Groups updated in real-time (filtered by fund):', groups.length);
            cb(groups);
        }, { fundId });

        if (unsubscribe) {
            this.addListener(unsubscribe);
        }
        return unsubscribe;
    },

    /**
     * Set up real-time listener for payments (all payments or filtered by fundId)
     * @param {string|function} fundIdOrCallback - fundId for filtering, or callback for all payments
     * @param {function} callback - callback function (only if fundId provided)
     */
    setupPaymentsListener(fundIdOrCallback, callback) {
        if (!this.isFirestoreAvailable()) return null;

        // Handle both signatures: (callback) for all, (fundId, callback) for filtered
        const isFiltered = typeof fundIdOrCallback === 'string';
        const fundId = isFiltered ? fundIdOrCallback : null;
        const cb = isFiltered ? callback : fundIdOrCallback;

        console.log('👂 Setting up real-time listener for payments', fundId ? `in fund: ${fundId}` : '(all)');
        const unsubscribe = this.getDB().onCollectionChanged('payments', (payments) => {
            console.log('🔄 Payments updated in real-time:', payments.length);
            cb(payments);
        }, fundId ? { fundId } : {});

        if (unsubscribe) {
            this.addListener(unsubscribe);
        }
        return unsubscribe;
    },

    /**
     * Set up real-time listener for expenses
     */
    setupExpensesListener(callback) {
        if (!this.isFirestoreAvailable()) return null;

        console.log('👂 Setting up real-time listener for expenses');
        const unsubscribe = this.getDB().onCollectionChanged('expenses', (expenses) => {
            console.log('🔄 Expenses updated in real-time:', expenses.length);
            callback(expenses);
        });

        if (unsubscribe) {
            this.addListener(unsubscribe);
        }
        return unsubscribe;
    },

    /**
     * Initialize the application
     */
    async init() {
        console.log('🚀 Initializing ContributionTracker Pro...');

        // IMPORTANT: Ensure Firebase is ready before proceeding
        // This prevents race conditions with db-manager.js
        if (!window.FirestoreDB) {
            console.log('⏳ Waiting for Firebase initialization...');
            // Firebase will be ready when app-init.js dispatches 'appReady' event
            // If we're here without FirestoreDB, we're in offline mode
            console.warn('⚠️ Firebase not available - app may have limited functionality');
        }

        // Load settings and apply
        await this.loadSettings();

        // Set up event listeners
        this.setupEventListeners();

        // NOTE: App is still hidden at this point (app-init.js keeps it hidden)
        // We load data in the background, then show app with data already rendered

        try {
            // IMPORTANT: Load ALL data upfront for fast panel switching (ApartmentApp pattern)
            await this.loadInitialData();

            // Render dashboard from cache (instant since data is preloaded)
            this.renderDashboardFromCache();

            // NOW show the app with data already loaded (instant experience!)
            const appContainer = document.getElementById('appContainer');
            if (appContainer) {
                appContainer.style.display = 'block';
            }

            const mainApp = document.getElementById('mainApp') || document.querySelector('.dashboard');
            if (mainApp) {
                mainApp.classList.remove('hidden');
                mainApp.style.display = 'block';
            }

            console.log('✅ App visible with data loaded');

        } catch (error) {
            console.error('❌ Error during app initialization:', error);
            Toast.error('Failed to initialize app. Some features may not work.');
        }

        // Register service worker (Electron uses file:// protocol, so this will be skipped automatically)
        if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
            this.registerServiceWorker();
        }

        console.log('✅ App initialized successfully');
    },

    /**
     * Load all data upfront for fast panel switching (ApartmentApp pattern)
     * This eliminates per-panel loading delays
     */
    async loadInitialData() {
        if (this._dataLoaded) {
            console.log('✅ Data already loaded');
            return;
        }

        console.log('📦 Loading all data upfront...');

        try {
            // Load ALL data in parallel (single Firebase round-trip)
            const [funds, payments, expenses, groups] = await Promise.all([
                this.getDB().getAllFunds(),
                this.getDB().getAllPayments(),
                this.getDB().getExpenses(),
                this.getDB().getAllGroups()
            ]);

            // Cache in memory for instant panel switching
            this._cachedFunds = funds;
            this._cachedPayments = payments;
            this._cachedExpenses = expenses;
            this._cachedGroups = groups;
            this._dataLoaded = true;

            console.log(`✅ Data cached: ${funds.length} funds, ${payments.length} payments, ${expenses.length} expenses, ${groups.length} groups`);

            // Set up real-time listeners to keep cache fresh
            this.setupCacheListeners();

        } catch (error) {
            console.error('❌ Error loading initial data:', error);
            // Don't throw - allow app to work with empty cache
            this._dataLoaded = false;
        }
    },

    /**
     * Set up real-time listeners to keep data cache synchronized
     */
    setupCacheListeners() {
        // Update funds cache and refresh if on funds panel
        this.setupFundsListener((funds) => {
            this._cachedFunds = funds;
            if (this.currentPanel === 'funds') {
                this.renderFundsFromCache();
            }
            // Also refresh dashboard if active
            if (this.currentPanel === 'dashboard') {
                this.renderDashboardFromCache();
            }
            // Also refresh analytics if active (analytics shows fund data)
            if (this.currentPanel === 'reports') {
                this.renderAnalyticsFromCache();
            }
        });

        // Update payments cache and refresh if on payments panel
        this.setupPaymentsListener((payments) => {
            this._cachedPayments = payments;
            if (this.currentPanel === 'payments') {
                this.renderPaymentsFromCache();
            }
            // Also refresh dashboard if active (dashboard shows payment stats)
            if (this.currentPanel === 'dashboard') {
                this.renderDashboardFromCache();
            }
            // Also refresh analytics if active (analytics shows payment data)
            if (this.currentPanel === 'reports') {
                this.renderAnalyticsFromCache();
            }
        });

        // Update groups cache (groups affect payments display, so refresh payments panel)
        this.setupGroupsListener((groups) => {
            this._cachedGroups = groups;
            if (this.currentPanel === 'payments') {
                this.renderPaymentsFromCache();
            }
            // Also refresh analytics if active (analytics shows group data)
            if (this.currentPanel === 'reports') {
                this.renderAnalyticsFromCache();
            }
        });

        // Update expenses cache and refresh if on expenses panel
        this.setupExpensesListener((expenses) => {
            this._cachedExpenses = expenses;
            if (this.currentPanel === 'expenses') {
                this.renderExpensesFromCache();
            }
            // Also refresh dashboard if active
            if (this.currentPanel === 'dashboard') {
                this.renderDashboardFromCache();
            }
            // Also refresh analytics if active (analytics shows expense data)
            if (this.currentPanel === 'reports') {
                this.renderAnalyticsFromCache();
            }
        });

        console.log('✅ Cache sync listeners active (including analytics auto-refresh)');
    },

    /**
     * Load and apply settings
     */
    async loadSettings() {
        const settings = await this.getDB().getSettings();

        // Apply app name
        document.getElementById('appName').textContent = settings.appName;
        document.getElementById('settingAppName').value = settings.appName;

        // Apply theme
        Theme.apply(settings.theme);

        // DEPRECATED: Local credential management is disabled - now using Firebase Auth
        // await this.loadCurrentCredentials();

        // Load and apply saved backend settings
        if (settings.googleAppsScriptUrl && settings.googleSpreadsheetId) {
            const urlInput = document.getElementById('googleAppsScriptUrl');
            const idInput = document.getElementById('googleSpreadsheetId');

            if (urlInput) urlInput.value = settings.googleAppsScriptUrl;
            if (idInput) idInput.value = settings.googleSpreadsheetId;

            // Initialize ApiService with saved credentials
            if (window.ApiService) {
                window.ApiService.init(settings.googleAppsScriptUrl, settings.googleSpreadsheetId);

                // Update connection status
                const statusDiv = document.getElementById('connectionStatus');
                if (statusDiv) {
                    statusDiv.style.display = 'flex';
                    statusDiv.innerHTML = '<span class="status-icon">✅</span><span class="status-text">Connected to Google Sheets</span>';
                }

                console.log('✅ Backend credentials loaded from settings');
            }
        }
    },

    /**
     * DEPRECATED: Load and display current credentials
     * Firebase Auth now handles authentication - this local user management is disabled
     */
    /* async loadCurrentCredentials() {
        try {
            const users = await this.getDB().getAll('users');
            if (users && users.length > 0) {
                const admin = users[0]; // Get first (default admin) user
                document.getElementById('currentUsername').textContent = admin.username;
                // Store password for toggle functionality
                this.currentUserPassword = admin.password;
                this.currentUserId = admin.id;
            }
        } catch (error) {
            console.error('Error loading credentials:', error);
            document.getElementById('currentUsername').textContent = 'Error loading';
        }
    }, */

    /**
     * DEPRECATED: Toggle current password visibility
     * Firebase Auth now handles authentication - this local user management is disabled
     */
    /* toggleCurrentPasswordVisibility() {
        const passwordSpan = document.getElementById('currentPassword');
        const btn = document.getElementById('showCurrentPasswordBtn');

        if (passwordSpan.textContent === '••••••••') {
            passwordSpan.textContent = this.currentUserPassword || '••••••••';
            btn.textContent = '🙈';
        } else {
            passwordSpan.textContent = '••••••••';
            btn.textContent = '👁️';
        }
    }, */

    /**
     * DEPRECATED: Update credentials
     * Firebase Auth now handles authentication - this local user management is disabled
     * Use Firebase Auth methods (updateEmail, updatePassword) instead
     */
    /* async updateCredentials() {
        try {
            const newUsername = document.getElementById('adminUsername').value.trim();
            const newPassword = document.getElementById('adminPassword').value.trim();

            // Validation
            if (!newUsername && !newPassword) {
                Toast.warning('Please enter a new username or password');
                return;
            }

            if (newPassword && newPassword.length < 6) {
                Toast.error('Password must be at least 6 characters');
                return;
            }

            Loading.show();

            // Get current user
            const users = await this.getDB().getAll('users');
            if (!users || users.length === 0) {
                Toast.error('No user found');
                return;
            }

            const currentUser = users[0];
            const updatedUser = {
                ...currentUser,
                username: newUsername || currentUser.username,
                password: newPassword || currentUser.password,
                updatedAt: Date.now()
            };

            // Update in database
            await this.getDB().updateUserCredentials(updatedUser);

            // Update display
            this.currentUserPassword = updatedUser.password;
            document.getElementById('currentUsername').textContent = updatedUser.username;
            document.getElementById('currentPassword').textContent = '••••••••';

            // Clear form
            document.getElementById('adminUsername').value = '';
            document.getElementById('adminPassword').value = '';

            Toast.success('Credentials updated successfully!');
        } catch (error) {
            console.error('Error updating credentials:', error);
            Toast.error('Failed to update credentials');
        } finally {
            Loading.hide();
        }
    }, */

    /**
     * Set up all event listeners
     */
    setupEventListeners() {
        // Online/Offline status monitoring
        window.addEventListener('online', () => {
            this.handleOnline();
        });

        window.addEventListener('offline', () => {
            this.handleOffline();
        });

        // Initialize sync status on load
        this.updateSyncStatus();

        // Navigation
        document.querySelectorAll('.nav-item').forEach(item => {
            item.addEventListener('click', (e) => {
                e.preventDefault();
                const section = item.dataset.section;
                this.showPanel(section);
            });
        });

        // Menu toggle for mobile
        document.getElementById('menuToggle').addEventListener('click', () => {
            document.getElementById('sidebar').classList.toggle('open');
        });

        // Theme toggle
        document.getElementById('lightThemeBtn').addEventListener('click', () => {
            Theme.apply('light');
            this.saveTheme('light');
        });

        document.getElementById('darkThemeBtn').addEventListener('click', () => {
            Theme.apply('dark');
            this.saveTheme('dark');
        });

        // Fund buttons
        document.getElementById('btnNewFund').addEventListener('click', () => this.showNewFundModal());
        document.getElementById('btnNewFundFromFunds').addEventListener('click', () => this.showNewFundModal());
        document.getElementById('btnDeleteFund').addEventListener('click', () => this.showDeleteFundModal());

        // Fund detail buttons
        document.getElementById('btnBackToFunds').addEventListener('click', () => this.showPanel('funds'));
        document.getElementById('btnAddGroup').addEventListener('click', () => this.showAddGroupModal());
        document.getElementById('btnDeleteGroup').addEventListener('click', () => this.showDeleteGroupModal());
        document.getElementById('btnAddPayment').addEventListener('click', () => this.showAddPaymentModal());
        document.getElementById('btnAddPledge').addEventListener('click', () => this.showAddPledgeModal());
        document.getElementById('btnSwitchFundType').addEventListener('click', () => this.switchFundType());
        document.getElementById('btnExportFund').addEventListener('click', () => this.exportFund());

        // Sort groups - Filter pill buttons
        document.querySelectorAll('#sortGroupsFilters .filter-pill').forEach(pill => {
            pill.addEventListener('click', (e) => {
                // Remove active class from all pills
                document.querySelectorAll('#sortGroupsFilters .filter-pill').forEach(p => {
                    p.classList.remove('active');
                });
                // Add active class to clicked pill
                e.currentTarget.classList.add('active');
                // Sort groups
                this.sortGroups(e.currentTarget.dataset.sort);
            });
        });

        // Settings
        document.getElementById('btnSaveAppName').addEventListener('click', () => this.saveAppName());

        // Data Management
        document.getElementById('btnExportAllData').addEventListener('click', () => this.exportAllData());
        document.getElementById('btnImportData').addEventListener('click', () => this.showImportDataModal());
        document.getElementById('btnRestoreBackup').addEventListener('click', () => this.showRestoreBackupModal());
        document.getElementById('btnClearData').addEventListener('click', () => this.clearAllData());

        // Security & Access - DISABLED: Now using Firebase Auth
        // document.getElementById('btnUpdateCredentials').addEventListener('click', () => this.updateCredentials());

        // Expenses
        document.getElementById('btnAddExpense').addEventListener('click', () => this.showAddExpenseModal());
        document.getElementById('btnExportExpenses').addEventListener('click', () => this.exportExpenses());

        // Payments Export
        document.getElementById('btnExportPayments').addEventListener('click', () => this.showPaymentsExportModal());

        // Search
        document.getElementById('searchFunds').addEventListener('input', Utils.debounce((e) => {
            this.searchFunds(e.target.value);
        }));

        document.getElementById('searchPayments').addEventListener('input', Utils.debounce((e) => {
            this.searchPayments(e.target.value);
        }));

        // Analytics panel buttons
        document.getElementById('btnRefreshAnalytics').addEventListener('click', () => this.refreshAnalytics());
        document.getElementById('btnAnalyticsDateRange').addEventListener('click', () => this.showAnalyticsDateFilter());
        document.getElementById('btnExportAnalytics').addEventListener('click', () => this.exportAnalyticsDirectly());
    },

    /**
     * Show a specific panel
     */
    showPanel(panelName) {
        // Clean up any active listeners before switching panels
        this.cleanupListeners();

        // Hide all panels
        document.querySelectorAll('.panel').forEach(panel => {
            panel.classList.add('hidden');
        });

        // Remove active from all nav items
        document.querySelectorAll('.nav-item').forEach(item => {
            item.classList.remove('active');
        });

        // Show selected panel
        const panel = document.getElementById(`${panelName}Panel`);
        if (panel) {
            panel.classList.remove('hidden');
            this.currentPanel = panelName;
        }

        // Add active to nav item
        const navItem = document.querySelector(`[data-section="${panelName}"]`);
        if (navItem) {
            navItem.classList.add('active');
        }

        // Load panel data (using cache for instant rendering - ApartmentApp pattern)
        switch (panelName) {
            case 'dashboard':
                this.renderDashboardFromCache(); // Instant render from cache
                break;
            case 'funds':
                this.renderFundsFromCache(); // Instant render from cache
                break;
            case 'payments':
                this.renderPaymentsFromCache(); // Instant render from cache
                break;
            case 'expenses':
                this.renderExpensesFromCache(); // Instant render from cache
                break;
            case 'reports':
                this.renderAnalyticsFromCache(); // Instant render from cache
                break;
            case 'calculator':
                this.showCalculatorPanel();
                break;
            case 'settings':
                this.loadSettings();
                break;
        }

        // Close mobile menu
        document.getElementById('sidebar').classList.remove('open');
    },

    /**
     * Render dashboard from cached data (instant - no async fetch)
     */
    renderDashboardFromCache() {
        if (!this._dataLoaded) {
            // Fallback to async load if cache not ready
            this.loadDashboard();
            return;
        }

        try {
            // Calculate stats from cached data (instant!)
            const stats = this.calculateDashboardStatsFromCache();

            // Update UI instantly
            this.updateDashboardStats(stats);
            this.renderRecentFunds(stats.recentFunds);
            this.updateExpensesThisMonthFromCache();

        } catch (error) {
            console.error('Error rendering dashboard:', error);
            Toast.error('Failed to render dashboard');
        }
    },

    /**
     * Calculate dashboard stats from cached data (no async!)
     */
    calculateDashboardStatsFromCache() {
        const funds = this._cachedFunds || [];
        const payments = this._cachedPayments || [];
        const expenses = this._cachedExpenses || [];

        let totalFunds = funds.length;
        let totalCollected = 0;
        let totalPledged = 0;
        let totalAllocated = 0;
        let totalExpenses = 0;
        let totalPayments = 0;

        // Calculate from payments
        payments.forEach(payment => {
            const amount = parseFloat(payment.amount) || 0;
            if (payment.isPledge) {
                totalPledged += amount;
            } else {
                totalCollected += amount;
                totalPayments++;
            }
        });

        // Calculate allocated from funds
        funds.forEach(fund => {
            totalAllocated += fund.totalGoal || 0;
        });

        // Calculate expenses
        expenses.forEach(expense => {
            totalExpenses += parseFloat(expense.amount) || 0;
        });

        // Get recent funds (sorted by createdAt)
        const recentFunds = [...funds]
            .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
            .slice(0, 5);

        return {
            totalFunds,
            totalCollected,
            totalPledged,
            totalAllocated,
            totalExpenses,
            totalPayments,
            balance: totalCollected - totalExpenses,
            recentFunds
        };
    },

    /**
     * Update expenses this month from cache (no async!)
     */
    updateExpensesThisMonthFromCache() {
        const now = new Date();
        const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
        const lastDayOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59).getTime();

        const expenses = this._cachedExpenses || [];
        const monthlyTotal = expenses
            .filter(e => {
                const expenseDate = e.date || e.createdAt;
                return expenseDate >= firstDayOfMonth && expenseDate <= lastDayOfMonth;
            })
            .reduce((sum, e) => sum + (parseFloat(e.amount) || 0), 0);

        const monthName = now.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
        const expensesElement = document.getElementById('expensesThisMonth');
        if (expensesElement) {
            expensesElement.innerHTML = `
                <h3>${Utils.formatCurrency(monthlyTotal)}</h3>
                <p>Expenses in ${monthName}</p>
            `;
        }
    },

    /**
     * Render funds panel from cache (instant - no async!)
     */
    renderFundsFromCache() {
        if (!this._dataLoaded) {
            // Cache not ready, fall back to async load
            this.loadFunds();
            return;
        }

        console.log('⚡ Rendering funds from cache (instant)');

        try {
            const funds = this._cachedFunds || [];
            this.renderFundsStatCards(funds);
            this.renderFundsList(funds);
        } catch (error) {
            console.error('❌ Error rendering funds from cache:', error);
            // Fall back to async load on error
            this.loadFunds();
        }
    },

    /**
     * Render expenses panel from cache (instant - no async!)
     */
    renderExpensesFromCache() {
        if (!this._dataLoaded) {
            // Cache not ready, fall back to async load
            this.showExpensesPanel();
            return;
        }

        console.log('⚡ Rendering expenses from cache (instant)');

        try {
            const expenses = this._cachedExpenses || [];
            this.currentExpenses = expenses;
            this.filteredExpenses = expenses;

            // Render stat cards and table
            this.renderExpensesStatCards(expenses);
            this.renderExpensesTable(expenses);

            // Update category display
            this.updateCategoryAmountDisplay('all', expenses);
        } catch (error) {
            console.error('❌ Error rendering expenses from cache:', error);
            // Fall back to async load on error
            this.showExpensesPanel();
        }
    },

    /**
     * Render payments panel from cache (instant - no async!)
     */
    renderPaymentsFromCache() {
        if (!this._dataLoaded) {
            // Cache not ready, fall back to async load
            this.loadAllPayments();
            return;
        }

        console.log('⚡ Rendering payments from cache (instant)');

        try {
            const payments = this._cachedPayments || [];
            const funds = this._cachedFunds || [];
            const groups = this._cachedGroups || [];

            // Initialize filters if not already set
            if (!this.paymentFilters) {
                this.paymentFilters = {
                    fund: 'all',
                    group: 'all',
                    method: 'all',
                    dateRange: 'all',
                    search: '',
                    customDateStart: '',
                    customDateEnd: ''
                };
            }

            // Render stat cards and payments list
            this.renderPaymentsStatCards(payments);
            this.renderPaymentsList(payments, funds, groups);
        } catch (error) {
            console.error('❌ Error rendering payments from cache:', error);
            // Fall back to async load on error
            this.loadAllPayments();
        }
    },

    /**
     * Load dashboard data (LEGACY - only used when cache not available)
     */
    async loadDashboard() {
        try {
            // Show loading skeleton immediately
            this.showDashboardSkeleton();

            // Load data from Firestore (uses Firestore cache if available)
            const stats = await this.getDB().getDashboardStats();

            // Update UI with real data
            this.updateDashboardStats(stats);

            // Hide skeleton
            this.hideDashboardSkeleton();

            // Calculate and update expenses this month
            await this.updateExpensesThisMonth();

            // Load recent funds
            this.renderRecentFunds(stats.recentFunds);

        } catch (error) {
            console.error('Error loading dashboard:', error);
            this.hideDashboardSkeleton();
            Toast.error('Failed to load dashboard data');
        }
    },

    /**
     * Show skeleton loading state on dashboard
     */
    showDashboardSkeleton() {
        const statElements = [
            'statTotalFunds',
            'statTotalCollected',
            'statTotalPledged',
            'statTotalPayments',
            'statExpensesThisMonth'
        ];

        statElements.forEach(id => {
            const element = document.getElementById(id);
            if (element) {
                element.classList.add('skeleton-loading');
            }
        });
    },

    /**
     * Hide skeleton loading state on dashboard
     */
    hideDashboardSkeleton() {
        const statElements = [
            'statTotalFunds',
            'statTotalCollected',
            'statTotalPledged',
            'statTotalPayments',
            'statExpensesThisMonth'
        ];

        statElements.forEach(id => {
            const element = document.getElementById(id);
            if (element) {
                element.classList.remove('skeleton-loading');
            }
        });
    },

    /**
     * Update dashboard stats UI
     */
    updateDashboardStats(stats) {
        document.getElementById('statTotalFunds').textContent = stats.totalFunds;
        document.getElementById('statTotalCollected').textContent = Utils.formatCurrency(stats.totalCollected);
        document.getElementById('statTotalPledged').textContent = Utils.formatCurrency(stats.totalPledged || 0);
        document.getElementById('statTotalPayments').textContent = stats.totalPayments;
    },

    /**
     * Calculate and update expenses for this month
     */
    async updateExpensesThisMonth() {
        try {
            const expenses = await this.getDB().getExpenses();
            const monthlyTotal = this.calculateMonthlyExpenses(expenses);
            document.getElementById('statExpensesThisMonth').textContent = Utils.formatCurrency(monthlyTotal);
        } catch (error) {
            console.error('Error calculating monthly expenses:', error);
            document.getElementById('statExpensesThisMonth').textContent = 'Ksh 0';
        }
    },

    /**
     * Calculate total expenses for the current month
     */
    calculateMonthlyExpenses(expenses) {
        const now = new Date();
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

        const monthAmount = expenses
            .filter(exp => new Date(exp.date) >= startOfMonth)
            .reduce((sum, exp) => sum + parseFloat(exp.amount || 0), 0);

        return monthAmount;
    },

    /**
     * Render recent funds
     */
    renderRecentFunds(funds) {
        const container = document.getElementById('recentFundsList');

        if (!funds || funds.length === 0) {
            container.innerHTML = `
                <div class="text-center" style="padding: 2rem; color: var(--text-tertiary);">
                    <div style="font-size: 3rem; margin-bottom: 1rem;">💰</div>
                    <p>No funds yet. Create your first fund to get started!</p>
                    <button class="btn btn-primary mt-md" onclick="document.getElementById('btnNewFund').click()">
                        Create First Fund
                    </button>
                </div>
            `;
            return;
        }

        container.innerHTML = funds.map((fund, index) => {
            const totalCollected = fund.totalCollected || 0;
            const totalPledged = fund.totalPledged || 0;
            const totalGoal = fund.totalGoal || 0;

            const paidProgress = fund.type === 'allocated' ?
                Utils.calculatePercentage(totalCollected, totalGoal) : 0;
            const pledgedProgress = fund.type === 'allocated' && totalPledged > 0 ?
                Utils.calculatePercentage(totalPledged, totalGoal) : 0;

            return `
                <div class="card" style="cursor: pointer;" onclick="App.navigateToFund('${fund.id}')">
                    <div class="card-body">
                        <div class="flex-between mb-sm">
                            <h3 style="font-size: 1.125rem; margin: 0;">#${index + 1} ${Utils.sanitizeHTML(fund.name)}</h3>
                            <span class="badge badge-${fund.type === 'allocated' ? 'primary' : 'secondary'}">${fund.type}</span>
                        </div>
                        ${fund.description ? `<p style="color: var(--text-secondary); font-size: 0.875rem; margin-bottom: 1rem;">${Utils.sanitizeHTML(fund.description)}</p>` : ''}
                        <div class="progress-container">
                            <div class="progress-label">
                                <span style="color: ${fund.type === 'allocated' ? (paidProgress < 50 ? 'var(--warning-color)' : 'var(--info-color)') : 'var(--info-color)'};">Collected: ${Utils.formatCurrency(totalCollected)}</span>
                                ${totalPledged > 0 ? `<span style="color: var(--pledge-color);">Pledged: ${Utils.formatCurrency(totalPledged)}</span>` : ''}
                                ${fund.type === 'allocated' ? `<span style="color: var(--success-color);">Goal: ${Utils.formatCurrency(totalGoal)}</span>` : ''}
                            </div>
                            ${fund.type === 'allocated' ? `
                                <div class="progress-bar-segmented">
                                    <div class="progress-segment paid ${paidProgress < 50 ? 'warning' : paidProgress >= 100 ? 'success' : 'default'}" style="width: ${Math.min(paidProgress, 100)}%"></div>
                                    ${totalPledged > 0 ? `<div class="progress-segment pledged" style="width: ${Math.min(pledgedProgress, 100)}%"></div>` : ''}
                                </div>
                                <div style="font-size: 0.75rem; color: var(--text-tertiary); margin-top: 0.5rem;">
                                    ${(() => {
                                        const difference = totalGoal - totalCollected;
                                        const isExceeded = difference < 0;
                                        const amount = Math.abs(difference);
                                        const label = isExceeded ? 'exceeded' : 'remaining';
                                        const color = isExceeded ? 'var(--error-color)' : 'var(--warning-color)';
                                        return `${paidProgress}% paid${totalPledged > 0 ? ` • ${pledgedProgress}% pledged` : ''} • <span style="color: ${color};">${Utils.formatCurrency(amount)} ${label}</span>`;
                                    })()}
                                </div>
                            ` : totalPledged > 0 ? `
                                <div style="font-size: 0.75rem; color: var(--text-tertiary); margin-top: 0.5rem;">
                                    Open fund • Total with pledges: ${Utils.formatCurrency(totalCollected + totalPledged)}
                                </div>
                            ` : ''}
                        </div>
                    </div>
                </div>
            `;
        }).join('');
    },

    /**
     * Load all funds
     */
    async loadFunds() {
        try {
            const funds = await this.getDB().getAllFunds();
            this.renderFundsStatCards(funds);
            this.renderFundsList(funds);

            // Set up real-time listener for funds (auto-refresh when funds change)
            this.setupFundsListener((funds) => {
                this.renderFundsStatCards(funds);
                this.renderFundsList(funds);
            });

        } catch (error) {
            console.error('Error loading funds:', error);
            Toast.error('Failed to load funds');
        }
    },

    /**
     * Render funds stat cards
     */
    renderFundsStatCards(funds) {
        const container = document.getElementById('fundsStatsCards');
        if (!container) return;

        // Calculate statistics
        const totalFunds = funds.length;
        const totalCollected = funds.reduce((sum, f) => sum + (f.totalCollected || 0), 0);
        const totalPledged = funds.reduce((sum, f) => sum + (f.totalPledged || 0), 0);
        const totalGoal = funds.filter(f => f.type === 'allocated')
            .reduce((sum, f) => sum + (f.totalGoal || 0), 0);
        const activeFunds = funds.filter(f => f.type === 'open' ||
            (f.type === 'allocated' && f.totalCollected < f.totalGoal)).length;
        const completedFunds = funds.filter(f => f.type === 'allocated' &&
            f.totalCollected >= f.totalGoal).length;

        container.innerHTML = `
            <div class="metric-card success">
                <div class="metric-header">
                    <h3>Total Collected</h3>
                    <span class="metric-icon">💰</span>
                </div>
                <div class="metric-value">${Utils.formatCurrency(totalCollected)}</div>
                <div class="metric-change">Across all funds</div>
            </div>

            <div class="metric-card pledge">
                <div class="metric-header">
                    <h3>Total Pledged</h3>
                    <span class="metric-icon">🤝</span>
                </div>
                <div class="metric-value">${Utils.formatCurrency(totalPledged)}</div>
                <div class="metric-change">Future commitments</div>
            </div>

            <div class="metric-card primary">
                <div class="metric-header">
                    <h3>Total Funds</h3>
                    <span class="metric-icon">📊</span>
                </div>
                <div class="metric-value">${totalFunds}</div>
                <div class="metric-change">Active funds</div>
            </div>

            <div class="metric-card info">
                <div class="metric-header">
                    <h3>Active Funds</h3>
                    <span class="metric-icon">✅</span>
                </div>
                <div class="metric-value">${activeFunds}</div>
                <div class="metric-change">In progress</div>
            </div>

            <div class="metric-card warning">
                <div class="metric-header">
                    <h3>Completed</h3>
                    <span class="metric-icon">🎯</span>
                </div>
                <div class="metric-value">${completedFunds}</div>
                <div class="metric-change">Funds completed</div>
            </div>
        `;
    },

    /**
     * Render funds list
     */
    renderFundsList(funds) {
        const container = document.getElementById('fundsList');

        if (!funds || funds.length === 0) {
            container.innerHTML = `
                <div class="card" style="grid-column: 1 / -1;">
                    <div class="card-body text-center" style="padding: 3rem;">
                        <div style="font-size: 4rem; margin-bottom: 1rem;">💰</div>
                        <h3>No Funds Yet</h3>
                        <p style="color: var(--text-secondary); margin: 1rem 0;">Create your first fund to start tracking contributions.</p>
                        <button class="btn btn-primary" onclick="App.showNewFundModal()">
                            <span class="btn-icon">➕</span>
                            Create Fund
                        </button>
                    </div>
                </div>
            `;
            return;
        }

        container.innerHTML = funds.map((fund, index) => {
            const totalCollected = fund.totalCollected || 0;
            const totalPledged = fund.totalPledged || 0;
            const totalGoal = fund.totalGoal || 0;

            const paidProgress = fund.type === 'allocated' ?
                Utils.calculatePercentage(totalCollected, totalGoal) : 0;
            const pledgedProgress = fund.type === 'allocated' && totalPledged > 0 ?
                Utils.calculatePercentage(totalPledged, totalGoal) : 0;

            return `
                <div class="card" style="cursor: pointer;" onclick="App.viewFundDetail('${fund.id}')">
                    <div class="card-body">
                        <div class="flex-between mb-sm">
                            <h3 style="font-size: 1.25rem; margin: 0;">#${index + 1} ${Utils.sanitizeHTML(fund.name)}</h3>
                            <span class="badge badge-${fund.type === 'allocated' ? 'primary' : 'secondary'}">${fund.type}</span>
                        </div>
                        ${fund.description ? `<p style="color: var(--text-secondary); font-size: 0.875rem; margin-bottom: 1rem;">${Utils.truncate(fund.description, 100)}</p>` : ''}
                        <div class="progress-container">
                            <div class="progress-label">
                                <span style="font-weight: 600; color: ${fund.type === 'allocated' ? (paidProgress < 50 ? 'var(--warning-color)' : 'var(--info-color)') : 'var(--info-color)'};">Collected: ${Utils.formatCurrency(totalCollected)}</span>
                                ${totalPledged > 0 ? `<span style="color: var(--pledge-color);">Pledged: ${Utils.formatCurrency(totalPledged)}</span>` : ''}
                                ${fund.type === 'allocated' ? `<span style="color: var(--success-color);">/ ${Utils.formatCurrency(totalGoal)}</span>` : ''}
                            </div>
                            ${fund.type === 'allocated' ? `
                                <div class="progress-bar-segmented">
                                    <div class="progress-segment paid ${paidProgress < 50 ? 'warning' : paidProgress >= 100 ? 'success' : 'default'}" style="width: ${Math.min(paidProgress, 100)}%"></div>
                                    ${totalPledged > 0 ? `<div class="progress-segment pledged" style="width: ${Math.min(pledgedProgress, 100)}%"></div>` : ''}
                                </div>
                                <div style="font-size: 0.75rem; color: var(--text-tertiary); margin-top: 0.5rem;">
                                    ${(() => {
                                        const difference = totalGoal - totalCollected;
                                        const isExceeded = difference < 0;
                                        const amount = Math.abs(difference);
                                        const label = isExceeded ? 'exceeded' : 'remaining';
                                        const color = isExceeded ? 'var(--error-color)' : 'var(--warning-color)';
                                        return `${paidProgress}% paid${totalPledged > 0 ? ` • ${pledgedProgress}% pledged` : ''} • <span style="color: ${color};">${Utils.formatCurrency(amount)} ${label}</span>`;
                                    })()}
                                </div>
                            ` : `
                                <div style="font-size: 0.75rem; color: var(--text-tertiary); margin-top: 0.5rem;">
                                    Open fund${totalPledged > 0 ? ` • Total with pledges: ${Utils.formatCurrency(totalCollected + totalPledged)}` : ' - no fixed goal'}
                                </div>
                            `}
                        </div>
                        <div style="font-size: 0.75rem; color: var(--text-tertiary); margin-top: 1rem;">
                            Created ${Utils.getRelativeTime(fund.createdAt)}
                        </div>
                    </div>
                </div>
            `;
        }).join('');
    },

    /**
     * Navigate to a specific fund (switches to funds panel, then shows fund detail)
     */
    async navigateToFund(fundId) {
        // Switch to funds panel first
        this.showPanel('funds');
        // Then view the fund detail
        await this.viewFundDetail(fundId);
    },

    /**
     * View fund detail
     */
    async viewFundDetail(fundId) {
        try {
            Loading.show();
            this.currentFund = fundId;

            // Clean up old listeners before setting up new ones
            this.cleanupListeners();

            const details = await this.getDB().getFundDetails(fundId);
            if (!details) {
                Toast.error('Fund not found');
                return;
            }

            // Update header
            document.getElementById('fundDetailName').textContent = details.fund.name;
            document.getElementById('fundDetailType').textContent = details.fund.type;
            document.getElementById('fundDetailType').className = `badge badge-${details.fund.type === 'allocated' ? 'primary' : 'secondary'}`;

            // Render overview
            this.renderFundOverview(details);

            // Render groups
            this.renderGroupsList(details.groups, details.fund.type);

            // Show panel
            document.getElementById('fundDetailPanel').classList.remove('hidden');
            document.querySelectorAll('.panel').forEach(p => {
                if (p.id !== 'fundDetailPanel') p.classList.add('hidden');
            });

            // Set up real-time listener for groups in this fund
            this.setupGroupsListener(fundId, async (groups) => {
                const updatedDetails = await this.getDB().getFundDetails(fundId);
                this.renderFundOverview(updatedDetails);
                this.renderGroupsList(groups, details.fund.type);
            });

            // Set up real-time listener for payments in this fund
            this.setupPaymentsListener(fundId, async (payments) => {
                const updatedDetails = await this.getDB().getFundDetails(fundId);
                this.renderFundOverview(updatedDetails);
            });

            Loading.hide();
        } catch (error) {
            console.error('Error loading fund detail:', error);
            Toast.error('Failed to load fund details');
            Loading.hide();
        }
    },

    /**
     * Render fund overview
     */
    renderFundOverview(details) {
        const { fund, groupCount, paymentCount } = details;
        const totalPledged = fund.totalPledged || 0;
        const totalCollected = fund.totalCollected || 0;
        const totalGoal = fund.totalGoal || 0;

        const paidProgress = fund.type === 'allocated' ?
            Utils.calculatePercentage(totalCollected, totalGoal) : 0;
        const combinedProgress = fund.type === 'allocated' ?
            Utils.calculatePercentage(totalCollected + totalPledged, totalGoal) : 0;

        const overview = document.getElementById('fundOverviewCard');
        overview.innerHTML = `
            <div class="card-body">
                ${fund.description ? `<p style="color: var(--text-secondary); margin-bottom: 1.5rem;">${Utils.sanitizeHTML(fund.description)}</p>` : ''}

                <div class="grid ${fund.type === 'allocated' && totalPledged > 0 ? 'grid-4' : 'grid-3'} mb-lg">
                    <div>
                        <div style="font-size: 0.875rem; color: var(--text-secondary); margin-bottom: 0.25rem;">Total Collected</div>
                        <div style="font-size: 1.5rem; font-weight: 700; color: ${fund.type === 'allocated' ? (paidProgress < 50 ? 'var(--warning-color)' : 'var(--info-color)') : 'var(--info-color)'};">${Utils.formatCurrency(totalCollected)}</div>
                    </div>
                    ${totalPledged > 0 ? `
                        <div>
                            <div style="font-size: 0.875rem; color: var(--text-secondary); margin-bottom: 0.25rem;">Total Pledged</div>
                            <div style="font-size: 1.5rem; font-weight: 700; color: var(--pledge-color);">${Utils.formatCurrency(totalPledged)}</div>
                        </div>
                    ` : ''}
                    ${fund.type === 'allocated' ? `
                        <div>
                            <div style="font-size: 0.875rem; color: var(--text-secondary); margin-bottom: 0.25rem;">Total Goal</div>
                            <div style="font-size: 1.5rem; font-weight: 700; color: var(--success-color);">${Utils.formatCurrency(totalGoal)}</div>
                        </div>
                        <div>
                            ${(() => {
                                const difference = totalGoal - totalCollected;
                                const isExceeded = difference < 0;
                                const amount = Math.abs(difference);
                                const label = isExceeded ? 'Exceeded' : 'Remaining';
                                const color = isExceeded ? 'var(--error-color)' : 'var(--warning-color)';
                                return `<div style="font-size: 0.875rem; color: var(--text-secondary); margin-bottom: 0.25rem;">${label}</div>
                                <div style="font-size: 1.5rem; font-weight: 700; color: ${color};">${Utils.formatCurrency(amount)}</div>`;
                            })()}
                        </div>
                    ` : `
                        <div>
                            <div style="font-size: 0.875rem; color: var(--text-secondary); margin-bottom: 0.25rem;">Groups</div>
                            <div style="font-size: 1.5rem; font-weight: 700; color: var(--info-color);">${groupCount}</div>
                        </div>
                        <div>
                            <div style="font-size: 0.875rem; color: var(--text-secondary); margin-bottom: 0.25rem;">Payments</div>
                            <div style="font-size: 1.5rem; font-weight: 700; color: var(--info-color);">${paymentCount}</div>
                        </div>
                    `}
                </div>

                ${fund.type === 'allocated' ? `
                    <div class="progress-container">
                        <div style="padding: 1rem; background: var(--surface-secondary); border-radius: var(--radius-md);">
                            <div style="font-size: 0.875rem; color: var(--text-secondary); margin-bottom: 0.75rem;">
                                ${groupCount} Groups • ${paymentCount} Payments${totalPledged > 0 ? ' • ' + Utils.formatCurrency(totalPledged) + ' Pledged' : ''}
                            </div>

                            <div class="progress-label">
                                <span style="font-weight: 600; color: var(--text-primary);">
                                    Paid: ${Utils.formatCurrency(totalCollected)} (${paidProgress}%)
                                    ${totalPledged > 0 ? ` | <span style="color: var(--pledge-color);">Pledged: ${Utils.formatCurrency(totalPledged)} (${Math.round((totalPledged / totalGoal) * 100)}%)</span>` : ''}
                                </span>
                            </div>
                            <div class="progress-bar-segmented" style="height: 1.5rem;">
                                <div class="progress-segment paid ${paidProgress < 50 ? 'warning' : paidProgress >= 100 ? 'success' : 'default'}" style="width: ${Math.min(paidProgress, 100)}%"></div>
                                ${totalPledged > 0 ? `<div class="progress-segment pledged" style="width: ${Math.min(Math.round((totalPledged / totalGoal) * 100), 100)}%"></div>` : ''}
                            </div>
                        </div>
                    </div>
                ` : `
                    ${totalPledged > 0 ? `
                        <div class="progress-container">
                            <div class="progress-label">
                                <span style="font-weight: 600;">Paid: ${Utils.formatCurrency(totalCollected)}</span>
                                <span style="font-weight: 600; color: var(--pledge-color);">Pledged: ${Utils.formatCurrency(totalPledged)}</span>
                            </div>
                            <div style="font-size: 0.875rem; color: var(--text-secondary); margin-top: 0.5rem;">
                                ${groupCount} Groups • ${paymentCount} Payments
                            </div>
                        </div>
                    ` : ''}
                `}
            </div>
        `;
    },

    /**
     * Render groups list
     */
    renderGroupsList(groups, fundType) {
        const container = document.getElementById('groupsList');

        if (!groups || groups.length === 0) {
            container.innerHTML = `
                <div class="text-center" style="padding: 2rem; color: var(--text-tertiary);">
                    <div style="font-size: 3rem; margin-bottom: 1rem;">👥</div>
                    <p>No groups yet. Add a group to start tracking contributions.</p>
                    <button class="btn btn-primary mt-md" onclick="App.showAddGroupModal()">
                        <span class="btn-icon">➕</span>
                        Add Group
                    </button>
                </div>
            `;
            return;
        }

        container.innerHTML = groups.map((group, index) => {
            const totalPaid = group.totalPaid || 0;
            const totalPledged = group.totalPledged || 0;
            const allocation = group.allocation || 0;

            // Calculate progress percentages
            const paidProgress = fundType === 'allocated' && allocation ?
                Utils.calculatePercentage(totalPaid, allocation) : 0;
            const pledgedProgress = fundType === 'allocated' && allocation ?
                Utils.calculatePercentage(totalPledged, allocation) : 0;
            const combinedTotal = totalPaid + totalPledged;
            const remaining = allocation ? allocation - totalPaid : 0;

            return `
                <div class="card mb-sm">
                    <div class="card-body" style="padding: 0.75rem;">
                        <div class="flex-between mb-sm">
                            <div>
                                <h4 style="margin: 0; font-size: 1.125rem;">
                                    #${index + 1} ${Utils.sanitizeHTML(group.name)}
                                    ${totalPledged > 0 ? `<span style="color: var(--pledge-color); font-size: 0.9rem; margin-left: 0.5rem;">(Pledged: ${Utils.formatCurrency(totalPledged)})</span>` : ''}
                                    ${fundType === 'allocated' && group.includeInDivision === false ?
                                        '<span class="badge badge-info" style="margin-left: 0.5rem; font-size: 0.7rem;">Extra</span>' :
                                        ''}
                                </h4>
                            </div>
                            <div class="flex flex-gap-sm">
                                <button class="btn btn-sm btn-outline" onclick="App.viewGroupPayments('${group.id}')">
                                    <span class="btn-icon">📜</span>
                                    History
                                </button>
                                <button class="btn btn-sm btn-outline" onclick="App.editGroup('${group.id}')">
                                    <span class="btn-icon">✏️</span>
                                    Edit
                                </button>
                            </div>
                        </div>
                        <div class="progress-container">
                            ${fundType === 'allocated' ? `
                                <div class="progress-label">
                                    <span style="font-weight: 600; color: var(--text-primary);">
                                        Paid: ${Utils.formatCurrency(totalPaid)} (${paidProgress}%)
                                        ${totalPledged > 0 ? ` | <span style="color: var(--pledge-color);">Pledged: ${Utils.formatCurrency(totalPledged)} (${pledgedProgress}%)</span>` : ''}
                                    </span>
                                </div>
                                <div class="progress-bar-segmented">
                                    <div class="progress-segment paid ${paidProgress < 50 ? 'warning' : paidProgress >= 100 ? 'success' : 'default'}" style="width: ${Math.min(paidProgress, 100)}%"></div>
                                    ${totalPledged > 0 ? `<div class="progress-segment pledged" style="width: ${Math.min(pledgedProgress, 100)}%"></div>` : ''}
                                </div>
                                <div style="font-size: 0.75rem; color: var(--text-primary); margin-top: 0.5rem;">
                                    <span style="font-weight: 600;">Total: ${Utils.formatCurrency(combinedTotal)} / ${Utils.formatCurrency(allocation)}</span>
                                    <span style="color: ${totalPaid > allocation ? 'var(--error-color)' : 'var(--text-secondary)'};">
                                         • ${Utils.formatCurrency(Math.abs(remaining))} ${totalPaid > allocation ? 'exceeded' : 'remaining'}
                                    </span>
                                </div>
                            ` : `
                                <div class="progress-label">
                                    <span style="font-weight: 600; color: var(--text-primary);">Paid: ${Utils.formatCurrency(totalPaid)}</span>
                                    ${totalPledged > 0 ? `<span style="font-weight: 600; color: var(--pledge-color);">Pledged: ${Utils.formatCurrency(totalPledged)}</span>` : ''}
                                </div>
                                ${totalPledged > 0 ? `<div style="font-size: 0.75rem; color: var(--text-tertiary); margin-top: 0.5rem;">Open fund - Total with pledges: ${Utils.formatCurrency(combinedTotal)}</div>` : ''}
                            `}
                        </div>
                    </div>
                </div>
            `;
        }).join('');
    },

    /**
     * Sort groups
     */
    async sortGroups(sortBy) {
        if (!this.currentFund) return;

        const groups = await this.getDB().getGroupsByFund(this.currentFund);
        let sorted = [...groups];

        switch (sortBy) {
            case 'alphabetical':
                sorted = Utils.sortBy(groups, 'name', 'asc');
                break;
            case 'most-contributed':
                sorted = Utils.sortBy(groups, 'totalPaid', 'desc');
                break;
            case 'least-contributed':
                sorted = Utils.sortBy(groups, 'totalPaid', 'asc');
                break;
            case 'most-recent':
                // Get last payment date for each group
                for (let group of sorted) {
                    const payments = await this.getDB().getPaymentsByGroup(group.id);
                    group.lastPaymentDate = payments.length > 0 ?
                        Math.max(...payments.map(p => p.date)) : 0;
                }
                sorted = Utils.sortBy(sorted, 'lastPaymentDate', 'desc');
                break;
        }

        const fund = await this.getDB().getFund(this.currentFund);
        this.renderGroupsList(sorted, fund.type);
    },

    /**
     * Show new fund modal
     */
    showNewFundModal() {
        const formHTML = `
            <form id="formNewFund">
                <div class="form-group">
                    <label for="fundName">Fund Name *</label>
                    <input type="text" id="fundName" class="form-control" required placeholder="e.g., New Roof Project">
                </div>
                <div class="form-group">
                    <label for="fundDescription">Description</label>
                    <textarea id="fundDescription" class="form-control" placeholder="Optional description"></textarea>
                </div>
                <div class="form-group">
                    <label for="fundType">Fund Type *</label>
                    <select id="fundType" class="form-control" required>
                        <option value="">Select type...</option>
                        <option value="allocated">Allocated Fund (Fixed Budget)</option>
                        <option value="open">Open Fund (Ongoing)</option>
                    </select>
                    <small style="color: var(--text-tertiary); margin-top: 0.25rem; display: block;" id="fundTypeHelp"></small>
                </div>
                <div class="form-group hidden" id="totalGoalGroup">
                    <label for="fundTotalGoal">Total Goal Amount *</label>
                    <input type="number" id="fundTotalGoal" class="form-control" min="0" step="0.01" placeholder="0.00">
                </div>
            </form>
        `;

        Modal.show({
            title: 'Create New Fund',
            content: formHTML,
            size: 'medium',
            buttons: [
                {
                    text: 'Cancel',
                    className: 'btn btn-outline',
                    onClick: () => true
                },
                {
                    text: 'Create Fund',
                    className: 'btn btn-primary',
                    onClick: () => {
                        this.createFund();
                        return false; // Don't auto-close
                    }
                }
            ]
        });

        // Add fund type change handler after modal is rendered
        setTimeout(() => {
            const fundType = document.getElementById('fundType');
            if (fundType) {
                fundType.addEventListener('change', (e) => {
                    const goalGroup = document.getElementById('totalGoalGroup');
                    const help = document.getElementById('fundTypeHelp');

                    if (e.target.value === 'allocated') {
                        goalGroup.classList.remove('hidden');
                        help.textContent = 'Set a total goal and assign portions to groups.';
                    } else if (e.target.value === 'open') {
                        goalGroup.classList.add('hidden');
                        help.textContent = 'No fixed goal - accept ongoing contributions.';
                    } else {
                        goalGroup.classList.add('hidden');
                        help.textContent = '';
                    }
                });
            }
        }, 50);
    },

    /**
     * Create fund
     */
    async createFund() {
        try {
            const name = document.getElementById('fundName').value.trim();
            const description = document.getElementById('fundDescription').value.trim();
            const type = document.getElementById('fundType').value;
            const totalGoal = document.getElementById('fundTotalGoal').value;

            if (!name) {
                Toast.error('Please enter a fund name');
                return;
            }

            if (!type) {
                Toast.error('Please select a fund type');
                return;
            }

            if (type === 'allocated' && (!totalGoal || parseFloat(totalGoal) <= 0)) {
                Toast.error('Please enter a valid total goal');
                return;
            }

            Loading.show();

            const fundId = await this.getDB().createFund({
                name,
                description,
                type,
                totalGoal: type === 'allocated' ? totalGoal : null
            });

            Modal.close();
            Loading.hide();
            Toast.success('Fund created successfully!');

            // Schedule background sync
            this.scheduleSyncToBackend();

            // Note: Real-time listener automatically updates cache and refreshes views
            // No manual refresh needed!

            // Optionally go to fund detail
            await this.viewFundDetail(fundId);

            // Sync to backend in background (non-blocking)
            if (window.ApiService?.config.isConfigured && navigator.onLine) {
                this.getDB().getFund(fundId).then(fund => {
                    return window.ApiService.addFund(fund);
                }).then(() => {
                    console.log('✅ Fund synced to backend:', fundId);
                }).catch(error => {
                    console.warn('⚠️ Background sync failed for fund:', fundId, error);
                });
            }

        } catch (error) {
            console.error('Error creating fund:', error);
            Toast.error(error.message || 'Failed to create fund');
            Loading.hide();
        }
    },

    /**
     * Show add group modal
     */
    async showAddGroupModal() {
        if (!this.currentFund) return;

        const fund = await this.getDB().getFund(this.currentFund);

        let allocationHTML = '';
        if (fund.type === 'allocated') {
            // Calculate remaining allocation (only count groups included in division)
            const groups = await this.getDB().getGroupsByFund(this.currentFund);
            const divisionGroups = groups.filter(g => g.includeInDivision !== false);
            const totalAllocated = divisionGroups.reduce((sum, g) => sum + (g.allocation || 0), 0);
            const remaining = fund.totalGoal - totalAllocated;

            allocationHTML = `
                <div class="form-group">
                    <label for="groupAllocation">Allocation Amount *</label>
                    <input type="number" id="groupAllocation" class="form-control" min="0" step="0.01" placeholder="0.00">
                    <small style="color: var(--text-tertiary); margin-top: 0.25rem; display: block;">
                        Remaining to allocate: <strong>${Utils.formatCurrency(remaining)}</strong>
                        <br><span style="font-size: 0.75rem; color: var(--text-tertiary);">
                            (${divisionGroups.length} division groups of ${groups.length} total)
                        </span>
                    </small>
                </div>
            `;
        }

        const formHTML = `
            <form id="formAddGroup">
                <div class="form-group">
                    <label for="groupName">Group Name *</label>
                    <input type="text" id="groupName" class="form-control" required placeholder="e.g., East Wing Residents">
                </div>
                ${allocationHTML}
                ${fund.type === 'allocated' ? `
                    <div class="form-group">
                        <label style="display: flex; align-items: center; cursor: pointer; user-select: none;">
                            <input type="checkbox" id="includeInDivision" checked style="margin-right: 0.5rem; width: 18px; height: 18px; cursor: pointer;">
                            <span>Include in automatic allocation division</span>
                        </label>
                        <small style="color: var(--text-tertiary); margin-top: 0.25rem; display: block; margin-left: 1.5rem;">
                            When checked, this group will be counted when calculating remaining fund allocation. Uncheck for extra/bonus groups.
                        </small>
                    </div>
                ` : ''}
            </form>
        `;

        Modal.show({
            title: 'Add Group',
            content: formHTML,
            size: 'medium',
            buttons: [
                {
                    text: 'Cancel',
                    className: 'btn btn-outline',
                    onClick: () => true
                },
                {
                    text: 'Add Group',
                    className: 'btn btn-primary',
                    onClick: () => {
                        this.createGroup();
                        return false; // Don't auto-close
                    }
                }
            ]
        });
    },

    /**
     * Create group
     */
    async createGroup() {
        try {
            if (!this.currentFund) return;

            const name = document.getElementById('groupName').value.trim();
            const allocation = document.getElementById('groupAllocation')?.value;
            const includeInDivision = document.getElementById('includeInDivision')?.checked ?? true;

            if (!name) {
                Toast.error('Please enter a group name');
                return;
            }

            const fund = await this.getDB().getFund(this.currentFund);

            if (fund.type === 'allocated' && (!allocation || parseFloat(allocation) <= 0)) {
                Toast.error('Please enter a valid allocation amount');
                return;
            }

            Loading.show();

            const groupId = await this.getDB().createGroup({
                fundId: this.currentFund,
                name,
                allocation: fund.type === 'allocated' ? allocation : null,
                includeInDivision: includeInDivision
            });

            Modal.close();
            Loading.hide();
            Toast.success('Group added successfully!');

            // Schedule background sync
            this.scheduleSyncToBackend();

            // Refresh fund detail
            await this.viewFundDetail(this.currentFund);

            // Sync to backend in background (non-blocking)
            if (window.ApiService?.config.isConfigured && navigator.onLine) {
                this.getDB().getGroup(groupId).then(group => {
                    return window.ApiService.addGroup(group);
                }).then(() => {
                    console.log('✅ Group synced to backend:', groupId);
                }).catch(error => {
                    console.warn('⚠️ Background sync failed for group:', groupId, error);
                });
            }

        } catch (error) {
            console.error('Error creating group:', error);
            Toast.error(error.message || 'Failed to create group');
            Loading.hide();
        }
    },

    /**
     * Show delete group modal with group selection
     */
    async showDeleteGroupModal() {
        if (!this.currentFund) return;

        try {
            const groups = await this.getDB().getGroupsByFund(this.currentFund);
            const fund = await this.getDB().getFund(this.currentFund);

            if (!groups || groups.length === 0) {
                Toast.error('No groups to delete');
                return;
            }

            // Create group selection list
            const groupsList = groups.map(group => {
                const progress = fund.type === 'allocated' && group.allocation ?
                    Utils.calculatePercentage(group.totalPaid, group.allocation) : 0;

                return `
                    <div class="group-delete-option" style="padding: 1rem; margin-bottom: 0.75rem; border: 2px solid var(--border-primary); border-radius: var(--radius-md); cursor: pointer; transition: all 0.2s ease;"
                         onclick="App.selectGroupToDelete('${group.id}')"
                         onmouseover="this.style.borderColor='var(--error-color)'; this.style.background='var(--surface-secondary)'"
                         onmouseout="this.style.borderColor='var(--border-primary)'; this.style.background=''">
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem;">
                            <h4 style="margin: 0; font-size: 1rem;">${Utils.sanitizeHTML(group.name)}</h4>
                            <span class="btn-icon" style="font-size: 1.25rem;">🗑️</span>
                        </div>
                        <div style="display: flex; gap: 1rem; font-size: 0.875rem; color: var(--text-secondary);">
                            <span><strong>Paid:</strong> ${Utils.formatCurrency(group.totalPaid)}</span>
                            ${fund.type === 'allocated' ? `<span><strong>Allocation:</strong> ${Utils.formatCurrency(group.allocation)}</span>` : ''}
                            ${fund.type === 'allocated' ? `<span><strong>Progress:</strong> ${progress}%</span>` : ''}
                        </div>
                    </div>
                `;
            }).join('');

            const formHTML = `
                <div style="margin-bottom: 1rem;">
                    <p style="color: var(--text-secondary); margin-bottom: 1.5rem;">Select a group to delete. All associated payments will be deleted as well.</p>
                    <div style="max-height: 400px; overflow-y: auto;">
                        ${groupsList}
                    </div>
                </div>
            `;

            Modal.show({
                title: 'Delete Group',
                content: formHTML,
                size: 'medium',
                buttons: [
                    {
                        text: 'Cancel',
                        className: 'btn btn-outline',
                        onClick: () => true
                    }
                ]
            });
        } catch (error) {
            console.error('Error loading groups for deletion:', error);
            Toast.error('Failed to load groups');
        }
    },

    /**
     * Select group to delete (called from modal)
     */
    async selectGroupToDelete(groupId) {
        // Close the selection modal
        Modal.close();
        // Wait for modal to fully close before showing confirm (300ms animation + buffer)
        await new Promise(resolve => setTimeout(resolve, 350));
        // Show confirmation and delete
        await this.deleteGroup(groupId);
    },

    /**
     * Delete group
     */
    async deleteGroup(groupId) {
        // Get payment count
        const payments = await this.getDB().getByIndex('payments', 'groupId', groupId);
        const paymentCount = payments.length;

        const message = paymentCount > 0
            ? `Are you sure you want to delete this group? This will also delete ${paymentCount} payment${paymentCount > 1 ? 's' : ''}. This action cannot be undone.`
            : 'Are you sure you want to delete this group? This action cannot be undone.';

        Confirm.show(
            message,
            async () => {
                try {
                    Loading.show();
                    await this.getDB().deleteGroup(groupId);
                    Toast.success('Group deleted successfully');

                    // Schedule background sync
                    this.scheduleSyncToBackend();

                    await this.viewFundDetail(this.currentFund);
                    Loading.hide();
                } catch (error) {
                    console.error('Error deleting group:', error);
                    Toast.error(error.message || 'Failed to delete group');
                    Loading.hide();
                }
            }
        );
    },

    /**
     * Show delete fund modal with fund selection
     */
    async showDeleteFundModal() {
        try {
            const funds = await this.getDB().getAllFunds();

            if (!funds || funds.length === 0) {
                Toast.error('No funds to delete');
                return;
            }

            // Check each fund for groups/payments
            const fundsWithDetails = await Promise.all(funds.map(async (fund) => {
                const groups = await this.getDB().getGroupsByFund(fund.id);
                const payments = await this.getDB().getPaymentsByFund(fund.id);
                const canDelete = groups.length === 0 && payments.length === 0;

                return {
                    ...fund,
                    groupCount: groups.length,
                    paymentCount: payments.length,
                    canDelete
                };
            }));

            // Create fund selection list
            const fundsList = fundsWithDetails.map(fund => {
                const progress = fund.type === 'allocated' ?
                    Utils.calculatePercentage(fund.totalCollected, fund.totalGoal) : 0;

                const statusClass = fund.canDelete ? 'success' : 'error';
                const statusText = fund.canDelete ? 'Can Delete' : 'Cannot Delete';
                const statusIcon = fund.canDelete ? '✓' : '⚠️';

                return `
                    <div class="fund-delete-option" style="padding: 1rem; margin-bottom: 0.75rem; border: 2px solid var(--border-primary); border-radius: var(--radius-md); cursor: ${fund.canDelete ? 'pointer' : 'not-allowed'}; opacity: ${fund.canDelete ? '1' : '0.6'}; transition: all 0.2s ease;"
                         ${fund.canDelete ? `onclick="App.selectFundToDelete('${fund.id}')"` : ''}
                         ${fund.canDelete ? `onmouseover="this.style.borderColor='var(--error-color)'; this.style.background='var(--surface-secondary)'"` : ''}
                         ${fund.canDelete ? `onmouseout="this.style.borderColor='var(--border-primary)'; this.style.background=''"` : ''}>
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem;">
                            <div>
                                <h4 style="margin: 0 0 0.25rem 0; font-size: 1rem;">${Utils.sanitizeHTML(fund.name)}</h4>
                                <span class="badge badge-${fund.type === 'allocated' ? 'primary' : 'secondary'}">${fund.type}</span>
                            </div>
                            <div style="text-align: right;">
                                <span class="badge badge-${statusClass}">${statusIcon} ${statusText}</span>
                            </div>
                        </div>
                        <div style="display: flex; gap: 1rem; font-size: 0.875rem; color: var(--text-secondary); margin-top: 0.5rem;">
                            <span><strong>Collected:</strong> ${Utils.formatCurrency(fund.totalCollected)}</span>
                            ${fund.type === 'allocated' ? `<span><strong>Goal:</strong> ${Utils.formatCurrency(fund.totalGoal)}</span>` : ''}
                            <span><strong>Groups:</strong> ${fund.groupCount}</span>
                            <span><strong>Payments:</strong> ${fund.paymentCount}</span>
                        </div>
                    </div>
                `;
            }).join('');

            const formHTML = `
                <div style="margin-bottom: 1rem;">
                    <p style="color: var(--text-secondary); margin-bottom: 1.5rem;">
                        Select a fund to delete.
                        <strong style="color: var(--error-color);">Funds with groups or payments cannot be deleted.</strong>
                        Please remove all groups and payments first.
                    </p>
                    <div style="max-height: 400px; overflow-y: auto;">
                        ${fundsList}
                    </div>
                </div>
            `;

            Modal.show({
                title: 'Delete Fund',
                content: formHTML,
                size: 'medium',
                buttons: [
                    {
                        text: 'Cancel',
                        className: 'btn btn-outline',
                        onClick: () => true
                    }
                ]
            });
        } catch (error) {
            console.error('Error loading funds for deletion:', error);
            Toast.error('Failed to load funds');
        }
    },

    /**
     * Select fund to delete (called from modal)
     */
    async selectFundToDelete(fundId) {
        // Close the selection modal
        Modal.close();
        // Wait for modal to fully close before showing confirm (300ms animation + buffer)
        await new Promise(resolve => setTimeout(resolve, 350));
        // Show confirmation and delete
        await this.deleteFund(fundId);
    },

    /**
     * Delete fund
     */
    async deleteFund(fundId) {
        Confirm.show(
            'Are you sure you want to delete this fund? This action cannot be undone.',
            async () => {
                try {
                    Loading.show();

                    // Double-check that fund has no groups or payments
                    const groups = await this.getDB().getGroupsByFund(fundId);
                    const payments = await this.getDB().getPaymentsByFund(fundId);

                    if (groups.length > 0 || payments.length > 0) {
                        Toast.error('Cannot delete fund with existing groups or payments');
                        Loading.hide();
                        return;
                    }

                    // Delete the fund
                    await this.getDB().deleteFund(fundId);

                    // Sync to backend if configured
                    if (window.ApiService?.config.isConfigured && navigator.onLine) {
                        try {
                            const fund = { id: fundId };
                            await window.ApiService.deleteFund(fund);
                            console.log('✅ Fund deletion synced to backend');
                        } catch (syncError) {
                            console.error('Failed to sync fund deletion to backend:', syncError);
                        }
                    }

                    Toast.success('Fund deleted successfully');

                    // Schedule background sync
                    this.scheduleSyncToBackend();

                    // Show funds panel (real-time listener auto-updates cache)
                    this.showPanel('funds');

                    Loading.hide();
                } catch (error) {
                    console.error('Error deleting fund:', error);
                    Toast.error(error.message || 'Failed to delete fund');
                    Loading.hide();
                }
            }
        );
    },

    /**
     * Show add payment modal
     */
    async showAddPaymentModal() {
        if (!this.currentFund) return;

        // Populate groups dropdown
        const groups = await this.getDB().getGroupsByFund(this.currentFund);
        const groupOptions = groups.map(g => `<option value="${g.id}">${Utils.sanitizeHTML(g.name)}</option>`).join('');

        // Get today's date in YYYY-MM-DD format
        const today = new Date().toISOString().split('T')[0];

        const formHTML = `
            <form id="formAddPayment">
                <div class="form-group">
                    <label for="paymentGroup">Group *</label>
                    <select id="paymentGroup" class="form-control" required>
                        <option value="">Select group...</option>
                        ${groupOptions}
                    </select>
                </div>
                <div class="form-group">
                    <label for="paymentAmount">Amount *</label>
                    <input type="number" id="paymentAmount" class="form-control" required min="0" step="0.01" placeholder="0.00">
                </div>
                <div class="form-group">
                    <div style="display: flex; align-items: center; gap: 0.5rem;">
                        <input type="checkbox" id="paymentIsPledge">
                        <label for="paymentIsPledge" style="margin: 0; cursor: pointer; font-weight: normal;">This is a pledge (not a payment)</label>
                    </div>
                    <small style="color: #6c757d; display: block; margin-top: 0.25rem;">Check this if recording a commitment rather than an actual payment</small>
                </div>
                <div class="form-row">
                    <div class="form-group">
                        <label for="paymentDate">Date *</label>
                        <input type="date" id="paymentDate" class="form-control" required value="${today}">
                    </div>
                    <div class="form-group">
                        <label for="paymentMethod">Payment Method *</label>
                        <select id="paymentMethod" class="form-control" required>
                            <option value="">Select method...</option>
                            <option value="Cash">Cash</option>
                            <option value="Bank Transfer">Bank Transfer</option>
                            <option value="Mobile Money">Mobile Money</option>
                            <option value="Check">Check</option>
                            <option value="Other">Other</option>
                        </select>
                    </div>
                </div>
                <div class="form-group">
                    <label for="paymentPayerName">Payer Name</label>
                    <div style="display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.5rem;">
                        <input type="checkbox" id="useGroupName" checked>
                        <label for="useGroupName" style="margin: 0; cursor: pointer; font-weight: normal;">Use group name as payer</label>
                    </div>
                    <input type="text" id="paymentPayerName" class="form-control" placeholder="Group name will be used" readonly>
                </div>
                <div class="form-group">
                    <label for="paymentReference">Reference Number</label>
                    <input type="text" id="paymentReference" class="form-control" placeholder="Transaction ID, Check #, etc.">
                </div>
                <div class="form-group">
                    <label for="paymentNote">Note</label>
                    <textarea id="paymentNote" class="form-control" placeholder="Additional details"></textarea>
                </div>
            </form>
        `;

        Modal.show({
            title: 'Add Payment',
            content: formHTML,
            size: 'medium',
            buttons: [
                {
                    text: 'Cancel',
                    className: 'btn btn-outline',
                    onClick: () => true
                },
                {
                    text: 'Save Payment',
                    className: 'btn btn-primary',
                    onClick: () => {
                        this.createPayment();
                        return false; // Don't auto-close
                    }
                }
            ]
        });

        // Auto-fill payer name when group is selected
        setTimeout(() => {
            const paymentGroupSelect = document.getElementById('paymentGroup');
            const paymentPayerNameInput = document.getElementById('paymentPayerName');
            const useGroupNameCheckbox = document.getElementById('useGroupName');

            if (paymentGroupSelect && paymentPayerNameInput && useGroupNameCheckbox) {
                // Handle checkbox toggle
                useGroupNameCheckbox.addEventListener('change', (e) => {
                    if (e.target.checked) {
                        // Use group name - make readonly
                        paymentPayerNameInput.readOnly = true;
                        paymentPayerNameInput.placeholder = 'Group name will be used';
                        // Fill with current group name if one is selected
                        const selectedOption = paymentGroupSelect.options[paymentGroupSelect.selectedIndex];
                        if (paymentGroupSelect.value && selectedOption) {
                            paymentPayerNameInput.value = selectedOption.text;
                        }
                    } else {
                        // Custom payer - make editable
                        paymentPayerNameInput.readOnly = false;
                        paymentPayerNameInput.placeholder = 'Enter custom payer name';
                        paymentPayerNameInput.value = '';
                        paymentPayerNameInput.focus();
                    }
                });

                // Handle group selection change
                paymentGroupSelect.addEventListener('change', (e) => {
                    const groupId = e.target.value;
                    if (groupId && useGroupNameCheckbox.checked) {
                        // Only auto-fill if checkbox is checked
                        const selectedOption = e.target.options[e.target.selectedIndex];
                        const groupName = selectedOption.text;
                        paymentPayerNameInput.value = groupName;
                    } else if (!groupId) {
                        paymentPayerNameInput.value = '';
                    }
                });
            }
        }, 100);
    },

    /**
     * Create payment
     */
    async createPayment() {
        try {
            if (!this.currentFund) return;

            const groupId = document.getElementById('paymentGroup').value;
            const amount = document.getElementById('paymentAmount').value;
            const isPledge = document.getElementById('paymentIsPledge').checked;
            const date = document.getElementById('paymentDate').value;
            const payerName = document.getElementById('paymentPayerName').value.trim();
            const paymentMethod = document.getElementById('paymentMethod').value;
            const referenceNumber = document.getElementById('paymentReference').value.trim();
            const note = document.getElementById('paymentNote').value.trim();

            if (!groupId) {
                Toast.error('Please select a group');
                return;
            }

            if (!amount || parseFloat(amount) <= 0) {
                Toast.error('Please enter a valid amount');
                return;
            }

            if (!date) {
                Toast.error('Please select a date');
                return;
            }

            if (!paymentMethod) {
                Toast.error('Please select a payment method');
                return;
            }

            Loading.show();

            const paymentId = await this.getDB().createPayment({
                fundId: this.currentFund,
                groupId,
                amount,
                isPledge,
                date,
                payerName,
                paymentMethod,
                referenceNumber,
                note
            });

            Modal.close();
            Loading.hide();
            Toast.success('Payment recorded successfully!');

            // Schedule background sync
            this.scheduleSyncToBackend();

            // Refresh fund detail
            await this.viewFundDetail(this.currentFund);

            // Sync to backend in background (non-blocking)
            if (window.ApiService?.config.isConfigured && navigator.onLine) {
                this.getDB().getPayment(paymentId).then(payment => {
                    return window.ApiService.recordPayment(payment);
                }).then(() => {
                    console.log('✅ Payment synced to backend:', paymentId);
                }).catch(error => {
                    console.warn('⚠️ Background sync failed for payment:', paymentId, error);
                });
            }

        } catch (error) {
            console.error('Error creating payment:', error);
            Toast.error(error.message || 'Failed to record payment');
            Loading.hide();
        }
    },

    /**
     * Show add pledge modal
     */
    async showAddPledgeModal() {
        if (!this.currentFund) return;

        // Populate groups dropdown
        const groups = await this.getDB().getGroupsByFund(this.currentFund);
        const groupOptions = groups.map(g => `<option value="${g.id}">${Utils.sanitizeHTML(g.name)}</option>`).join('');

        const formHTML = `
            <form id="formAddPledge">
                <div class="form-group">
                    <label for="pledgeGroup">Group *</label>
                    <select id="pledgeGroup" class="form-control" required>
                        <option value="">Select group...</option>
                        ${groupOptions}
                    </select>
                </div>
                <div class="form-group">
                    <label for="pledgeAmount">Pledge Amount *</label>
                    <input type="number" id="pledgeAmount" class="form-control" required min="0" step="0.01" placeholder="0.00">
                </div>
                <div class="form-group">
                    <label for="pledgeDescription">Description</label>
                    <textarea id="pledgeDescription" class="form-control" placeholder="Additional details about this pledge"></textarea>
                </div>
            </form>
        `;

        Modal.show({
            title: 'Add Pledge',
            content: formHTML,
            size: 'medium',
            buttons: [
                {
                    text: 'Cancel',
                    className: 'btn btn-outline',
                    onClick: () => true
                },
                {
                    text: 'Save Pledge',
                    className: 'btn btn-primary',
                    onClick: () => {
                        this.createPledge();
                        return false; // Don't auto-close
                    }
                }
            ]
        });
    },

    /**
     * Create pledge
     */
    async createPledge() {
        try {
            if (!this.currentFund) return;

            const groupId = document.getElementById('pledgeGroup').value;
            const amount = document.getElementById('pledgeAmount').value;
            const description = document.getElementById('pledgeDescription').value.trim();

            if (!groupId) {
                Toast.error('Please select a group');
                return;
            }

            if (!amount || parseFloat(amount) <= 0) {
                Toast.error('Please enter a valid amount');
                return;
            }

            Loading.show();

            const pledgeId = await this.getDB().createPledge({
                fundId: this.currentFund,
                groupId,
                amount,
                description
            });

            Modal.close();
            Loading.hide();
            Toast.success('Pledge recorded successfully!');

            // Refresh fund detail
            await this.viewFundDetail(this.currentFund);

        } catch (error) {
            console.error('Error creating pledge:', error);
            Toast.error(error.message || 'Failed to record pledge');
            Loading.hide();
        }
    },

    /**
     * Switch fund type
     */
    async switchFundType() {
        if (!this.currentFund) return;

        const fund = await this.getDB().getFund(this.currentFund);
        const newType = fund.type === 'allocated' ? 'open' : 'allocated';

        Confirm.show(
            `Are you sure you want to switch this fund to ${newType} type? This will ${newType === 'open' ? 'remove the goal' : 'set a goal based on current data'}.`,
            async () => {
                try {
                    Loading.show();
                    await this.getDB().switchFundType(this.currentFund);
                    Toast.success('Fund type switched successfully!');
                    await this.viewFundDetail(this.currentFund);
                    Loading.hide();
                } catch (error) {
                    console.error('Error switching fund type:', error);
                    Toast.error(error.message || 'Failed to switch fund type');
                    Loading.hide();
                }
            }
        );
    },

    /**
     * Show export modal for fund
     */
    async exportFund() {
        if (!this.currentFund) return;
        this.showFundExportModal(this.currentFund);
    },

    /**
     * Show fund export modal
     */
    async showFundExportModal(fundId) {
        try {
            const details = await this.getDB().getFundDetails(fundId);
            const { fund } = details;

            const formHTML = `
                <div class="export-info">
                    <h4>📊 Export Fund Data</h4>
                    <p>Export "${Utils.sanitizeHTML(fund.name)}" data in your preferred format</p>
                </div>

                <form id="exportForm">
                    <!-- Format Selection -->
                    <div class="export-section">
                        <h4>📁 Select Export Format</h4>
                        <div class="format-options">
                            <label class="format-option">
                                <input type="radio" name="exportFormat" value="pdf" checked>
                                <div class="format-card">
                                    <span class="format-icon">📄</span>
                                    <div class="format-name">PDF</div>
                                    <div class="format-desc">Professional report</div>
                                </div>
                            </label>
                            <label class="format-option">
                                <input type="radio" name="exportFormat" value="csv">
                                <div class="format-card">
                                    <span class="format-icon">📊</span>
                                    <div class="format-name">CSV</div>
                                    <div class="format-desc">Spreadsheet compatible</div>
                                </div>
                            </label>
                            <label class="format-option">
                                <input type="radio" name="exportFormat" value="json">
                                <div class="format-card">
                                    <span class="format-icon">🔧</span>
                                    <div class="format-name">JSON</div>
                                    <div class="format-desc">Developer friendly</div>
                                </div>
                            </label>
                        </div>
                    </div>

                    <!-- Date Range Filter -->
                    <div class="export-section">
                        <h4>📅 Date Range (Optional)</h4>
                        <div class="form-row">
                            <div class="form-group">
                                <label for="exportStartDate">From Date</label>
                                <input type="date" id="exportStartDate" class="form-control">
                            </div>
                            <div class="form-group">
                                <label for="exportEndDate">To Date</label>
                                <input type="date" id="exportEndDate" class="form-control">
                            </div>
                        </div>
                    </div>

                    <!-- Group Sorting -->
                    <div class="export-section">
                        <h4>📊 Group Sorting</h4>
                        <div class="form-group">
                            <label for="exportGroupSort">Sort groups by:</label>
                            <select id="exportGroupSort" class="form-control">
                                <option value="most-contributed" selected>Most Contributed First</option>
                                <option value="least-contributed">Least Contributed First</option>
                                <option value="alphabetical">Alphabetical (A-Z)</option>
                                <option value="remaining-desc">Highest Remaining Balance First</option>
                            </select>
                        </div>
                    </div>

                    <!-- Export Notes -->
                    <div class="export-section">
                        <h4>📝 Notes (Optional)</h4>
                        <textarea id="exportNotes" class="form-control" rows="3"
                                  placeholder="Add any notes or comments about this export..."></textarea>
                    </div>
                </form>
            `;

            Modal.show({
                title: 'Export Fund',
                content: formHTML,
                size: 'medium',
                buttons: [
                    {
                        text: 'Cancel',
                        className: 'btn btn-outline',
                        onClick: () => true
                    },
                    {
                        text: 'Export',
                        className: 'btn btn-primary',
                        onClick: () => {
                            this.handleFundExport(fundId);
                            return false;
                        }
                    }
                ]
            });
        } catch (error) {
            console.error('Error showing export modal:', error);
            Toast.error('Failed to show export modal');
        }
    },

    /**
     * Handle fund export based on selected format
     */
    async handleFundExport(fundId) {
        try {
            const format = document.querySelector('input[name="exportFormat"]:checked').value;
            const startDate = document.getElementById('exportStartDate').value;
            const endDate = document.getElementById('exportEndDate').value;
            const notes = document.getElementById('exportNotes').value.trim();
            const groupSort = document.getElementById('exportGroupSort')?.value || 'most-contributed';

            Loading.show();

            const details = await this.getDB().getFundDetails(fundId);
            const { fund, groups, payments } = details;

            // Get pledges for this fund
            const pledges = await this.getDB().getPledgesByFund(fundId);

            // Filter payments by date if specified
            let filteredPayments = payments;
            if (startDate || endDate) {
                filteredPayments = payments.filter(payment => {
                    const paymentDate = new Date(payment.date);
                    const start = startDate ? new Date(startDate) : new Date('1900-01-01');
                    const end = endDate ? new Date(endDate) : new Date('2100-12-31');
                    return paymentDate >= start && paymentDate <= end;
                });
            }

            const timestamp = Utils.formatDate(Date.now(), 'iso');
            const baseFilename = `${fund.name.replace(/[^a-z0-9]/gi, '_')}_${timestamp}`;

            switch (format) {
                case 'pdf':
                    this.exportFundToPDF(fund, groups, filteredPayments, pledges, notes, groupSort);
                    break;
                case 'csv':
                    this.exportFundToCSV(fund, groups, filteredPayments, pledges, notes, baseFilename);
                    break;
                case 'json':
                    this.exportFundToJSON(fund, groups, filteredPayments, pledges, notes, baseFilename);
                    break;
            }

            Modal.close();
            Loading.hide();
            Toast.success(`Fund exported as ${format.toUpperCase()} successfully!`);
        } catch (error) {
            console.error('Error exporting fund:', error);
            Toast.error('Failed to export fund');
            Loading.hide();
        }
    },

    /**
     * Export fund to PDF
     */
    exportFundToPDF(fund, groups, payments, pledges, notes, groupSort = 'most-contributed') {
        const totalPledged = fund.totalPledged || 0;
        const progress = fund.type === 'allocated' ?
            Utils.calculatePercentage(fund.totalCollected, fund.totalGoal) : 0;

        // Prepare PDF sections
        const sections = [];

        // Summary section
        const summaryData = [];
        summaryData.push({ label: 'Total Collected', value: Utils.formatCurrency(fund.totalCollected) });
        if (totalPledged > 0) {
            summaryData.push({ label: 'Total Pledged', value: Utils.formatCurrency(totalPledged) });
        }
        if (fund.type === 'allocated') {
            summaryData.push({ label: 'Total Goal', value: Utils.formatCurrency(fund.totalGoal) });
            const difference = fund.totalGoal - fund.totalCollected;
            const isExceeded = difference < 0;
            const amount = Math.abs(difference);
            const label = isExceeded ? 'Exceeded' : 'Remaining';
            summaryData.push({ label: label, value: Utils.formatCurrency(amount) });
            summaryData.push({ label: 'Progress', value: `${progress}%` });
        }
        summaryData.push({ label: 'Total Groups', value: groups.length });
        summaryData.push({ label: 'Total Payments', value: payments.length });
        if (pledges && pledges.length > 0) {
            summaryData.push({ label: 'Total Pledges', value: pledges.length });
        }

        sections.push({
            title: 'Fund Summary',
            summary: summaryData
        });

        // Groups section
        if (groups.length > 0) {
            const groupsData = groups.map(group => {
                const totalPaid = group.totalPaid || 0;
                const totalPledged = group.totalPledged || 0;
                const groupProgress = fund.type === 'allocated' && group.allocation ?
                    Utils.calculatePercentage(totalPaid, group.allocation) : 0;

                const row = {
                    name: group.name,
                    totalPaid: totalPaid
                };

                if (totalPledged > 0) {
                    row.totalPledged = totalPledged;
                }

                if (fund.type === 'allocated') {
                    row.allocation = group.allocation;
                    const difference = group.allocation - totalPaid;
                    const isExceeded = difference < 0;
                    row.remaining = Math.abs(difference) + (isExceeded ? ' exceeded' : '');
                    row.progress = `${groupProgress}%`;
                }

                return row;
            });

            // Sort groups based on user selection
            switch(groupSort) {
                case 'most-contributed':
                    groupsData.sort((a, b) => b.totalPaid - a.totalPaid);
                    break;
                case 'least-contributed':
                    groupsData.sort((a, b) => a.totalPaid - b.totalPaid);
                    break;
                case 'remaining-desc':
                    groupsData.sort((a, b) => (b.remaining || 0) - (a.remaining || 0));
                    break;
                case 'alphabetical':
                    groupsData.sort((a, b) => a.name.localeCompare(b.name));
                    break;
                default:
                    // Default to most contributed
                    groupsData.sort((a, b) => b.totalPaid - a.totalPaid);
            }

            sections.push({
                title: 'Groups Breakdown',
                data: groupsData
            });
        }

        // Payments section
        if (payments.length > 0) {
            const paymentsData = payments.map(payment => {
                const group = groups.find(g => g.id === payment.groupId);
                return {
                    date: payment.date,
                    group: group ? group.name : 'Unknown',
                    amount: payment.amount,
                    payerName: payment.payerName || 'N/A',
                    paymentMethod: payment.paymentMethod,
                    referenceNumber: payment.referenceNumber || 'N/A'
                };
            });

            sections.push({
                title: 'Payment History',
                data: paymentsData
            });
        }

        // Pledges section
        if (pledges && pledges.length > 0) {
            const pledgesData = pledges.map(pledge => {
                const group = groups.find(g => g.id === pledge.groupId);
                return {
                    group: group ? group.name : 'Unknown',
                    amount: pledge.amount,
                    description: pledge.description || 'N/A',
                    createdAt: Utils.formatDate(pledge.createdAt)
                };
            });

            sections.push({
                title: 'Pledges',
                data: pledgesData
            });
        }

        // Generate PDF HTML
        const htmlContent = Utils.generatePDFHTML({
            title: 'ContributionTracker Pro',
            subtitle: `${fund.name} - Export Report`,
            notes: notes,
            sections: sections,
            metadata: {
                recordCount: payments.length + (pledges ? pledges.length : 0)
            }
        });

        // Open PDF window
        Utils.openPDFWindow(htmlContent);
    },

    /**
     * Export fund to CSV
     */
    exportFundToCSV(fund, groups, payments, pledges, notes, filename) {
        const exportData = payments.map(payment => {
            const group = groups.find(g => g.id === payment.groupId);
            return {
                type: 'Payment',
                fund: fund.name,
                group: group ? group.name : 'Unknown',
                amount: payment.amount,
                date: payment.date,
                payerName: payment.payerName || 'N/A',
                paymentMethod: payment.paymentMethod,
                referenceNumber: payment.referenceNumber || 'N/A',
                note: payment.note || 'N/A'
            };
        });

        // Add pledges to export data
        if (pledges && pledges.length > 0) {
            const pledgeData = pledges.map(pledge => {
                const group = groups.find(g => g.id === pledge.groupId);
                return {
                    type: 'Pledge',
                    fund: fund.name,
                    group: group ? group.name : 'Unknown',
                    amount: pledge.amount,
                    date: Utils.formatDate(pledge.createdAt),
                    payerName: 'N/A',
                    paymentMethod: 'N/A',
                    referenceNumber: 'N/A',
                    note: pledge.description || 'N/A'
                };
            });
            exportData.push(...pledgeData);
        }

        Utils.exportToCSV(exportData, `${filename}.csv`, {
            title: `${fund.name} - Fund Export`,
            metadata: {
                totalRecords: payments.length + (pledges ? pledges.length : 0),
                payments: payments.length,
                pledges: pledges ? pledges.length : 0
            },
            notes: notes
        });
    },

    /**
     * Export fund to JSON
     */
    exportFundToJSON(fund, groups, payments, pledges, notes, filename) {
        const exportData = {
            fund: {
                name: fund.name,
                type: fund.type,
                description: fund.description,
                totalGoal: fund.totalGoal,
                totalCollected: fund.totalCollected,
                totalPledged: fund.totalPledged || 0,
                createdAt: fund.createdAt
            },
            groups: groups,
            payments: payments,
            pledges: pledges || [],
            _metadata: {
                exportDate: new Date().toISOString(),
                totalGroups: groups.length,
                totalPayments: payments.length,
                totalPledges: pledges ? pledges.length : 0,
                notes: notes || null
            }
        };

        Utils.exportToJSON(exportData, `${filename}.json`);
    },

    /**
     * Show export modal for all payments
     */
    async showPaymentsExportModal() {
        // Set default date range (last 30 days)
        const endDate = new Date();
        const startDate = new Date();
        startDate.setDate(endDate.getDate() - 30);

        const startDateStr = startDate.toISOString().split('T')[0];
        const endDateStr = endDate.toISOString().split('T')[0];

        const formHTML = `
            <div class="export-info">
                <h4>💳 Export All Payments</h4>
                <p>Export payment data across all funds in your preferred format</p>
            </div>

            <form id="exportPaymentsForm">
                <!-- Time Range Selection -->
                <div class="form-section">
                    <h4>📅 Time Range</h4>
                    <div class="time-range-presets">
                        <button type="button" class="time-preset-btn" data-range="7">Last 7 days</button>
                        <button type="button" class="time-preset-btn active" data-range="30">Last 30 days</button>
                        <button type="button" class="time-preset-btn" data-range="90">Last 3 months</button>
                        <button type="button" class="time-preset-btn" data-range="180">Last 6 months</button>
                        <button type="button" class="time-preset-btn" data-range="365">Last year</button>
                        <button type="button" class="time-preset-btn" data-range="all">All time</button>
                    </div>
                    <div class="custom-date-range">
                        <div class="form-group">
                            <label>From Date:</label>
                            <input type="date" id="exportPaymentsStartDate" class="form-control" value="${startDateStr}">
                        </div>
                        <div class="form-group">
                            <label>To Date:</label>
                            <input type="date" id="exportPaymentsEndDate" class="form-control" value="${endDateStr}">
                        </div>
                    </div>
                </div>

                <!-- Format Selection -->
                <div class="form-section">
                    <h4>📁 Export Format</h4>
                    <div class="format-options">
                        <label class="format-option">
                            <input type="radio" name="exportFormat" value="pdf" checked>
                            <div class="format-card">
                                <div class="format-icon">📄</div>
                                <div class="format-name">PDF</div>
                                <div class="format-desc">Professional report</div>
                            </div>
                        </label>
                        <label class="format-option">
                            <input type="radio" name="exportFormat" value="csv">
                            <div class="format-card">
                                <div class="format-icon">📊</div>
                                <div class="format-name">CSV</div>
                                <div class="format-desc">Spreadsheet compatible</div>
                            </div>
                        </label>
                        <label class="format-option">
                            <input type="radio" name="exportFormat" value="json">
                            <div class="format-card">
                                <div class="format-icon">🔧</div>
                                <div class="format-name">JSON</div>
                                <div class="format-desc">Developer friendly</div>
                            </div>
                        </label>
                    </div>
                </div>

                <!-- Progress Display -->
                <div class="progress-section hidden" id="paymentsExportProgress">
                    <div class="progress-bar">
                        <div class="progress-fill" id="paymentsProgressFill"></div>
                    </div>
                    <div class="progress-text" id="paymentsProgressText">Preparing export...</div>
                </div>
            </form>
        `;

        Modal.show({
            title: 'Export Payments',
            content: formHTML,
            size: 'medium',
            buttons: [
                {
                    text: 'Cancel',
                    className: 'btn btn-outline',
                    onClick: () => true
                },
                {
                    text: 'Export',
                    className: 'btn btn-primary',
                    onClick: () => {
                        this.handlePaymentsExport();
                        return false;
                    }
                }
            ]
        });

        // Setup time preset buttons after modal renders
        setTimeout(() => {
            document.querySelectorAll('.time-preset-btn').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    // Update active state
                    document.querySelectorAll('.time-preset-btn').forEach(b => b.classList.remove('active'));
                    e.target.classList.add('active');

                    // Calculate date range
                    const range = e.target.getAttribute('data-range');
                    const end = new Date();
                    const start = new Date();

                    if (range === 'all') {
                        start.setFullYear(2020, 0, 1);
                    } else {
                        start.setDate(end.getDate() - parseInt(range));
                    }

                    document.getElementById('exportPaymentsStartDate').value = start.toISOString().split('T')[0];
                    document.getElementById('exportPaymentsEndDate').value = end.toISOString().split('T')[0];
                });
            });
        }, 50);
    },

    /**
     * Handle payments export based on selected format
     */
    async handlePaymentsExport() {
        const format = document.querySelector('input[name="exportFormat"]:checked')?.value;
        if (!format) {
            Toast.error('Please select an export format');
            return;
        }

        const startDate = document.getElementById('exportPaymentsStartDate').value;
        const endDate = document.getElementById('exportPaymentsEndDate').value;

        // Validate date range
        if (startDate && endDate && new Date(startDate) > new Date(endDate)) {
            Toast.error('Start date must be before end date');
            return;
        }

        // Show progress
        const progress = document.getElementById('paymentsExportProgress');
        const progressFill = document.getElementById('paymentsProgressFill');
        const progressText = document.getElementById('paymentsProgressText');
        const exportBtn = event.target.closest('.btn-primary');

        try {
            exportBtn.disabled = true;
            progress.classList.remove('hidden');

            // Step 1: Collect data
            progressFill.style.width = '20%';
            progressText.textContent = 'Collecting payments...';
            await this.sleep(300);

            // Get all payments across all funds
            const funds = await this.getDB().getAllFunds();
            let allPayments = [];

            for (const fund of funds) {
                const details = await this.getDB().getFundDetails(fund.id);
                const paymentsWithFund = details.payments.map(payment => ({
                    ...payment,
                    fundName: fund.name,
                    fundType: fund.type,
                    groupName: details.groups.find(g => g.id === payment.groupId)?.name || 'Unknown'
                }));
                allPayments = allPayments.concat(paymentsWithFund);
            }

            // Filter payments by date
            if (startDate && endDate) {
                const start = new Date(startDate);
                const end = new Date(endDate);
                end.setHours(23, 59, 59, 999);

                allPayments = allPayments.filter(payment => {
                    const paymentDate = new Date(payment.date);
                    return paymentDate >= start && paymentDate <= end;
                });
            }

            // Sort by date (newest first)
            allPayments.sort((a, b) => new Date(b.date) - new Date(a.date));

            // Step 2: Process data
            progressFill.style.width = '50%';
            progressText.textContent = 'Processing data...';
            await this.sleep(300);

            const timestamp = new Date().toISOString().split('T')[0];

            // Step 3: Generate export
            progressFill.style.width = '80%';
            progressText.textContent = `Generating ${format.toUpperCase()}...`;
            await this.sleep(300);

            switch (format) {
                case 'pdf':
                    this.exportPaymentsToPDF(allPayments, startDate, endDate, timestamp);
                    break;
                case 'csv':
                    this.exportPaymentsToCSV(allPayments, timestamp);
                    break;
                case 'json':
                    this.exportPaymentsToJSON(allPayments, timestamp);
                    break;
            }

            // Step 4: Complete
            progressFill.style.width = '100%';
            progressText.textContent = 'Export complete!';
            await this.sleep(500);

            Modal.close();
            Toast.success(`Payments exported successfully!`);
        } catch (error) {
            console.error('Error exporting payments:', error);
            Toast.error('Failed to export payments');
        } finally {
            if (exportBtn) exportBtn.disabled = false;
            if (progress) progress.classList.add('hidden');
        }
    },


    /**
     * Export payments to PDF
     */
    exportPaymentsToPDF(payments, startDate, endDate, timestamp) {
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF();

        // Calculate metrics
        const totalAmount = payments.reduce((sum, p) => sum + p.amount, 0);
        const paymentMethods = {};
        const fundBreakdown = {};

        payments.forEach(p => {
            // Payment methods
            paymentMethods[p.paymentMethod] = (paymentMethods[p.paymentMethod] || 0) + 1;
            // Fund breakdown
            fundBreakdown[p.fundName] = (fundBreakdown[p.fundName] || 0) + p.amount;
        });

        // ===== HEADER SECTION WITH BRAND COLOR =====
        doc.setFillColor(16, 185, 129); // Emerald green
        doc.rect(0, 0, 210, 30, 'F');

        doc.setTextColor(255, 255, 255);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(20);
        doc.text('Payments Report', 15, 15);

        doc.setFontSize(9);
        doc.setFont('helvetica', 'normal');
        doc.text(`Generated on ${new Date().toLocaleString()}`, 15, 23);

        // ===== METADATA SECTION =====
        doc.setTextColor(100, 100, 100);
        doc.setFontSize(10);
        let yPos = 38;
        doc.text(`Report Period: ${startDate && endDate ? `${startDate} to ${endDate}` : 'All Time'}`, 15, yPos);

        // ===== EXECUTIVE SUMMARY BOX =====
        yPos = 50;
        doc.setDrawColor(16, 185, 129);
        doc.setLineWidth(0.5);
        doc.rect(15, yPos, 180, 40);

        doc.setFontSize(14);
        doc.setTextColor(16, 185, 129);
        doc.setFont('helvetica', 'bold');
        doc.text('Executive Summary', 20, yPos + 8);

        // Summary metrics in two columns
        doc.setFontSize(11);
        doc.setTextColor(0, 0, 0);
        doc.setFont('helvetica', 'normal');

        doc.text(`Total Amount Collected:`, 20, yPos + 18);
        doc.setFont('helvetica', 'bold');
        doc.text(`${Utils.formatCurrency(totalAmount)}`, 95, yPos + 18);

        doc.setFont('helvetica', 'normal');
        doc.text(`Total Payments:`, 20, yPos + 26);
        doc.setFont('helvetica', 'bold');
        doc.text(`${payments.length}`, 95, yPos + 26);

        doc.setFont('helvetica', 'normal');
        doc.text(`Payment Methods:`, 20, yPos + 34);
        doc.setFont('helvetica', 'bold');
        doc.text(`${Object.keys(paymentMethods).length}`, 95, yPos + 34);

        // ===== PAYMENT METHODS BREAKDOWN =====
        yPos += 50;
        doc.setFontSize(12);
        doc.setTextColor(16, 185, 129);
        doc.setFont('helvetica', 'bold');
        doc.text('Payment Methods Distribution', 15, yPos);

        yPos += 8;
        doc.setFontSize(10);
        doc.setTextColor(0, 0, 0);
        doc.setFont('helvetica', 'normal');

        Object.entries(paymentMethods).forEach(([method, count]) => {
            const percentage = ((count / payments.length) * 100).toFixed(1);
            doc.text(`• ${method}: ${count} payments (${percentage}%)`, 20, yPos);
            yPos += 6;
        });

        // ===== FUND BREAKDOWN SECTION =====
        yPos += 8;
        doc.setFontSize(12);
        doc.setTextColor(16, 185, 129);
        doc.setFont('helvetica', 'bold');
        doc.text('Fund Breakdown', 15, yPos);

        yPos += 8;
        doc.setFontSize(10);
        doc.setTextColor(0, 0, 0);
        doc.setFont('helvetica', 'normal');

        Object.entries(fundBreakdown).forEach(([fund, amount]) => {
            const percentage = ((amount / totalAmount) * 100).toFixed(1);
            doc.text(`• ${fund}: ${Utils.formatCurrency(amount)} (${percentage}%)`, 20, yPos);
            yPos += 6;

            if (yPos > 270) {
                doc.addPage();
                yPos = 20;
            }
        });

        // ===== DETAILED PAYMENTS TABLE =====
        if (yPos > 200) {
            doc.addPage();
            yPos = 20;
        } else {
            yPos += 10;
        }

        doc.setFontSize(12);
        doc.setTextColor(16, 185, 129);
        doc.setFont('helvetica', 'bold');
        doc.text('Detailed Payment Records', 15, yPos);

        yPos += 10;

        // Table headers
        doc.setFillColor(240, 240, 240);
        doc.rect(15, yPos - 5, 180, 8, 'F');

        doc.setFontSize(9);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(0, 0, 0);
        doc.text('Date', 17, yPos);
        doc.text('Fund', 40, yPos);
        doc.text('Group', 75, yPos);
        doc.text('Payer', 110, yPos);
        doc.text('Amount', 145, yPos);
        doc.text('Method', 170, yPos);

        yPos += 8;

        // Table rows
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8);

        payments.forEach((payment, index) => {
            if (yPos > 275) {
                doc.addPage();
                yPos = 20;

                // Repeat headers on new page
                doc.setFillColor(240, 240, 240);
                doc.rect(15, yPos - 5, 180, 8, 'F');
                doc.setFont('helvetica', 'bold');
                doc.setFontSize(9);
                doc.text('Date', 17, yPos);
                doc.text('Fund', 40, yPos);
                doc.text('Group', 75, yPos);
                doc.text('Payer', 110, yPos);
                doc.text('Amount', 145, yPos);
                doc.text('Method', 170, yPos);
                yPos += 8;
                doc.setFont('helvetica', 'normal');
                doc.setFontSize(8);
            }

            // Zebra striping
            if (index % 2 === 0) {
                doc.setFillColor(250, 250, 250);
                doc.rect(15, yPos - 4, 180, 6, 'F');
            }

            const dateStr = payment.date ? (typeof payment.date === 'string' ? payment.date : new Date(payment.date).toISOString().split('T')[0]) : 'N/A';
            doc.text(dateStr, 17, yPos);
            doc.text((payment.fundName || '').substring(0, 15), 40, yPos);
            doc.text((payment.groupName || '').substring(0, 15), 75, yPos);
            doc.text((payment.payerName || 'N/A').substring(0, 15), 110, yPos);
            doc.text(String(Utils.formatCurrency(payment.amount)), 145, yPos);
            doc.text((payment.paymentMethod || 'N/A').substring(0, 10), 170, yPos);

            yPos += 6;
        });

        // ===== FOOTER =====
        const pageCount = doc.internal.getNumberOfPages();
        for (let i = 1; i <= pageCount; i++) {
            doc.setPage(i);
            doc.setFontSize(8);
            doc.setTextColor(150, 150, 150);
            doc.setFont('helvetica', 'normal');
            doc.text(`Page ${i} of ${pageCount}`, 15, 290);
            doc.text(`ContributionTracker Pro - Payments Report`, 105, 290, { align: 'center' });
            doc.text(new Date().toLocaleDateString(), 195, 290, { align: 'right' });
        }

        doc.save(`payments-report-${timestamp}.pdf`);
    },

    /**
     * Export payments to CSV
     */
    exportPaymentsToCSV(payments, timestamp) {
        const safeTimestamp = timestamp || new Date().toISOString().split('T')[0];

        let csvContent = 'Date,Fund,Group,Payer,Amount,Method,Reference\n';
        payments.forEach(p => {
            csvContent += `${p.date},"${p.fundName}","${p.groupName}","${p.payerName || 'N/A'}",${p.amount},"${p.paymentMethod}","${p.referenceNumber || 'N/A'}"\n`;
        });

        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        const url = URL.createObjectURL(blob);

        link.setAttribute('href', url);
        link.setAttribute('download', `payments_${safeTimestamp}.csv`);
        link.style.visibility = 'hidden';

        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    },


    /**
     * Export payments to JSON
     */
    exportPaymentsToJSON(payments, timestamp) {
        const safeTimestamp = timestamp || new Date().toISOString().split('T')[0];

        const exportData = {
            exportDate: new Date().toISOString(),
            totalPayments: payments.length,
            totalAmount: payments.reduce((sum, p) => sum + p.amount, 0),
            payments: payments
        };

        const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
        const link = document.createElement('a');
        const url = URL.createObjectURL(blob);

        link.setAttribute('href', url);
        link.setAttribute('download', `payments_${safeTimestamp}.json`);
        link.style.visibility = 'hidden';

        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    },

    /**
     * Export Fund Summary Report
     */
    async exportFundReport() {
        try {
            Loading.show();

            const funds = await this.getDB().getAllFunds();
            const sections = [];

            // Overall summary
            const totalCollected = funds.reduce((sum, f) => sum + f.totalCollected, 0);
            const totalGoal = funds.reduce((sum, f) => sum + (f.totalGoal || 0), 0);
            const avgProgress = funds.length > 0 ?
                funds.reduce((sum, f) => {
                    const progress = f.type === 'allocated' && f.totalGoal > 0 ?
                        (f.totalCollected / f.totalGoal) * 100 : 0;
                    return sum + progress;
                }, 0) / funds.filter(f => f.type === 'allocated').length : 0;

            const summaryData = [
                { label: 'Total Funds', value: funds.length },
                { label: 'Total Collected', value: Utils.formatCurrency(totalCollected) },
                { label: 'Total Goal', value: Utils.formatCurrency(totalGoal) },
                { label: 'Average Progress', value: `${avgProgress.toFixed(1)}%` }
            ];

            sections.push({
                title: 'Overall Summary',
                summary: summaryData
            });

            // Funds breakdown
            const fundsData = funds.map(fund => {
                const progress = fund.type === 'allocated' && fund.totalGoal > 0 ?
                    Utils.calculatePercentage(fund.totalCollected, fund.totalGoal) : 0;

                const row = {
                    name: fund.name,
                    type: fund.type === 'allocated' ? 'Allocated' : 'Open',
                    totalCollected: fund.totalCollected
                };

                if (fund.type === 'allocated') {
                    row.totalGoal = fund.totalGoal;
                    row.remaining = fund.totalGoal - fund.totalCollected;
                    row.progress = `${progress}%`;
                }

                return row;
            });

            sections.push({
                title: 'Funds Breakdown',
                data: fundsData
            });

            const htmlContent = Utils.generatePDFHTML({
                title: 'ContributionTracker Pro',
                subtitle: 'Fund Summary Report',
                sections: sections,
                metadata: {
                    recordCount: funds.length
                }
            });

            Utils.openPDFWindow(htmlContent);
            Loading.hide();
            Toast.success('Fund Summary Report generated!');
        } catch (error) {
            console.error('Error exporting fund report:', error);
            Toast.error('Failed to export fund report');
            Loading.hide();
        }
    },

    /**
     * Export Payment History Report
     */
    async exportPaymentHistoryReport() {
        // Use the same function as payments export
        this.showPaymentsExportModal();
    },

    /**
     * ==========================================
     * BACKEND INTEGRATION FUNCTIONS
     * ==========================================
     */

    /**
     * Connect to Google Sheets Backend
     */
    async connectBackend() {
        const urlInput = document.getElementById('googleAppsScriptUrl');
        const idInput = document.getElementById('googleSpreadsheetId');

        const scriptUrl = urlInput?.value.trim();
        const spreadsheetId = idInput?.value.trim();

        if (!scriptUrl || !spreadsheetId) {
            Toast.error('Please enter both Script URL and Spreadsheet ID');
            return;
        }

        this.updateBackendPillStatus('pill-connect', 'loading');
        Loading.show();

        try {
            // Initialize API service
            if (window.ApiService) {
                window.ApiService.init(scriptUrl, spreadsheetId);

                // Save to settings
                await this.getDB().updateSettings({
                    googleAppsScriptUrl: scriptUrl,
                    googleSpreadsheetId: spreadsheetId
                });

                // Test connection
                const result = await window.ApiService.testConnection();

                if (result.success) {
                    this.updateBackendPillStatus('pill-connect', 'success');
                    document.getElementById('connectionStatus').style.display = 'flex';
                    Toast.success('Connected to Google Sheets successfully!');
                    this.enableBackendPills(['pill-test', 'pill-setup', 'pill-sync', 'pill-pull']);
                } else {
                    throw new Error(result.message || 'Connection test failed');
                }
            } else {
                throw new Error('API Service not loaded. Please ensure api-service.js is included.');
            }
        } catch (error) {
            console.error('Connection failed:', error);
            this.updateBackendPillStatus('pill-connect', 'error');
            Toast.error(`Connection failed: ${error.message}`);
        } finally {
            Loading.hide();
        }
    },

    /**
     * Test backend connection
     */
    async testBackendConnection() {
        if (!window.ApiService?.config.isConfigured) {
            Toast.warning('Please connect to backend first');
            return;
        }

        this.updateBackendPillStatus('pill-test', 'loading');
        Loading.show();

        try {
            const startTime = performance.now();
            const result = await window.ApiService.testConnection();
            const responseTime = Math.round(performance.now() - startTime);

            if (result.success) {
                this.updateBackendPillStatus('pill-test', 'success');
                Toast.success(`Backend connection verified! (${responseTime}ms)`);

                setTimeout(() => {
                    const url = window.ApiService.getApiUrl();
                    const shortUrl = url ? url.substring(0, 50) + '...' : 'Unknown';
                    Toast.info(`Connected to: ${shortUrl}`);
                }, 1500);
            } else {
                throw new Error(result.message || 'Connection test failed');
            }
        } catch (error) {
            console.error('Test failed:', error);
            this.updateBackendPillStatus('pill-test', 'error');
            Toast.error(`Test failed: ${error.message}`);

            setTimeout(() => {
                Toast.info('💡 Tip: Check your Google Apps Script URL and deployment settings');
            }, 2000);
        } finally {
            Loading.hide();
        }
    },

    /**
     * Setup backend sheets structure
     */
    async setupBackend() {
        if (!window.ApiService?.config.isConfigured) {
            Toast.warning('Please connect to backend first');
            return;
        }

        this.updateBackendPillStatus('pill-setup', 'loading');
        Loading.show();
        Toast.info('Setting up backend database...');

        try {
            const result = await window.ApiService.setupSheets();

            if (result.success) {
                this.updateBackendPillStatus('pill-setup', 'success');
                Toast.success('Sheets structure created successfully!');

                setTimeout(() => {
                    Toast.success('📊 Database ready: Funds, Payments, Expenses & Reports');
                }, 1500);

                this.enableBackendPills(['pill-sync', 'pill-pull']);
            } else {
                throw new Error(result.error || 'Setup failed');
            }
        } catch (error) {
            console.error('Setup failed:', error);
            this.updateBackendPillStatus('pill-setup', 'error');
            Toast.error(`Setup failed: ${error.message}`);

            setTimeout(() => {
                Toast.info('💡 Tip: Check your Google Apps Script permissions and try again');
            }, 2000);
        } finally {
            Loading.hide();
        }
    },

    /**
     * Set sync status and update UI chip
     * @param {string} status - 'pending', 'syncing', 'synced', 'error'
     */
    _setSyncStatus(status) {
        this._syncStatus = status;
        const chip = document.getElementById('syncStatusChip');
        if (!chip) return;

        const labels = {
            pending: { text: '● Unsynced', class: 'pending' },
            syncing: { text: '↑ Syncing…', class: 'syncing' },
            synced: { text: '✓ Synced', class: 'synced' },
            error: { text: '✕ Sync failed', class: 'error' }
        };

        const config = labels[status] || labels.synced;

        chip.className = `sync-status-chip ${config.class}`;
        chip.textContent = config.text;
        chip.style.display = status ? 'inline-flex' : 'none';

        // Auto-hide "synced" status after 5 seconds
        if (status === 'synced') {
            clearTimeout(this._syncStatusChipTimer);
            this._syncStatusChipTimer = setTimeout(() => {
                chip.style.display = 'none';
            }, 5000);
        }
    },

    /**
     * Schedule background sync to backend (debounced)
     */
    scheduleSyncToBackend() {
        if (!window.ApiService?.config.isConfigured) return;

        // Clear existing timer
        clearTimeout(this._syncDebounceTimer);

        // Mark as pending
        this._setSyncStatus('pending');

        // Debounce: wait 15 seconds of inactivity before syncing
        this._syncDebounceTimer = setTimeout(() => {
            this.syncWithBackend(true); // silent = true
        }, 15000);
    },

    /**
     * Sync all data to Google Sheets
     * @param {boolean} silent - If true, don't show loading overlay
     */
    async syncWithBackend(silent = false) {
        if (!window.ApiService?.config.isConfigured) {
            if (!silent) Toast.warning('Please connect to backend first');
            return;
        }

        this._setSyncStatus('syncing');
        this.updateBackendPillStatus('pill-sync', 'loading');

        if (!silent) {
            Loading.show();
            Toast.info('Syncing data to Google Sheets...');
        }

        try {
            // Gather all data
            const funds = await this.getDB().getAllFunds();
            const allGroups = [];
            const allPayments = [];

            for (const fund of funds) {
                const details = await this.getDB().getFundDetails(fund.id);

                // Add fund context to groups
                allGroups.push(...details.groups.map(g => ({
                    ...g,
                    fundId: fund.id,
                    fundName: fund.name
                })));

                // Add fund context to payments (includes both regular payments and pledges)
                allPayments.push(...details.payments.map(p => {
                    const group = details.groups.find(gr => gr.id === p.groupId);
                    return {
                        ...p,
                        fundId: fund.id,
                        fundName: fund.name,
                        groupName: group ? group.name : 'Unknown'
                    };
                }));
            }

            // NOTE: Pledges are already included in allPayments above
            // (getFundDetails returns all payments including those with isPledge=true)
            // No need to fetch pledges separately

            // Get expenses if they exist
            const expenses = await this.getDB().getExpenses?.() || [];

            // Prepare sync payload
            const payload = {
                funds: funds,
                groups: allGroups,
                payments: allPayments,
                expenses: expenses
            };

            // Sync to backend
            const result = await window.ApiService.syncToSheets(payload);

            if (result.success) {
                this._setSyncStatus('synced');
                this.updateBackendPillStatus('pill-sync', 'success');
                const totalRecords = funds.length + allGroups.length + allPayments.length + expenses.length;

                if (!silent) {
                    Toast.success(`Synced ${result.totalProcessed || totalRecords} records to Google Sheets!`);
                }

                if (result.totalErrors > 0) {
                    setTimeout(() => {
                        Toast.warning(`Note: ${result.totalErrors} errors occurred during sync`);
                    }, 1500);
                }
            } else {
                throw new Error(result.error || 'Sync failed');
            }
        } catch (error) {
            console.error('Sync failed:', error);
            this._setSyncStatus('error');
            this.updateBackendPillStatus('pill-sync', 'error');
            if (!silent) {
                Toast.error(`Sync failed: ${error.message}`);
            }
        } finally {
            if (!silent) {
                Loading.hide();
            }
        }
    },

    /**
     * Pull data from Google Sheets
     */
    async pullFromSheets() {
        if (!window.ApiService?.config.isConfigured) {
            Toast.warning('Please connect to backend first');
            return;
        }

        Modal.confirm(
            'This will <strong>replace your local data</strong> with data from Google Sheets.<br><br>Are you sure you want to continue?',
            async () => {
                try {
                    this.updateBackendPillStatus('pill-pull', 'loading');
                    Loading.show();
                    Toast.info('Pulling data from Google Sheets...');

                    const result = await window.ApiService.getAllData();

                    if (result.success && result.data) {
                        const d = result.data;

                        // Clear all relevant stores including pledges
                        await this.getDB().clear('funds');
                        await this.getDB().clear('groups');
                        await this.getDB().clear('payments');
                        await this.getDB().clear('pledges');

                        // Import funds and groups first (without totals, we'll recalculate)
                        if (Array.isArray(d.funds)) {
                            for (const fund of d.funds) {
                                await this.getDB().put('funds', fund);
                            }
                        }

                        if (Array.isArray(d.groups)) {
                            for (const group of d.groups) {
                                await this.getDB().put('groups', group);
                            }
                        }

                        // Split payments by isPledge flag and import
                        if (Array.isArray(d.payments)) {
                            for (const payment of d.payments) {
                                if (payment.isPledge === true) {
                                    // This is a pledge - convert to pledge format and store in pledges
                                    const pledge = {
                                        id: payment.id,
                                        fundId: payment.fundId,
                                        groupId: payment.groupId,
                                        amount: payment.amount || 0,
                                        date: payment.date,
                                        pledgerName: payment.payerName || '',
                                        note: payment.note || '',
                                        fulfilled: false,
                                        createdAt: payment.createdAt || Date.now(),
                                        updatedAt: Date.now()
                                    };
                                    await this.getDB().put('pledges', pledge);
                                } else {
                                    // Regular payment
                                    await this.getDB().put('payments', payment);
                                }
                            }
                        }

                        // Recalculate fund totals from actual payment data
                        const funds = await this.getDB().getAllFunds();
                        const payments = await this.getDB().getAllPayments();
                        const pledges = await this.getDB().getAll('pledges');

                        for (const fund of funds) {
                            // Calculate totalCollected from payments for this fund
                            fund.totalCollected = payments
                                .filter(p => p.fundId === fund.id)
                                .reduce((sum, p) => sum + (p.amount || 0), 0);

                            // Calculate totalPledged from pledges for this fund
                            fund.totalPledged = pledges
                                .filter(pl => pl.fundId === fund.id)
                                .reduce((sum, pl) => sum + (pl.amount || 0), 0);

                            await this.getDB().put('funds', fund);
                        }

                        // Recalculate group totals from actual payment data
                        const groups = await this.getDB().getAll('groups');

                        for (const group of groups) {
                            // Calculate totalPaid from payments for this group
                            group.totalPaid = payments
                                .filter(p => p.groupId === group.id)
                                .reduce((sum, p) => sum + (p.amount || 0), 0);

                            // Calculate totalPledged from pledges for this group
                            group.totalPledged = pledges
                                .filter(pl => pl.groupId === group.id)
                                .reduce((sum, pl) => sum + (pl.amount || 0), 0);

                            await this.getDB().put('groups', group);
                        }

                        // Import expenses if present
                        if (Array.isArray(d.expenses)) {
                            await this.getDB().clear('expenses');
                            for (const expense of d.expenses) {
                                await this.getDB().put('expenses', expense);
                            }
                        }

                        Toast.success('Data pulled and restored from Google Sheets!');
                        this.updateBackendPillStatus('pill-pull', 'success');

                        // Note: Real-time listeners will auto-update cache as data is restored
                    } else {
                        throw new Error(result.error || 'No data returned');
                    }
                } catch (error) {
                    console.error('Pull failed:', error);
                    this.updateBackendPillStatus('pill-pull', 'error');
                    Toast.error(`Pull failed: ${error.message}`);
                } finally {
                    Loading.hide();
                }
            }
        );
    },

    /**
     * Unlink backend - Clear saved backend settings and reset connection
     */
    async unlinkBackend() {
        Modal.confirm(
            'Are you sure you want to unlink the backend? This will remove the connection to Google Sheets but your local data will remain intact.',
            async () => {
                try {
                    Loading.show();

                    // Clear backend settings from database
                    await this.getDB().updateSettings({
                        googleAppsScriptUrl: null,
                        googleSpreadsheetId: null
                    });

                    // Clear input fields
                    const urlInput = document.getElementById('googleAppsScriptUrl');
                    const idInput = document.getElementById('googleSpreadsheetId');

                    if (urlInput) urlInput.value = '';
                    if (idInput) idInput.value = '';

                    // Reset ApiService configuration
                    if (window.ApiService) {
                        window.ApiService.config.webAppUrl = null;
                        window.ApiService.config.spreadsheetId = null;
                        window.ApiService.config.isConfigured = false;
                    }

                    // Hide connection status
                    const statusDiv = document.getElementById('connectionStatus');
                    if (statusDiv) {
                        statusDiv.style.display = 'none';
                    }

                    // Reset all backend pill statuses
                    const pillClasses = ['pill-connect', 'pill-test', 'pill-setup', 'pill-sync', 'pill-pull'];
                    pillClasses.forEach(pillClass => {
                        this.updateBackendPillStatus(pillClass, 'idle');
                    });

                    Loading.hide();
                    Toast.success('Backend unlinked successfully! You can reconnect anytime.');
                    console.log('✅ Backend unlinked - local data preserved');

                } catch (error) {
                    console.error('Error unlinking backend:', error);
                    Toast.error('Failed to unlink backend');
                    Loading.hide();
                }
            },
            null,
            {
                title: 'Unlink Backend',
                confirmText: 'Unlink',
                cancelText: 'Cancel',
                confirmClass: 'btn btn-danger',
                icon: '🔓'
            }
        );
    },

    /**
     * Update backend pill status
     */
    updateBackendPillStatus(pillClass, status) {
        const pill = document.querySelector(`.${pillClass}`);
        if (!pill) return;

        // Remove all status classes
        pill.classList.remove('loading', 'success', 'error', 'warning');

        // Add new status class if not idle
        if (status !== 'idle') {
            pill.classList.add(status);
        }
    },

    /**
     * Enable backend pills
     */
    enableBackendPills(pillClasses) {
        pillClasses.forEach(pillClass => {
            const pill = document.querySelector(`.${pillClass}`);
            if (pill) {
                pill.disabled = false;
            }
        });
    },

    /**
     * ==========================================
     * END BACKEND INTEGRATION FUNCTIONS
     * ==========================================
     */

    /**
     * ==========================================
     * EXPENSES MANAGEMENT FUNCTIONS
     * ==========================================
     */

    /**
     * Show expenses panel with filtering and stats
     */
    async showExpensesPanel() {
        try {
            // Load all expenses
            const expenses = await this.getDB().getExpenses();
            this.currentExpenses = expenses;
            this.filteredExpenses = expenses;

            // Render stat cards
            this.renderExpensesStatCards(expenses);

            // Display expenses
            this.renderExpensesTable(expenses);

            // Initialize category amount display
            this.updateCategoryAmountDisplay('all', expenses);

            // Setup event listeners for filters
            this.setupExpenseFilters();

            // Set up real-time listener for expenses (auto-refresh when expenses change)
            this.setupExpensesListener((expenses) => {
                this.currentExpenses = expenses;
                this.filteredExpenses = expenses;
                this.renderExpensesStatCards(expenses);
                this.renderExpensesTable(expenses);
                this.updateCategoryAmountDisplay('all', expenses);
            });

        } catch (error) {
            console.error('Error loading expenses:', error);
            Toast.error('Failed to load expenses');
        }
    },

    /**
     * Render expenses stat cards
     */
    renderExpensesStatCards(expenses) {
        const container = document.getElementById('expensesStatsCards');
        if (!container) return;

        // Calculate statistics
        const totalExpenses = expenses.length;
        const totalAmount = expenses.reduce((sum, e) => sum + (e.amount || 0), 0);

        // Get this month's expenses
        const now = new Date();
        const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
        const expensesThisMonth = expenses.filter(e => new Date(e.date) >= thisMonthStart);
        const thisMonthAmount = expensesThisMonth.reduce((sum, e) => sum + (e.amount || 0), 0);

        // Get this week's expenses
        const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        const expensesThisWeek = expenses.filter(e => new Date(e.date) >= oneWeekAgo);
        const thisWeekAmount = expensesThisWeek.reduce((sum, e) => sum + (e.amount || 0), 0);

        container.innerHTML = `
            <div class="metric-card warning">
                <div class="metric-header">
                    <h3>Total Expenses</h3>
                    <span class="metric-icon">💸</span>
                </div>
                <div class="metric-value">${Utils.formatCurrency(totalAmount)}</div>
                <div class="metric-change">All time</div>
            </div>

            <div class="metric-card info">
                <div class="metric-header">
                    <h3>This Month</h3>
                    <span class="metric-icon">📅</span>
                </div>
                <div class="metric-value">${Utils.formatCurrency(thisMonthAmount)}</div>
                <div class="metric-change">${expensesThisMonth.length} expenses</div>
            </div>

            <div class="metric-card primary">
                <div class="metric-header">
                    <h3>This Week</h3>
                    <span class="metric-icon">📊</span>
                </div>
                <div class="metric-value">${Utils.formatCurrency(thisWeekAmount)}</div>
                <div class="metric-change">${expensesThisWeek.length} expenses</div>
            </div>

            <div class="metric-card success">
                <div class="metric-header">
                    <h3>Total Count</h3>
                    <span class="metric-icon">🔢</span>
                </div>
                <div class="metric-value">${totalExpenses}</div>
                <div class="metric-change">Total records</div>
            </div>
        `;
    },

    /**
     * Render Analytics Dashboard with comprehensive statistics
     */
    async renderAnalyticsDashboard() {
        try {
            const container = document.getElementById('analyticsStatsCards');
            if (!container) return;

            // Get filtered data based on date range
            const filteredData = this.getFilteredAnalyticsData();
            const funds = filteredData.funds;
            const payments = filteredData.payments;
            const pledges = filteredData.pledges || [];
            const expenses = filteredData.expenses;

            // Calculate comprehensive statistics
            const totalCollected = funds.reduce((sum, f) => sum + (f.totalCollected || 0), 0);
            const totalPledged = funds.reduce((sum, f) => sum + (f.totalPledged || 0), 0);
            const totalPayments = payments.length;
            const totalPaymentsAmount = payments.reduce((sum, p) => sum + (p.amount || 0), 0);
            const totalExpenses = expenses.reduce((sum, e) => sum + (e.amount || 0), 0);
            const netBalance = totalCollected - totalExpenses;

            // Render stat cards
            container.innerHTML = `
                <div class="metric-card success">
                    <div class="metric-header">
                        <h3>Total Collected</h3>
                        <span class="metric-icon">💰</span>
                    </div>
                    <div class="metric-value">${Utils.formatCurrency(totalCollected)}</div>
                    <div class="metric-change">From ${funds.length} funds</div>
                </div>

                <div class="metric-card pledge">
                    <div class="metric-header">
                        <h3>Total Pledged</h3>
                        <span class="metric-icon">🤝</span>
                    </div>
                    <div class="metric-value">${Utils.formatCurrency(totalPledged)}</div>
                    <div class="metric-change">${pledges.length} pledge${pledges.length !== 1 ? 's' : ''}</div>
                </div>

                <div class="metric-card info">
                    <div class="metric-header">
                        <h3>Total Payments</h3>
                        <span class="metric-icon">💳</span>
                    </div>
                    <div class="metric-value">${totalPayments}</div>
                    <div class="metric-change">${Utils.formatCurrency(totalPaymentsAmount)} total</div>
                </div>

                <div class="metric-card warning">
                    <div class="metric-header">
                        <h3>Total Expenses</h3>
                        <span class="metric-icon">💸</span>
                    </div>
                    <div class="metric-value">${Utils.formatCurrency(totalExpenses)}</div>
                    <div class="metric-change">${expenses.length} transactions</div>
                </div>

                <div class="metric-card ${netBalance >= 0 ? 'primary' : 'warning'}">
                    <div class="metric-header">
                        <h3>Net Balance</h3>
                        <span class="metric-icon">${netBalance >= 0 ? '📈' : '📉'}</span>
                    </div>
                    <div class="metric-value">${Utils.formatCurrency(netBalance)}</div>
                    <div class="metric-change">${netBalance >= 0 ? 'Positive' : 'Negative'} balance</div>
                </div>
            `;
        } catch (error) {
            console.error('Error rendering analytics dashboard:', error);
            Toast.error('Failed to load analytics data');
        }
    },

    /**
     * Render analytics - main method for rendering all analytics with filtering
     */
    async renderAnalytics() {
        try {
            // Load all data first (without filtering)
            this.allFunds = await this.getDB().getAll('funds');
            this.allGroups = await this.getDB().getAll('groups');
            this.allPayments = await this.getDB().getAll('payments'); // Includes both regular payments and pledges
            this.allPledges = await this.getDB().getAll('pledges'); // Subset of allPayments where isPledge=true
            this.allExpenses = await this.getDB().getExpenses();

            // Render all analytics components
            await this.renderAnalyticsDashboard();
            await this.renderAllAnalyticsCharts();
            await this.renderDetailedBreakdowns();
        } catch (error) {
            console.error('Error rendering analytics:', error);
            Toast.error('Failed to render analytics');
        }
    },

    /**
     * Render analytics panel from cache (instant - no async!)
     */
    renderAnalyticsFromCache() {
        if (!this._dataLoaded) {
            // Cache not ready, fall back to async load
            this.renderAnalytics();
            return;
        }

        console.log('⚡ Rendering analytics from cache (instant)');

        try {
            // Use cached data instead of async DB calls
            this.allFunds = this._cachedFunds || [];
            this.allGroups = this._cachedGroups || [];
            this.allPayments = this._cachedPayments || [];
            this.allPledges = this.allPayments.filter(p => p.isPledge === true);
            this.allExpenses = this._cachedExpenses || [];

            // Render all analytics components synchronously
            this.renderAnalyticsDashboard();
            this.renderAllAnalyticsCharts();
            this.renderDetailedBreakdowns();
        } catch (error) {
            console.error('❌ Error rendering analytics from cache:', error);
            // Fall back to async load on error
            this.renderAnalytics();
        }
    },

    /**
     * Refresh analytics - reload all data and charts
     */
    async refreshAnalytics() {
        try {
            Loading.show();
            // Use cache-based rendering for instant refresh
            this.renderAnalyticsFromCache();
            Toast.success('Analytics refreshed successfully');
        } catch (error) {
            console.error('Error refreshing analytics:', error);
            Toast.error('Failed to refresh analytics');
        } finally {
            Loading.hide();
        }
    },

    /**
     * Render all analytics charts
     */
    async renderAllAnalyticsCharts() {
        await this.renderFundsPerformanceChart();
        await this.renderPaymentTimelineChart();
        await this.renderExpenseBreakdownChart();
        await this.renderGroupsContributionChart();
        await this.renderCollectionsVsExpensesChart();
        await this.renderFundProgressChart();
        await this.renderPledgeFulfillmentChart();
    },

    /**
     * Render Funds Performance Chart (Doughnut)
     */
    async renderFundsPerformanceChart() {
        const canvas = document.getElementById('fundsPerformanceChart');
        if (!canvas) return;

        // Destroy existing chart instance to prevent canvas reuse error
        const existingChart = Chart.getChart(canvas);
        if (existingChart) {
            existingChart.destroy();
        }

        // Use filtered data
        const filteredData = this.getFilteredAnalyticsData();
        const funds = filteredData.funds;
        if (!funds || funds.length === 0) {
            const ctx = canvas.getContext('2d');
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.font = '14px system-ui';
            ctx.fillStyle = '#9ca3af';
            ctx.textAlign = 'center';
            ctx.fillText('No funds data available', canvas.width / 2, canvas.height / 2);
            return;
        }

        const labels = funds.map(f => f.name);
        const collected = funds.map(f => f.totalCollected || 0);
        const colors = [
            '#10b981', '#3b82f6', '#f59e0b', '#ef4444',
            '#8b5cf6', '#ec4899', '#06b6d4', '#f97316'
        ];

        new Chart(canvas, {
            type: 'doughnut',
            data: {
                labels: labels,
                datasets: [{
                    data: collected,
                    backgroundColor: colors.slice(0, funds.length),
                    borderWidth: 2,
                    borderColor: '#fff'
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'bottom',
                        labels: {
                            padding: 15,
                            font: { size: 11 }
                        }
                    },
                    tooltip: {
                        callbacks: {
                            label: (context) => {
                                const label = context.label || '';
                                const value = Utils.formatCurrency(context.parsed);
                                return `${label}: ${value}`;
                            }
                        }
                    }
                }
            }
        });
    },

    /**
     * Render Payment Timeline Chart (Line)
     */
    async renderPaymentTimelineChart() {
        const canvas = document.getElementById('paymentTimelineChart');
        if (!canvas) return;

        // Destroy existing chart instance to prevent canvas reuse error
        const existingChart = Chart.getChart(canvas);
        if (existingChart) {
            existingChart.destroy();
        }

        // Use filtered data (consistent with other chart methods)
        const filteredData = this.getFilteredAnalyticsData();
        const payments = filteredData.payments;
        if (!payments || payments.length === 0) {
            const ctx = canvas.getContext('2d');
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.font = '14px system-ui';
            ctx.fillStyle = '#9ca3af';
            ctx.textAlign = 'center';
            ctx.fillText('No payment data available', canvas.width / 2, canvas.height / 2);
            return;
        }

        // Get last 30 days
        const days = 30;
        const dates = [];
        const dailyTotals = {};

        for (let i = days - 1; i >= 0; i--) {
            const date = new Date();
            date.setDate(date.getDate() - i);
            const dateStr = date.toISOString().split('T')[0];
            dates.push(dateStr);
            dailyTotals[dateStr] = 0;
        }

        payments.forEach(p => {
            if (!p.date) return;

            // Convert date to YYYY-MM-DD string format for comparison
            let dateStr = p.date;
            if (typeof dateStr !== 'string') {
                if (dateStr instanceof Date) {
                    dateStr = dateStr.toISOString().split('T')[0];
                } else if (typeof dateStr === 'number') {
                    dateStr = new Date(dateStr).toISOString().split('T')[0];
                } else {
                    return;
                }
            }

            if (dailyTotals.hasOwnProperty(dateStr)) {
                dailyTotals[dateStr] += p.amount || 0;
            }
        });

        const data = dates.map(d => dailyTotals[d]);
        const labels = dates.map(d => new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }));

        new Chart(canvas, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Daily Payments',
                    data: data,
                    borderColor: '#10b981',
                    backgroundColor: 'rgba(16, 185, 129, 0.1)',
                    fill: true,
                    tension: 0.4,
                    borderWidth: 2
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        callbacks: {
                            label: (context) => `Amount: ${Utils.formatCurrency(context.parsed.y)}`
                        }
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        ticks: {
                            callback: (value) => Utils.formatCurrency(value)
                        }
                    },
                    x: {
                        ticks: {
                            maxRotation: 45,
                            minRotation: 45
                        }
                    }
                }
            }
        });
    },

    /**
     * Render Expense Breakdown Chart (Pie)
     */
    async renderExpenseBreakdownChart() {
        const canvas = document.getElementById('expenseBreakdownChart');
        if (!canvas) return;

        // Destroy existing chart instance to prevent canvas reuse error
        const existingChart = Chart.getChart(canvas);
        if (existingChart) {
            existingChart.destroy();
        }

        // Use filtered data
        const filteredData = this.getFilteredAnalyticsData();
        const expenses = filteredData.expenses;
        if (!expenses || expenses.length === 0) {
            const ctx = canvas.getContext('2d');
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.font = '14px system-ui';
            ctx.fillStyle = '#9ca3af';
            ctx.textAlign = 'center';
            ctx.fillText('No expense data available', canvas.width / 2, canvas.height / 2);
            return;
        }

        const categoryTotals = {};
        const categoryIcons = {
            'supplies': '📦',
            'maintenance': '🔧',
            'utilities': '⚡',
            'management': '💼',
            'other': '📌'
        };

        expenses.forEach(e => {
            const cat = e.category || 'other';
            categoryTotals[cat] = (categoryTotals[cat] || 0) + (e.amount || 0);
        });

        const labels = Object.keys(categoryTotals).map(cat => {
            const icon = categoryIcons[cat] || '📌';
            const name = cat.charAt(0).toUpperCase() + cat.slice(1);
            return `${icon} ${name}`;
        });
        const data = Object.values(categoryTotals);
        const colors = ['#3b82f6', '#f59e0b', '#10b981', '#ef4444', '#8b5cf6'];

        new Chart(canvas, {
            type: 'pie',
            data: {
                labels: labels,
                datasets: [{
                    data: data,
                    backgroundColor: colors.slice(0, labels.length),
                    borderWidth: 2,
                    borderColor: '#fff'
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'bottom',
                        labels: {
                            padding: 15,
                            font: { size: 11 }
                        }
                    },
                    tooltip: {
                        callbacks: {
                            label: (context) => {
                                const label = context.label || '';
                                const value = Utils.formatCurrency(context.parsed);
                                return `${label}: ${value}`;
                            }
                        }
                    }
                }
            }
        });
    },

    /**
     * Render Groups Contribution Chart (Horizontal Bar)
     */
    async renderGroupsContributionChart() {
        const canvas = document.getElementById('groupsContributionChart');
        if (!canvas) return;

        // Destroy existing chart instance to prevent canvas reuse error
        const existingChart = Chart.getChart(canvas);
        if (existingChart) {
            existingChart.destroy();
        }

        // Use filtered data
        const filteredData = this.getFilteredAnalyticsData();
        const groups = filteredData.groups;
        if (!groups || groups.length === 0) {
            const ctx = canvas.getContext('2d');
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.font = '14px system-ui';
            ctx.fillStyle = '#9ca3af';
            ctx.textAlign = 'center';
            ctx.fillText('No group data available', canvas.width / 2, canvas.height / 2);
            return;
        }

        // Sort by totalPaid and get top 10
        const topGroups = groups
            .sort((a, b) => (b.totalPaid || 0) - (a.totalPaid || 0))
            .slice(0, 10);

        const labels = topGroups.map(g => g.name);
        const data = topGroups.map(g => g.totalPaid || 0);

        new Chart(canvas, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Total Contributed',
                    data: data,
                    backgroundColor: '#3b82f6',
                    borderRadius: 6
                }]
            },
            options: {
                indexAxis: 'y',
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        callbacks: {
                            label: (context) => `Contributed: ${Utils.formatCurrency(context.parsed.x)}`
                        }
                    }
                },
                scales: {
                    x: {
                        beginAtZero: true,
                        ticks: {
                            callback: (value) => Utils.formatCurrency(value)
                        }
                    }
                }
            }
        });
    },

    /**
     * Render Collections vs Expenses Chart (Multi-line)
     */
    async renderCollectionsVsExpensesChart() {
        const canvas = document.getElementById('collectionsVsExpensesChart');
        if (!canvas) return;

        // Destroy existing chart instance to prevent canvas reuse error
        const existingChart = Chart.getChart(canvas);
        if (existingChart) {
            existingChart.destroy();
        }

        // Use filtered data
        const filteredData = this.getFilteredAnalyticsData();
        const payments = filteredData.payments;
        const expenses = filteredData.expenses;
        const pledges = filteredData.pledges || [];

        // Get last 30 days
        const days = 30;
        const dates = [];
        const dailyCollections = {};
        const dailyExpenses = {};
        const dailyPledges = {};

        for (let i = days - 1; i >= 0; i--) {
            const date = new Date();
            date.setDate(date.getDate() - i);
            const dateStr = date.toISOString().split('T')[0];
            dates.push(dateStr);
            dailyCollections[dateStr] = 0;
            dailyExpenses[dateStr] = 0;
            dailyPledges[dateStr] = 0;
        }

        payments.forEach(p => {
            if (!p.date) return;

            // Convert date to YYYY-MM-DD string format for comparison
            let dateStr = p.date;
            if (typeof dateStr !== 'string') {
                if (dateStr instanceof Date) {
                    dateStr = dateStr.toISOString().split('T')[0];
                } else if (typeof dateStr === 'number') {
                    dateStr = new Date(dateStr).toISOString().split('T')[0];
                } else {
                    return;
                }
            }

            if (dailyCollections.hasOwnProperty(dateStr)) {
                dailyCollections[dateStr] += p.amount || 0;
            }
        });

        expenses.forEach(e => {
            if (!e.date) return;

            // Convert date to YYYY-MM-DD string format for comparison
            let dateStr = e.date;
            if (typeof dateStr !== 'string') {
                if (dateStr instanceof Date) {
                    dateStr = dateStr.toISOString().split('T')[0];
                } else if (typeof dateStr === 'number') {
                    dateStr = new Date(dateStr).toISOString().split('T')[0];
                } else {
                    return;
                }
            }

            if (dailyExpenses.hasOwnProperty(dateStr)) {
                dailyExpenses[dateStr] += e.amount || 0;
            }
        });

        pledges.forEach(p => {
            if (!p.createdAt) return;

            // Convert createdAt timestamp to YYYY-MM-DD string format
            const pledgeDate = new Date(p.createdAt);
            const dateStr = pledgeDate.toISOString().split('T')[0];

            if (dailyPledges.hasOwnProperty(dateStr)) {
                dailyPledges[dateStr] += p.amount || 0;
            }
        });

        const collectionsData = dates.map(d => dailyCollections[d]);
        const expensesData = dates.map(d => dailyExpenses[d]);
        const pledgesData = dates.map(d => dailyPledges[d]);
        const labels = dates.map(d => new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }));

        const datasets = [
            {
                label: 'Collections',
                data: collectionsData,
                borderColor: '#10b981',
                backgroundColor: 'rgba(16, 185, 129, 0.1)',
                fill: true,
                tension: 0.4,
                borderWidth: 2
            },
            {
                label: 'Expenses',
                data: expensesData,
                borderColor: '#8b5cf6',
                backgroundColor: 'rgba(139, 92, 246, 0.1)',
                fill: true,
                tension: 0.4,
                borderWidth: 2
            }
        ];

        // Only add pledges line if there are any pledges
        if (pledges.length > 0) {
            datasets.push({
                label: 'Pledges',
                data: pledgesData,
                borderColor: '#ec4899',
                backgroundColor: 'rgba(236, 72, 153, 0.1)',
                fill: true,
                tension: 0.4,
                borderWidth: 2
            });
        }

        new Chart(canvas, {
            type: 'line',
            data: {
                labels: labels,
                datasets: datasets
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'top',
                        labels: {
                            padding: 15,
                            font: { size: 12 }
                        }
                    },
                    tooltip: {
                        callbacks: {
                            label: (context) => `${context.dataset.label}: ${Utils.formatCurrency(context.parsed.y)}`
                        }
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        ticks: {
                            callback: (value) => Utils.formatCurrency(value)
                        }
                    },
                    x: {
                        ticks: {
                            maxRotation: 45,
                            minRotation: 45
                        }
                    }
                }
            }
        });
    },

    /**
     * Render Fund Progress Chart (Stacked Bar)
     */
    async renderFundProgressChart() {
        const canvas = document.getElementById('fundProgressChart');
        if (!canvas) return;

        // Destroy existing chart instance to prevent canvas reuse error
        const existingChart = Chart.getChart(canvas);
        if (existingChart) {
            existingChart.destroy();
        }

        // Use filtered data
        const filteredData = this.getFilteredAnalyticsData();
        const funds = filteredData.funds;
        if (!funds || funds.length === 0) {
            const ctx = canvas.getContext('2d');
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.font = '14px system-ui';
            ctx.fillStyle = '#9ca3af';
            ctx.textAlign = 'center';
            ctx.fillText('No funds data available', canvas.width / 2, canvas.height / 2);
            return;
        }

        const allocatedFunds = funds.filter(f => f.type === 'allocated');

        if (allocatedFunds.length === 0) {
            const ctx = canvas.getContext('2d');
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.font = '14px system-ui';
            ctx.fillStyle = '#9ca3af';
            ctx.textAlign = 'center';
            ctx.fillText('No allocated funds to display progress', canvas.width / 2, canvas.height / 2);
            return;
        }

        const labels = allocatedFunds.map(f => f.name);
        const collected = allocatedFunds.map(f => f.totalCollected || 0);
        const pledged = allocatedFunds.map(f => f.totalPledged || 0);
        const remaining = allocatedFunds.map((f, index) => {
            return Math.max(0, (f.totalGoal || 0) - (f.totalCollected || 0));
        });

        const datasets = [
            {
                label: 'Collected',
                data: collected,
                backgroundColor: '#10b981',
                borderRadius: 6
            }
        ];

        // Only add pledged dataset if any fund has pledges
        if (pledged.some(p => p > 0)) {
            datasets.push({
                label: 'Pledged',
                data: pledged,
                backgroundColor: '#ec4899',
                borderRadius: 6
            });
        }

        datasets.push({
            label: 'Remaining',
            data: remaining,
            backgroundColor: '#e5e7eb',
            borderRadius: 6
        });

        new Chart(canvas, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: datasets
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'top',
                        labels: {
                            padding: 15,
                            font: { size: 12 }
                        }
                    },
                    tooltip: {
                        callbacks: {
                            label: (context) => `${context.dataset.label}: ${Utils.formatCurrency(context.parsed.y)}`
                        }
                    }
                },
                scales: {
                    x: { stacked: true },
                    y: {
                        stacked: true,
                        beginAtZero: true,
                        ticks: {
                            callback: (value) => Utils.formatCurrency(value)
                        }
                    }
                }
            }
        });
    },

    /**
     * Render detailed breakdown tables
     */
    async renderDetailedBreakdowns() {
        await this.renderTopGroupsTable();
        await this.renderFundsTable();
        await this.renderMonthlySummaryTable();
        await this.renderOutstandingPledgesTable();
    },

    /**
     * Render Top Contributing Groups Table
     */
    async renderTopGroupsTable() {
        const tbody = document.getElementById('topGroupsTableBody');
        if (!tbody) return;

        try {
            // Use filtered data
            const filteredData = this.getFilteredAnalyticsData();
            const groups = filteredData.groups;
            const funds = filteredData.funds;

            if (!groups || groups.length === 0) {
                tbody.innerHTML = `
                    <tr>
                        <td colspan="9" class="text-center" style="padding: 2rem; color: var(--text-secondary);">
                            No groups data available
                        </td>
                    </tr>
                `;
                return;
            }

            // Sort by total (paid + pledged) and get top 10
            const topGroups = groups
                .sort((a, b) => {
                    const totalA = (a.totalPaid || 0) + (a.totalPledged || 0);
                    const totalB = (b.totalPaid || 0) + (b.totalPledged || 0);
                    return totalB - totalA;
                })
                .slice(0, 10);

            tbody.innerHTML = topGroups.map((group, index) => {
                const fund = funds.find(f => f.id === group.fundId);
                const fundName = fund ? fund.name : 'Unknown';
                const fundId = fund ? fund.id : '';
                const totalPaid = group.totalPaid || 0;
                const totalPledged = group.totalPledged || 0;
                const totalWithPledges = totalPaid + totalPledged;

                // Calculate separate percentages
                const paidPercentage = group.allocation ? Utils.calculatePercentage(totalPaid, group.allocation) : 0;
                const pledgedPercentage = group.allocation ? Utils.calculatePercentage(totalPledged, group.allocation) : 0;
                const combinedPercentage = group.allocation ? Utils.calculatePercentage(totalWithPledges, group.allocation) : 0;

                // Determine color class for paid segment
                const colorClass = paidPercentage >= 100 ? 'success'
                                  : paidPercentage < 50 ? 'warning'
                                  : 'default';

                // Calculate remaining/exceeded
                let remainingDisplay = 'N/A';
                if (group.allocation) {
                    const difference = group.allocation - totalPaid;
                    const isExceeded = difference < 0;
                    const amount = Math.abs(difference);
                    remainingDisplay = `<span style="color: ${isExceeded ? 'var(--error-color)' : 'inherit'};">${Utils.formatCurrency(amount)}${isExceeded ? ' exceeded' : ''}</span>`;
                }

                return `
                    <tr>
                        <td><strong>${index + 1}</strong></td>
                        <td>
                            <a href="#" class="analytics-link" onclick="app.viewFundDetail('${fundId}'); return false;">
                                ${Utils.sanitizeHTML(group.name)}
                            </a>
                        </td>
                        <td>
                            <a href="#" class="analytics-link" onclick="app.viewFundDetail('${fundId}'); return false;">
                                ${Utils.sanitizeHTML(fundName)}
                            </a>
                        </td>
                        <td><strong>${Utils.formatCurrency(totalPaid)}</strong></td>
                        <td style="color: var(--pledge-color);">${totalPledged > 0 ? Utils.formatCurrency(totalPledged) : '-'}</td>
                        <td><strong>${Utils.formatCurrency(totalWithPledges)}</strong></td>
                        <td>${remainingDisplay}</td>
                        <td>${group.allocation ? combinedPercentage + '%' : '-'}</td>
                        <td>
                            ${group.allocation ? `
                                <div class="progress-bar-segmented" style="height: 10px; margin-bottom: 4px;">
                                    <div class="progress-segment paid ${colorClass}" style="width: ${Math.min(paidPercentage, 100)}%"></div>
                                    ${totalPledged > 0 ? `<div class="progress-segment pledged" style="width: ${Math.min(pledgedPercentage, 100)}%"></div>` : ''}
                                </div>
                                <small style="font-size: 0.75rem;">${paidPercentage}% paid${totalPledged > 0 ? ` • ${pledgedPercentage}% pledged` : ''}</small>
                            ` : '<span class="text-muted">-</span>'}
                        </td>
                    </tr>
                `;
            }).join('');
        } catch (error) {
            console.error('Error rendering top groups table:', error);
        }
    },

    /**
     * Render Funds Performance Table
     */
    async renderFundsTable() {
        const tbody = document.getElementById('fundsTableBody');
        if (!tbody) return;

        try {
            // Use filtered data
            const filteredData = this.getFilteredAnalyticsData();
            const funds = filteredData.funds;
            const groups = filteredData.groups;

            if (!funds || funds.length === 0) {
                tbody.innerHTML = `
                    <tr>
                        <td colspan="9" class="text-center" style="padding: 2rem; color: var(--text-secondary);">
                            No funds available
                        </td>
                    </tr>
                `;
                return;
            }

            tbody.innerHTML = funds.map(fund => {
                const fundGroups = groups.filter(g => g.fundId === fund.id);
                const totalCollected = fund.totalCollected || 0;
                const totalPledged = fund.totalPledged || 0;
                const totalWithPledges = totalCollected + totalPledged;

                // Calculate separate percentages
                const collectedPercentage = fund.type === 'allocated' ? Utils.calculatePercentage(totalCollected, fund.totalGoal) : 0;
                const pledgedPercentage = fund.type === 'allocated' ? Utils.calculatePercentage(totalPledged, fund.totalGoal) : 0;
                const combinedPercentage = fund.type === 'allocated' ? Utils.calculatePercentage(totalWithPledges, fund.totalGoal) : 0;

                // Determine color class for collected segment
                const colorClass = collectedPercentage >= 100 ? 'success'
                                  : collectedPercentage < 50 ? 'warning'
                                  : 'default';

                let remainingDisplay = 'N/A';
                if (fund.type === 'allocated') {
                    const difference = fund.totalGoal - totalCollected;
                    const isExceeded = difference < 0;
                    const amount = Math.abs(difference);
                    remainingDisplay = `<span style="color: ${isExceeded ? 'var(--error-color)' : 'inherit'};">${Utils.formatCurrency(amount)}${isExceeded ? ' exceeded' : ''}</span>`;
                }

                return `
                    <tr>
                        <td>
                            <strong>
                                <a href="#" class="analytics-link" onclick="app.viewFundDetail('${fund.id}'); return false;">
                                    ${Utils.sanitizeHTML(fund.name)}
                                </a>
                            </strong>
                        </td>
                        <td><span class="badge ${fund.type === 'allocated' ? 'badge-primary' : 'badge-info'}">${fund.type}</span></td>
                        <td>${fund.type === 'allocated' ? Utils.formatCurrency(fund.totalGoal) : 'N/A'}</td>
                        <td><strong>${Utils.formatCurrency(totalCollected)}</strong></td>
                        <td style="color: var(--pledge-color);">${totalPledged > 0 ? Utils.formatCurrency(totalPledged) : '-'}</td>
                        <td><strong>${Utils.formatCurrency(totalWithPledges)}</strong></td>
                        <td>${remainingDisplay}</td>
                        <td>
                            ${fund.type === 'allocated' ? `
                                <div class="progress-bar-segmented" style="height: 10px; margin-bottom: 4px;">
                                    <div class="progress-segment paid ${colorClass}" style="width: ${Math.min(collectedPercentage, 100)}%"></div>
                                    ${totalPledged > 0 ? `<div class="progress-segment pledged" style="width: ${Math.min(pledgedPercentage, 100)}%"></div>` : ''}
                                </div>
                                <small style="font-size: 0.75rem;">${collectedPercentage}% collected${totalPledged > 0 ? ` • ${pledgedPercentage}% pledged` : ''}</small>
                            ` : '<span class="text-muted">Open fund</span>'}
                        </td>
                        <td>${fundGroups.length}</td>
                    </tr>
                `;
            }).join('');
        } catch (error) {
            console.error('Error rendering funds table:', error);
        }
    },

    /**
     * Convert any date format to YYYY-MM string
     * @param {string|Date|number} date - Date in any format
     * @returns {string|null} Month string in YYYY-MM format or null
     */
    getMonthString(date) {
        if (!date) return null;

        let dateStr = date;
        if (typeof dateStr !== 'string') {
            if (dateStr instanceof Date) {
                dateStr = dateStr.toISOString().split('T')[0];
            } else if (typeof dateStr === 'number') {
                dateStr = new Date(dateStr).toISOString().split('T')[0];
            } else {
                return null;
            }
        }

        // Ensure it's a valid date string (YYYY-MM-DD format)
        if (dateStr.length >= 7 && dateStr.includes('-')) {
            return dateStr.substring(0, 7); // YYYY-MM
        }

        return null;
    },

    /**
     * Render Monthly Summary Table
     */
    async renderMonthlySummaryTable() {
        const tbody = document.getElementById('monthlySummaryTableBody');
        if (!tbody) return;

        try {
            // Use filtered data
            const filteredData = this.getFilteredAnalyticsData();
            const payments = filteredData.payments;
            const expenses = filteredData.expenses;

            // Group by month
            const monthlyData = {};

            payments.forEach(p => {
                const month = this.getMonthString(p.date);
                if (!month) return;

                if (!monthlyData[month]) {
                    monthlyData[month] = { collections: 0, expenses: 0 };
                }
                monthlyData[month].collections += p.amount || 0;
            });

            expenses.forEach(e => {
                const month = this.getMonthString(e.date);
                if (!month) return;

                if (!monthlyData[month]) {
                    monthlyData[month] = { collections: 0, expenses: 0 };
                }
                monthlyData[month].expenses += e.amount || 0;
            });

            if (Object.keys(monthlyData).length === 0) {
                tbody.innerHTML = `
                    <tr>
                        <td colspan="5" class="text-center" style="padding: 2rem; color: var(--text-secondary);">
                            No monthly data available
                        </td>
                    </tr>
                `;
                return;
            }

            // Sort by month descending
            const sortedMonths = Object.keys(monthlyData).sort().reverse();

            tbody.innerHTML = sortedMonths.map((month, index) => {
                const data = monthlyData[month];
                const net = data.collections - data.expenses;
                const prevMonth = sortedMonths[index + 1];
                const prevNet = prevMonth ? (monthlyData[prevMonth].collections - monthlyData[prevMonth].expenses) : 0;
                const change = prevNet !== 0 ? ((net - prevNet) / Math.abs(prevNet) * 100).toFixed(1) : 0;

                const monthName = new Date(month + '-01').toLocaleDateString('en-US', { year: 'numeric', month: 'long' });

                return `
                    <tr>
                        <td><strong>${monthName}</strong></td>
                        <td style="color: var(--success-color);">${Utils.formatCurrency(data.collections)}</td>
                        <td style="color: var(--error-color);">${Utils.formatCurrency(data.expenses)}</td>
                        <td style="color: ${net >= 0 ? 'var(--success-color)' : 'var(--error-color)'};">
                            <strong>${Utils.formatCurrency(net)}</strong>
                        </td>
                        <td>
                            <span class="trend-indicator ${change >= 0 ? 'positive' : 'negative'}">
                                ${change >= 0 ? '↑' : '↓'} ${Math.abs(change)}%
                            </span>
                        </td>
                    </tr>
                `;
            }).join('');
        } catch (error) {
            console.error('Error rendering monthly summary table:', error);
        }
    },

    /**
     * Render Pledge Fulfillment Chart (Bar Chart)
     */
    async renderPledgeFulfillmentChart() {
        const canvas = document.getElementById('pledgeFulfillmentChart');
        if (!canvas) return;

        // Destroy existing chart instance to prevent canvas reuse error
        const existingChart = Chart.getChart(canvas);
        if (existingChart) {
            existingChart.destroy();
        }

        // Use filtered data
        const filteredData = this.getFilteredAnalyticsData();
        const funds = filteredData.funds;

        // Only show funds with pledges
        const fundsWithPledges = funds.filter(f => (f.totalPledged || 0) > 0);

        if (!fundsWithPledges || fundsWithPledges.length === 0) {
            const ctx = canvas.getContext('2d');
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.font = '14px system-ui';
            ctx.fillStyle = '#9ca3af';
            ctx.textAlign = 'center';
            ctx.fillText('No pledge data available', canvas.width / 2, canvas.height / 2);
            return;
        }

        const labels = fundsWithPledges.map(f => f.name);
        const collected = fundsWithPledges.map(f => f.totalCollected || 0);
        const pledged = fundsWithPledges.map(f => f.totalPledged || 0);

        new Chart(canvas, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [
                    {
                        label: 'Collected',
                        data: collected,
                        backgroundColor: '#10b981',
                        borderRadius: 6
                    },
                    {
                        label: 'Pledged',
                        data: pledged,
                        backgroundColor: '#ec4899',
                        borderRadius: 6
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'top',
                        labels: {
                            padding: 15,
                            font: { size: 12 }
                        }
                    },
                    tooltip: {
                        callbacks: {
                            label: (context) => `${context.dataset.label}: ${Utils.formatCurrency(context.parsed.y)}`
                        }
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        ticks: {
                            callback: (value) => Utils.formatCurrency(value)
                        }
                    }
                }
            }
        });
    },

    /**
     * Render Outstanding Pledges Table
     */
    async renderOutstandingPledgesTable() {
        const tbody = document.getElementById('outstandingPledgesTableBody');
        if (!tbody) return;

        try {
            // Use filtered data
            const filteredData = this.getFilteredAnalyticsData();
            const pledges = filteredData.pledges || [];
            const groups = filteredData.groups;
            const funds = filteredData.funds;

            if (!pledges || pledges.length === 0) {
                tbody.innerHTML = `
                    <tr>
                        <td colspan="5" class="text-center" style="padding: 2rem; color: var(--text-secondary);">
                            No outstanding pledges
                        </td>
                    </tr>
                `;
                return;
            }

            // Sort by amount descending
            const sortedPledges = pledges.sort((a, b) => (b.amount || 0) - (a.amount || 0));

            tbody.innerHTML = sortedPledges.map(pledge => {
                const group = groups.find(g => g.id === pledge.groupId);
                const fund = funds.find(f => f.id === pledge.fundId);
                const groupName = group ? group.name : 'Unknown';
                const fundName = fund ? fund.name : 'Unknown';
                const fundId = fund ? fund.id : '';

                return `
                    <tr>
                        <td>
                            <a href="#" class="analytics-link" onclick="app.viewFundDetail('${fundId}'); return false;">
                                ${Utils.sanitizeHTML(groupName)}
                            </a>
                        </td>
                        <td>
                            <a href="#" class="analytics-link" onclick="app.viewFundDetail('${fundId}'); return false;">
                                ${Utils.sanitizeHTML(fundName)}
                            </a>
                        </td>
                        <td style="color: var(--pledge-color);"><strong>${Utils.formatCurrency(pledge.amount || 0)}</strong></td>
                        <td>${Utils.sanitizeHTML(pledge.description || '-')}</td>
                        <td>${Utils.formatDate(pledge.createdAt)}</td>
                    </tr>
                `;
            }).join('');
        } catch (error) {
            console.error('Error rendering outstanding pledges table:', error);
        }
    },

    /**
     * Show analytics date filter modal
     */
    showAnalyticsDateFilter() {
        const formHTML = `
            <div class="form-section">
                <h4>Quick Select</h4>
                <div class="date-presets">
                    <button type="button" class="date-preset-btn ${this.analyticsDateRange.type === 'today' ? 'active' : ''}" data-preset="today">Today</button>
                    <button type="button" class="date-preset-btn ${this.analyticsDateRange.type === '7days' ? 'active' : ''}" data-preset="7days">Last 7 Days</button>
                    <button type="button" class="date-preset-btn ${this.analyticsDateRange.type === '30days' ? 'active' : ''}" data-preset="30days">Last 30 Days</button>
                    <button type="button" class="date-preset-btn ${this.analyticsDateRange.type === '3months' ? 'active' : ''}" data-preset="3months">Last 3 Months</button>
                    <button type="button" class="date-preset-btn ${this.analyticsDateRange.type === '6months' ? 'active' : ''}" data-preset="6months">Last 6 Months</button>
                    <button type="button" class="date-preset-btn ${this.analyticsDateRange.type === 'year' ? 'active' : ''}" data-preset="year">This Year</button>
                    <button type="button" class="date-preset-btn ${this.analyticsDateRange.type === 'allTime' ? 'active' : ''}" data-preset="allTime">All Time</button>
                </div>
            </div>

            <div class="form-section" style="margin-top: 1.5rem;">
                <h4>Custom Range</h4>
                <div class="custom-date-inputs">
                    <div class="form-group">
                        <label for="analyticsStartDate">From Date:</label>
                        <input type="date" id="analyticsStartDate" class="form-control" value="${this.analyticsDateRange.startDate || ''}">
                    </div>
                    <div class="form-group">
                        <label for="analyticsEndDate">To Date:</label>
                        <input type="date" id="analyticsEndDate" class="form-control" value="${this.analyticsDateRange.endDate || ''}">
                    </div>
                </div>
            </div>
        `;

        Modal.show({
            title: '📅 Select Date Range',
            content: formHTML,
            size: 'medium',
            buttons: [
                {
                    text: 'Cancel',
                    className: 'btn btn-outline',
                    onClick: () => true
                },
                {
                    text: 'Apply Filter',
                    className: 'btn btn-primary',
                    onClick: () => {
                        this.applyDateFilter();
                        return true;
                    }
                }
            ]
        });

        // Setup preset buttons
        setTimeout(() => {
            document.querySelectorAll('.date-preset-btn').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    const preset = e.target.getAttribute('data-preset');
                    this.selectDatePreset(preset);
                });
            });
        }, 50);
    },

    /**
     * Select a date preset
     */
    selectDatePreset(preset) {
        const endDate = new Date();
        let startDate = new Date();
        let label = '';

        // Update active button
        document.querySelectorAll('.date-preset-btn').forEach(btn => {
            btn.classList.remove('active');
        });
        event.target.classList.add('active');

        switch (preset) {
            case 'today':
                startDate = new Date(endDate);
                label = 'Today';
                break;
            case '7days':
                startDate.setDate(endDate.getDate() - 7);
                label = 'Last 7 Days';
                break;
            case '30days':
                startDate.setDate(endDate.getDate() - 30);
                label = 'Last 30 Days';
                break;
            case '3months':
                startDate.setMonth(endDate.getMonth() - 3);
                label = 'Last 3 Months';
                break;
            case '6months':
                startDate.setMonth(endDate.getMonth() - 6);
                label = 'Last 6 Months';
                break;
            case 'year':
                startDate = new Date(endDate.getFullYear(), 0, 1);
                label = 'This Year';
                break;
            case 'allTime':
                startDate = null;
                label = 'All Time';
                break;
        }

        // Update date range state
        this.analyticsDateRange = {
            type: preset,
            startDate: startDate ? startDate.toISOString().split('T')[0] : null,
            endDate: preset === 'allTime' ? null : endDate.toISOString().split('T')[0],
            label: label
        };

        // Update date inputs
        if (startDate) {
            document.getElementById('analyticsStartDate').value = this.analyticsDateRange.startDate;
            document.getElementById('analyticsEndDate').value = this.analyticsDateRange.endDate;
        } else {
            document.getElementById('analyticsStartDate').value = '';
            document.getElementById('analyticsEndDate').value = '';
        }
    },

    /**
     * Apply custom date range
     */
    applyCustomDateRange() {
        const startDate = document.getElementById('analyticsStartDate').value;
        const endDate = document.getElementById('analyticsEndDate').value;

        if (!startDate || !endDate) {
            Toast.error('Please select both start and end dates');
            return false;
        }

        if (new Date(startDate) > new Date(endDate)) {
            Toast.error('Start date must be before end date');
            return false;
        }

        // Clear preset selection
        document.querySelectorAll('.date-preset-btn').forEach(btn => {
            btn.classList.remove('active');
        });

        // Update date range state
        this.analyticsDateRange = {
            type: 'custom',
            startDate: startDate,
            endDate: endDate,
            label: `${new Date(startDate).toLocaleDateString()} - ${new Date(endDate).toLocaleDateString()}`
        };

        return true;
    },

    /**
     * Apply date filter and refresh analytics
     */
    async applyDateFilter() {
        // If custom dates are entered, validate and use them
        const startInput = document.getElementById('analyticsStartDate').value;
        const endInput = document.getElementById('analyticsEndDate').value;

        if (startInput && endInput && this.analyticsDateRange.type !== 'allTime') {
            if (!this.applyCustomDateRange()) {
                return;
            }
        }

        // Update button label
        const btn = document.getElementById('btnAnalyticsDateRange');
        if (btn) {
            btn.innerHTML = `📅 ${this.analyticsDateRange.label}`;
        }

        // Close modal
        this.closeAnalyticsDateFilter();

        // Refresh all analytics with filtered data (instant from cache)
        Toast.info(`Applying filter: ${this.analyticsDateRange.label}`);
        this.renderAnalyticsFromCache();
        Toast.success('Analytics updated');
    },

    /**
     * Get filtered analytics data based on date range
     */
    getFilteredAnalyticsData() {
        let payments = this.allPayments || [];
        let expenses = this.allExpenses || [];
        let pledges = this.allPledges || [];
        let funds = this.allFunds || [];
        let groups = this.allGroups || [];

        // If no date filter or all time, return everything
        if (!this.analyticsDateRange.startDate || !this.analyticsDateRange.endDate) {
            return { payments, expenses, pledges, funds, groups };
        }

        const startDate = new Date(this.analyticsDateRange.startDate);
        const endDate = new Date(this.analyticsDateRange.endDate);
        endDate.setHours(23, 59, 59, 999); // Include full end date

        // Filter payments by date
        payments = payments.filter(p => {
            if (!p.date) return false;

            let dateStr = p.date;
            if (typeof dateStr !== 'string') {
                if (dateStr instanceof Date) {
                    dateStr = dateStr.toISOString().split('T')[0];
                } else if (typeof dateStr === 'number') {
                    dateStr = new Date(dateStr).toISOString().split('T')[0];
                } else {
                    return false;
                }
            }

            const paymentDate = new Date(dateStr);
            return paymentDate >= startDate && paymentDate <= endDate;
        });

        // Filter expenses by date
        expenses = expenses.filter(e => {
            if (!e.date) return false;

            let dateStr = e.date;
            if (typeof dateStr !== 'string') {
                if (dateStr instanceof Date) {
                    dateStr = dateStr.toISOString().split('T')[0];
                } else if (typeof dateStr === 'number') {
                    dateStr = new Date(dateStr).toISOString().split('T')[0];
                } else {
                    return false;
                }
            }

            const expenseDate = new Date(dateStr);
            return expenseDate >= startDate && expenseDate <= endDate;
        });

        // Filter pledges by creation date
        pledges = pledges.filter(p => {
            if (!p.createdAt) return false;

            const pledgeDate = new Date(p.createdAt);
            return pledgeDate >= startDate && pledgeDate <= endDate;
        });

        return { payments, expenses, pledges, funds, groups };
    },

    /**
     * Get date range label for display
     */
    getDateRangeLabel(type) {
        const labels = {
            'today': 'Today',
            '7days': 'Last 7 Days',
            '30days': 'Last 30 Days',
            '3months': 'Last 3 Months',
            '6months': 'Last 6 Months',
            'year': 'This Year',
            'allTime': 'All Time',
            'custom': 'Custom Range'
        };
        return labels[type] || 'All Time';
    },

    /**
     * Generate chart for PDF embedding
     * Creates an off-screen canvas and draws charts manually
     */
    generateChartForPDF(chartType, data, config) {
        try {
            // Create off-screen canvas
            const canvas = document.createElement('canvas');
            canvas.width = 800;
            canvas.height = 300;
            const ctx = canvas.getContext('2d');

            // White background for PDF
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, canvas.width, canvas.height);

            if (chartType === 'paymentTimeline') {
                this.drawPaymentLineChart(ctx, data, canvas);
            } else if (chartType === 'expenseBreakdown') {
                this.drawExpensePieChart(ctx, data, canvas);
            } else if (chartType === 'fundPerformance') {
                this.drawFundPerformanceChart(ctx, data, canvas);
            } else if (chartType === 'topContributors') {
                this.drawTopContributorsChart(ctx, data, canvas);
            } else if (chartType === 'fundProgress') {
                this.drawFundProgressChart(ctx, data, canvas);
            } else if (chartType === 'collectionsVsExpenses') {
                this.drawCollectionsVsExpensesChart(ctx, data, canvas);
            }

            // Convert to PNG data URL
            return canvas.toDataURL('image/png');
        } catch (error) {
            console.error('Error generating chart for PDF:', error);
            return null;
        }
    },

    /**
     * Draw payment timeline line chart on canvas
     */
    drawPaymentLineChart(ctx, data, canvas) {
        const payments = data.payments || [];
        if (payments.length === 0) return;

        // Group payments by date
        const dailyPayments = {};
        payments.forEach(p => {
            const dateStr = p.date ? (typeof p.date === 'string' ? p.date : new Date(p.date).toISOString().split('T')[0]) : '';
            if (dateStr) {
                dailyPayments[dateStr] = (dailyPayments[dateStr] || 0) + (p.amount || 0);
            }
        });

        const dates = Object.keys(dailyPayments).sort();
        const values = dates.map(d => dailyPayments[d]);

        if (values.length === 0) return;

        const padding = 60;
        const chartWidth = canvas.width - padding * 2;
        const chartHeight = canvas.height - padding * 2;

        // Draw axes
        ctx.strokeStyle = '#e5e7eb';
        ctx.lineWidth = 2;

        // Y-axis
        ctx.beginPath();
        ctx.moveTo(padding, padding);
        ctx.lineTo(padding, canvas.height - padding);
        ctx.stroke();

        // X-axis
        ctx.beginPath();
        ctx.moveTo(padding, canvas.height - padding);
        ctx.lineTo(canvas.width - padding, canvas.height - padding);
        ctx.stroke();

        // Draw line chart
        const maxValue = Math.max(...values);
        const pointSpacing = chartWidth / Math.max(values.length - 1, 1);

        // Draw gradient fill
        const gradient = ctx.createLinearGradient(0, padding, 0, canvas.height - padding);
        gradient.addColorStop(0, 'rgba(79, 70, 229, 0.3)');
        gradient.addColorStop(1, 'rgba(79, 70, 229, 0.05)');

        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.moveTo(padding, canvas.height - padding);

        values.forEach((value, index) => {
            const x = padding + (index * pointSpacing);
            const y = canvas.height - padding - ((value / maxValue) * chartHeight);
            ctx.lineTo(x, y);
        });

        ctx.lineTo(padding + (values.length - 1) * pointSpacing, canvas.height - padding);
        ctx.closePath();
        ctx.fill();

        // Draw line
        ctx.strokeStyle = '#4F46E5';
        ctx.lineWidth = 3;
        ctx.beginPath();

        values.forEach((value, index) => {
            const x = padding + (index * pointSpacing);
            const y = canvas.height - padding - ((value / maxValue) * chartHeight);

            if (index === 0) {
                ctx.moveTo(x, y);
            } else {
                ctx.lineTo(x, y);
            }
        });

        ctx.stroke();

        // Draw points
        ctx.fillStyle = '#4F46E5';
        values.forEach((value, index) => {
            const x = padding + (index * pointSpacing);
            const y = canvas.height - padding - ((value / maxValue) * chartHeight);
            ctx.beginPath();
            ctx.arc(x, y, 4, 0, 2 * Math.PI);
            ctx.fill();
        });

        // Y-axis labels (amounts)
        ctx.fillStyle = '#6b7280';
        ctx.font = '10px system-ui';
        ctx.textAlign = 'right';
        for (let i = 0; i <= 4; i++) {
            const value = (maxValue / 4) * i;
            const y = canvas.height - padding - (chartHeight / 4) * i;
            ctx.fillText(Utils.formatCurrency(value), padding - 5, y + 4);
        }

        // X-axis labels (dates - show first, middle, last)
        ctx.textAlign = 'center';
        ctx.fillStyle = '#6b7280';
        ctx.font = '9px system-ui';
        if (dates.length > 0) {
            const firstDate = dates[0].split('-');
            ctx.fillText(`${firstDate[2]}/${firstDate[1]}`, padding, canvas.height - padding + 15);

            const midIndex = Math.floor(dates.length / 2);
            const midDate = dates[midIndex].split('-');
            ctx.fillText(`${midDate[2]}/${midDate[1]}`, padding + (midIndex * pointSpacing), canvas.height - padding + 15);

            const lastDate = dates[dates.length - 1].split('-');
            ctx.fillText(`${lastDate[2]}/${lastDate[1]}`, padding + ((dates.length - 1) * pointSpacing), canvas.height - padding + 15);
        }
    },

    /**
     * Draw expense breakdown pie chart on canvas
     */
    drawExpensePieChart(ctx, data, canvas) {
        const expenses = data.expenses || [];
        if (expenses.length === 0) return;

        // Group by category
        const categoryTotals = {};
        expenses.forEach(e => {
            const cat = e.category || 'Other';
            categoryTotals[cat] = (categoryTotals[cat] || 0) + (e.amount || 0);
        });

        const categories = Object.keys(categoryTotals);
        const values = Object.values(categoryTotals);
        const total = values.reduce((a, b) => a + b, 0);

        if (total === 0) return;

        const colors = [
            '#4F46E5', '#7C3AED', '#DC2626', '#059669',
            '#D97706', '#0891B2', '#7C2D12', '#166534'
        ];

        // Draw title
        ctx.fillStyle = '#374151';
        ctx.font = 'bold 16px system-ui';
        ctx.textAlign = 'center';
        ctx.fillText('Expense Category Distribution', canvas.width / 2, 30);

        // Draw pie chart
        const centerX = 250;
        const centerY = canvas.height / 2 + 20;
        const radius = 100;

        let startAngle = 0;

        values.forEach((value, index) => {
            const sliceAngle = (value / total) * 2 * Math.PI;

            ctx.fillStyle = colors[index % colors.length];
            ctx.beginPath();
            ctx.moveTo(centerX, centerY);
            ctx.arc(centerX, centerY, radius, startAngle, startAngle + sliceAngle);
            ctx.closePath();
            ctx.fill();

            // Draw outline
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 2;
            ctx.stroke();

            startAngle += sliceAngle;
        });

        // Draw legend
        ctx.font = '14px system-ui';
        ctx.textAlign = 'left';
        let legendY = 60;
        const legendX = canvas.width - 300;

        categories.forEach((category, index) => {
            const value = values[index];
            const percentage = ((value / total) * 100).toFixed(1);

            // Color box
            ctx.fillStyle = colors[index % colors.length];
            ctx.fillRect(legendX, legendY, 15, 15);

            // Text
            ctx.fillStyle = '#374151';
            ctx.fillText(`${category}: ${percentage}%`, legendX + 25, legendY + 12);

            legendY += 25;
        });
    },

    /**
     * Draw fund performance doughnut chart on canvas
     */
    drawFundPerformanceChart(ctx, data, canvas) {
        const funds = data.funds || [];
        if (funds.length === 0) return;

        const centerX = 250;
        const centerY = canvas.height / 2 + 20;
        const radius = 100;

        const colors = [
            '#10b981', '#3b82f6', '#f59e0b', '#ef4444',
            '#8b5cf6', '#ec4899', '#06b6d4', '#f97316'
        ];

        const collected = funds.map(f => f.totalCollected || 0);
        const total = collected.reduce((a, b) => a + b, 0);
        if (total === 0) return;

        let startAngle = 0;
        funds.forEach((fund, index) => {
            const value = fund.totalCollected || 0;
            const sliceAngle = (value / total) * 2 * Math.PI;

            ctx.fillStyle = colors[index % colors.length];
            ctx.beginPath();
            ctx.moveTo(centerX, centerY);
            ctx.arc(centerX, centerY, radius, startAngle, startAngle + sliceAngle);
            ctx.closePath();
            ctx.fill();

            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 2;
            ctx.stroke();

            startAngle += sliceAngle;
        });

        // Legend
        let legendY = 40;
        const legendX = 450;
        ctx.font = 'bold 14px system-ui';
        ctx.fillStyle = '#1f2937';
        ctx.fillText('Funds', legendX, legendY);
        legendY += 25;

        funds.forEach((fund, index) => {
            const percentage = ((fund.totalCollected / total) * 100).toFixed(1);

            ctx.fillStyle = colors[index % colors.length];
            ctx.fillRect(legendX, legendY - 10, 15, 15);

            ctx.font = '12px system-ui';
            ctx.fillStyle = '#374151';
            ctx.fillText(`${fund.name}: ${percentage}%`, legendX + 25, legendY + 2);

            legendY += 20;
        });
    },

    /**
     * Draw top contributors bar chart on canvas
     */
    drawTopContributorsChart(ctx, data, canvas) {
        const groups = data.groups || [];
        if (groups.length === 0) return;

        const topGroups = groups
            .sort((a, b) => (b.totalPaid || 0) - (a.totalPaid || 0))
            .slice(0, 10);

        if (topGroups.length === 0) return;

        const padding = 60;
        const chartWidth = canvas.width - padding * 2;
        const chartHeight = canvas.height - padding * 2;
        const barHeight = Math.min(25, chartHeight / topGroups.length);
        const spacing = 5;

        const maxValue = Math.max(...topGroups.map(g => g.totalPaid || 0));

        topGroups.forEach((group, index) => {
            const value = group.totalPaid || 0;
            const barWidth = (value / maxValue) * (chartWidth - 150);
            const yPos = padding + index * (barHeight + spacing);

            // Bar
            ctx.fillStyle = '#3b82f6';
            ctx.fillRect(padding + 100, yPos, barWidth, barHeight);

            // Group name
            ctx.font = '11px system-ui';
            ctx.fillStyle = '#374151';
            ctx.textAlign = 'right';
            ctx.fillText(group.name.substring(0, 15), padding + 95, yPos + barHeight / 2 + 4);

            // Value
            ctx.textAlign = 'left';
            ctx.fillStyle = '#1f2937';
            ctx.fillText(this.formatCurrency(value), padding + 105 + barWidth, yPos + barHeight / 2 + 4);
        });

        ctx.textAlign = 'left';
    },

    /**
     * Draw fund progress stacked bar chart on canvas
     */
    drawFundProgressChart(ctx, data, canvas) {
        const funds = data.funds || [];
        const allocatedFunds = funds.filter(f => f.type === 'allocated');

        if (allocatedFunds.length === 0) return;

        const padding = 60;
        const chartWidth = canvas.width - padding * 2;
        const chartHeight = canvas.height - padding * 2;
        const barHeight = Math.min(30, chartHeight / allocatedFunds.length);
        const spacing = 10;

        allocatedFunds.forEach((fund, index) => {
            const collected = fund.totalCollected || 0;
            const goal = fund.totalGoal || 0;
            const remaining = Math.max(0, goal - collected);
            const yPos = padding + index * (barHeight + spacing);

            // Collected portion (green)
            const collectedWidth = goal > 0 ? (collected / goal) * (chartWidth - 150) : 0;
            ctx.fillStyle = '#10b981';
            ctx.fillRect(padding + 100, yPos, collectedWidth, barHeight);

            // Remaining portion (gray)
            const remainingWidth = goal > 0 ? (remaining / goal) * (chartWidth - 150) : 0;
            ctx.fillStyle = '#e5e7eb';
            ctx.fillRect(padding + 100 + collectedWidth, yPos, remainingWidth, barHeight);

            // Fund name
            ctx.font = '11px system-ui';
            ctx.fillStyle = '#374151';
            ctx.textAlign = 'right';
            ctx.fillText(fund.name.substring(0, 15), padding + 95, yPos + barHeight / 2 + 4);

            // Progress percentage
            const progress = goal > 0 ? ((collected / goal) * 100).toFixed(0) : 0;
            ctx.textAlign = 'left';
            ctx.fillStyle = '#1f2937';
            ctx.fillText(`${progress}%`, padding + 105 + collectedWidth + remainingWidth, yPos + barHeight / 2 + 4);
        });

        ctx.textAlign = 'left';
    },

    /**
     * Draw collections vs expenses line chart on canvas
     */
    drawCollectionsVsExpensesChart(ctx, data, canvas) {
        const payments = data.payments || [];
        const expenses = data.expenses || [];

        // Get last 30 days
        const days = 30;
        const dates = [];
        const dailyCollections = {};
        const dailyExpenses = {};

        for (let i = days - 1; i >= 0; i--) {
            const date = new Date();
            date.setDate(date.getDate() - i);
            const dateStr = date.toISOString().split('T')[0];
            dates.push(dateStr);
            dailyCollections[dateStr] = 0;
            dailyExpenses[dateStr] = 0;
        }

        // Aggregate payments
        payments.forEach(p => {
            if (!p.date) return;
            let dateStr = p.date;
            if (typeof dateStr !== 'string') {
                if (dateStr instanceof Date) {
                    dateStr = dateStr.toISOString().split('T')[0];
                } else if (typeof dateStr === 'number') {
                    dateStr = new Date(dateStr).toISOString().split('T')[0];
                }
            }
            if (dailyCollections[dateStr] !== undefined) {
                dailyCollections[dateStr] += p.amount || 0;
            }
        });

        // Aggregate expenses
        expenses.forEach(e => {
            if (!e.date) return;
            let dateStr = e.date;
            if (typeof dateStr !== 'string') {
                if (dateStr instanceof Date) {
                    dateStr = dateStr.toISOString().split('T')[0];
                } else if (typeof dateStr === 'number') {
                    dateStr = new Date(dateStr).toISOString().split('T')[0];
                }
            }
            if (dailyExpenses[dateStr] !== undefined) {
                dailyExpenses[dateStr] += e.amount || 0;
            }
        });

        const collectionsValues = dates.map(d => dailyCollections[d]);
        const expensesValues = dates.map(d => dailyExpenses[d]);

        const padding = 50;
        const chartWidth = canvas.width - padding * 2;
        const chartHeight = canvas.height - padding * 2;

        const maxValue = Math.max(...collectionsValues, ...expensesValues, 1);

        // Draw axes
        ctx.strokeStyle = '#d1d5db';
        ctx.lineWidth = 2;

        // Y-axis
        ctx.beginPath();
        ctx.moveTo(padding, padding);
        ctx.lineTo(padding, canvas.height - padding);
        ctx.stroke();

        // X-axis
        ctx.beginPath();
        ctx.moveTo(padding, canvas.height - padding);
        ctx.lineTo(canvas.width - padding, canvas.height - padding);
        ctx.stroke();

        // Y-axis labels (amounts)
        ctx.fillStyle = '#6b7280';
        ctx.font = '10px system-ui';
        ctx.textAlign = 'right';
        for (let i = 0; i <= 4; i++) {
            const value = (maxValue / 4) * i;
            const y = canvas.height - padding - (chartHeight / 4) * i;
            ctx.fillText(this.formatCurrency(value), padding - 5, y + 4);
        }

        // X-axis labels (dates - show first, middle, last)
        ctx.textAlign = 'center';
        ctx.fillStyle = '#6b7280';
        ctx.font = '9px system-ui';
        if (dates.length > 0) {
            const firstDate = dates[0].split('-');
            ctx.fillText(`${firstDate[2]}/${firstDate[1]}`, padding, canvas.height - padding + 15);

            const midIndex = Math.floor(dates.length / 2);
            const midDate = dates[midIndex].split('-');
            ctx.fillText(`${midDate[2]}/${midDate[1]}`, padding + chartWidth / 2, canvas.height - padding + 15);

            const lastDate = dates[dates.length - 1].split('-');
            ctx.fillText(`${lastDate[2]}/${lastDate[1]}`, canvas.width - padding, canvas.height - padding + 15);
        }

        // Draw collections line (green)
        ctx.beginPath();
        ctx.strokeStyle = '#10b981';
        ctx.lineWidth = 2;
        collectionsValues.forEach((value, index) => {
            const x = padding + (index / (dates.length - 1)) * chartWidth;
            const y = padding + chartHeight - (value / maxValue) * chartHeight;
            if (index === 0) {
                ctx.moveTo(x, y);
            } else {
                ctx.lineTo(x, y);
            }
        });
        ctx.stroke();

        // Draw expenses line (purple)
        ctx.beginPath();
        ctx.strokeStyle = '#8b5cf6';
        ctx.lineWidth = 2;
        expensesValues.forEach((value, index) => {
            const x = padding + (index / (dates.length - 1)) * chartWidth;
            const y = padding + chartHeight - (value / maxValue) * chartHeight;
            if (index === 0) {
                ctx.moveTo(x, y);
            } else {
                ctx.lineTo(x, y);
            }
        });
        ctx.stroke();

        // Legend
        ctx.font = '12px system-ui';
        ctx.fillStyle = '#10b981';
        ctx.fillRect(padding, 15, 15, 15);
        ctx.fillStyle = '#374151';
        ctx.fillText('Collections', padding + 20, 26);

        ctx.fillStyle = '#8b5cf6';
        ctx.fillRect(padding + 120, 15, 15, 15);
        ctx.fillStyle = '#374151';
        ctx.fillText('Expenses', padding + 140, 26);
    },

    // Helper method for currency formatting in charts
    formatCurrency(amount) {
        return `Ksh ${amount.toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    },

    /**
     * Export analytics directly to PDF without modal
     * Captures the current analytics panel with all charts and tables
     */
    async exportAnalyticsDirectly() {
        Toast.info('Preparing analytics export...', 2000);

        try {
            // Get analytics data
            const filteredData = this.getFilteredAnalyticsData();
            const payments = filteredData.payments || [];
            const expenses = filteredData.expenses || [];
            const funds = filteredData.funds || [];
            const groups = filteredData.groups || [];

            // Calculate financial metrics
            const totalPayments = payments.reduce((sum, p) => sum + (p.amount || 0), 0);
            const totalExpenses = expenses.reduce((sum, e) => sum + (e.amount || 0), 0);
            const netAmount = totalPayments - totalExpenses;

            // Get all funds and groups for additional context
            const allFunds = await this.getDB().getAllFunds();
            const allGroups = await this.getDB().getAllGroups();

            // Calculate additional metrics
            const totalFunds = allFunds.length;
            const activeFunds = allFunds.filter(f => f.status === 'active').length;
            const totalGroups = allGroups.length;

            // Get payment method breakdown
            const paymentMethods = {};
            payments.forEach(p => {
                paymentMethods[p.paymentMethod] = (paymentMethods[p.paymentMethod] || 0) + 1;
            });

            // Generate charts
            const dateRange = this.analyticsDateRange;
            const paymentChartImage = this.generateChartForPDF('paymentTimeline', filteredData, {
                startDate: dateRange.startDate,
                endDate: dateRange.endDate
            });

            const expenseChartImage = this.generateChartForPDF('expenseBreakdown', filteredData, {
                startDate: dateRange.startDate,
                endDate: dateRange.endDate
            });

            const fundPerformanceChartImage = this.generateChartForPDF('fundPerformance', filteredData, {});

            const topContributorsChartImage = this.generateChartForPDF('topContributors', filteredData, {});

            const fundProgressChartImage = this.generateChartForPDF('fundProgress', filteredData, {});

            const collectionsVsExpensesChartImage = this.generateChartForPDF('collectionsVsExpenses', filteredData, {});

            // Generate PDF
            const { jsPDF } = window.jspdf;
            const doc = new jsPDF();

            // ===== HEADER SECTION =====
            doc.setFillColor(79, 70, 229); // Indigo
            doc.rect(0, 0, 210, 30, 'F');

            doc.setTextColor(255, 255, 255);
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(20);
            doc.text('Analytics Dashboard Report', 15, 15);

            doc.setFontSize(9);
            doc.setFont('helvetica', 'normal');
            doc.text(`Generated on ${new Date().toLocaleString()}`, 15, 23);

            // ===== METADATA =====
            doc.setTextColor(100, 100, 100);
            doc.setFontSize(10);
            let yPos = 38;
            const periodText = dateRange.type === 'custom'
                ? `${dateRange.startDate} to ${dateRange.endDate}`
                : this.getDateRangeLabel(dateRange.type);
            doc.text(`Period: ${periodText}`, 15, yPos);

            // ===== EXECUTIVE SUMMARY BOX =====
            yPos = 50;
            doc.setDrawColor(79, 70, 229);
            doc.setLineWidth(0.5);
            doc.rect(15, yPos, 180, 50);

            doc.setFontSize(14);
            doc.setTextColor(79, 70, 229);
            doc.setFont('helvetica', 'bold');
            doc.text('Executive Summary', 20, yPos + 8);

            // Financial metrics
            doc.setFontSize(11);
            doc.setTextColor(0, 0, 0);
            doc.setFont('helvetica', 'normal');

            doc.text(`Total Payments:`, 20, yPos + 20);
            doc.setFont('helvetica', 'bold');
            doc.text(`${Utils.formatCurrency(totalPayments)}`, 70, yPos + 20);

            doc.setFont('helvetica', 'normal');
            doc.text(`Total Expenses:`, 20, yPos + 28);
            doc.setFont('helvetica', 'bold');
            doc.text(`${Utils.formatCurrency(totalExpenses)}`, 70, yPos + 28);

            doc.setFont('helvetica', 'normal');
            doc.text(`Net Amount:`, 20, yPos + 36);
            doc.setFont('helvetica', 'bold');
            const netColor = netAmount >= 0 ? [34, 197, 94] : [239, 68, 68];
            doc.setTextColor(...netColor);
            doc.text(`${Utils.formatCurrency(netAmount)}`, 70, yPos + 36);

            // Organizational metrics
            doc.setTextColor(0, 0, 0);
            doc.setFont('helvetica', 'normal');
            doc.text(`Active Funds:`, 110, yPos + 20);
            doc.setFont('helvetica', 'bold');
            doc.text(`${activeFunds} / ${totalFunds}`, 150, yPos + 20);

            doc.setFont('helvetica', 'normal');
            doc.text(`Total Groups:`, 110, yPos + 28);
            doc.setFont('helvetica', 'bold');
            doc.text(`${totalGroups}`, 150, yPos + 28);

            doc.setFont('helvetica', 'normal');
            doc.text(`Payment Count:`, 110, yPos + 36);
            doc.setFont('helvetica', 'bold');
            doc.text(`${payments.length}`, 150, yPos + 36);

            // ===== PAYMENT TIMELINE CHART =====
            if (paymentChartImage && payments.length > 0) {
                yPos += 60;
                doc.setFontSize(12);
                doc.setTextColor(79, 70, 229);
                doc.setFont('helvetica', 'bold');
                doc.text('Payment Timeline Trend', 15, yPos);

                yPos += 5;
                doc.addImage(paymentChartImage, 'PNG', 15, yPos, 180, 68);
                yPos += 73;
            } else {
                yPos += 60;
            }

            // ===== PAYMENT METHODS BREAKDOWN =====
            if (Object.keys(paymentMethods).length > 0) {
                doc.setFontSize(12);
                doc.setTextColor(79, 70, 229);
                doc.setFont('helvetica', 'bold');
                doc.text('Payment Methods Distribution', 15, yPos);

                yPos += 8;
                doc.setFontSize(10);
                doc.setTextColor(0, 0, 0);
                doc.setFont('helvetica', 'normal');

                Object.entries(paymentMethods).forEach(([method, count]) => {
                    const percentage = ((count / payments.length) * 100).toFixed(1);
                    doc.text(`• ${method}: ${count} transactions (${percentage}%)`, 20, yPos);
                    yPos += 6;
                });
            }

            // ===== EXPENSE BREAKDOWN CHART =====
            if (expenseChartImage && expenses.length > 0) {
                yPos += 15;
                if (yPos > 200) {
                    doc.addPage();
                    yPos = 20;
                }

                doc.setFontSize(12);
                doc.setTextColor(79, 70, 229);
                doc.setFont('helvetica', 'bold');
                doc.text('Expense Category Distribution', 15, yPos);

                yPos += 5;
                doc.addImage(expenseChartImage, 'PNG', 15, yPos, 180, 68);
                yPos += 73;
            } else {
                yPos += 10;
            }

            // ===== FUND PERFORMANCE CHART =====
            if (fundPerformanceChartImage && funds.length > 0) {
                yPos += 15;
                if (yPos > 200) {
                    doc.addPage();
                    yPos = 20;
                }

                doc.setFontSize(12);
                doc.setTextColor(79, 70, 229);
                doc.setFont('helvetica', 'bold');
                doc.text('Fund Performance Overview', 15, yPos);

                yPos += 5;
                doc.addImage(fundPerformanceChartImage, 'PNG', 15, yPos, 180, 68);
                yPos += 73;
            }

            // ===== TOP CONTRIBUTORS CHART =====
            if (topContributorsChartImage && groups.length > 0) {
                yPos += 15;
                if (yPos > 200) {
                    doc.addPage();
                    yPos = 20;
                }

                doc.setFontSize(12);
                doc.setTextColor(79, 70, 229);
                doc.setFont('helvetica', 'bold');
                doc.text('Top Contributing Groups', 15, yPos);

                yPos += 5;
                doc.addImage(topContributorsChartImage, 'PNG', 15, yPos, 180, 68);
                yPos += 73;
            }

            // ===== COLLECTIONS VS EXPENSES CHART =====
            if (collectionsVsExpensesChartImage) {
                yPos += 15;
                if (yPos > 200) {
                    doc.addPage();
                    yPos = 20;
                }

                doc.setFontSize(12);
                doc.setTextColor(79, 70, 229);
                doc.setFont('helvetica', 'bold');
                doc.text('Collections vs Expenses Trend (Last 30 Days)', 15, yPos);

                yPos += 5;
                doc.addImage(collectionsVsExpensesChartImage, 'PNG', 15, yPos, 180, 68);
                yPos += 73;
            }

            // ===== FUND PROGRESS OVERVIEW CHART =====
            if (fundProgressChartImage && funds.filter(f => f.type === 'allocated').length > 0) {
                yPos += 15;
                if (yPos > 200) {
                    doc.addPage();
                    yPos = 20;
                }

                doc.setFontSize(12);
                doc.setTextColor(79, 70, 229);
                doc.setFont('helvetica', 'bold');
                doc.text('Fund Progress Overview', 15, yPos);

                yPos += 5;
                doc.addImage(fundProgressChartImage, 'PNG', 15, yPos, 180, 68);
                yPos += 73;
            }

            // ===== FUNDS OVERVIEW =====
            yPos += 10;
            doc.setFontSize(12);
            doc.setTextColor(79, 70, 229);
            doc.setFont('helvetica', 'bold');
            doc.text('Funds Overview', 15, yPos);

            yPos += 10;

            // Table headers
            doc.setFillColor(240, 240, 240);
            doc.rect(15, yPos - 5, 180, 8, 'F');

            doc.setFontSize(9);
            doc.setFont('helvetica', 'bold');
            doc.setTextColor(0, 0, 0);
            doc.text('Fund Name', 17, yPos);
            doc.text('Type', 80, yPos);
            doc.text('Collected', 110, yPos);
            doc.text('Goal', 145, yPos);
            doc.text('Progress', 170, yPos);

            yPos += 8;

            // Fund rows
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(8);

            funds.slice(0, 15).forEach((fund, index) => {
                if (yPos > 270) {
                    doc.addPage();
                    yPos = 20;
                }

                // Zebra striping
                if (index % 2 === 0) {
                    doc.setFillColor(250, 250, 250);
                    doc.rect(15, yPos - 4, 180, 6, 'F');
                }

                const progress = fund.totalGoal > 0
                    ? ((fund.totalCollected / fund.totalGoal) * 100).toFixed(0)
                    : '0';

                doc.text((fund.name || '').substring(0, 25), 17, yPos);
                doc.text((fund.type || 'N/A').substring(0, 12), 80, yPos);
                doc.text(Utils.formatCurrency(fund.totalCollected || 0), 110, yPos);
                doc.text(Utils.formatCurrency(fund.totalGoal || 0), 145, yPos);
                doc.text(`${progress}%`, 170, yPos);

                yPos += 6;
            });

            // ===== EXPENSES BREAKDOWN TABLE =====
            if (expenses.length > 0) {
                if (yPos > 220) {
                    doc.addPage();
                    yPos = 20;
                } else {
                    yPos += 15;
                }

                doc.setFontSize(12);
                doc.setTextColor(79, 70, 229);
                doc.setFont('helvetica', 'bold');
                doc.text('Expenses Breakdown', 15, yPos);

                yPos += 10;

                // Table headers
                doc.setFillColor(240, 240, 240);
                doc.rect(15, yPos - 5, 180, 8, 'F');

                doc.setFontSize(9);
                doc.setFont('helvetica', 'bold');
                doc.setTextColor(0, 0, 0);
                doc.text('Date', 17, yPos);
                doc.text('Category', 45, yPos);
                doc.text('Description', 80, yPos);
                doc.text('Amount', 135, yPos);
                doc.text('Vendor', 165, yPos);

                yPos += 8;

                // Expense rows
                doc.setFont('helvetica', 'normal');
                doc.setFontSize(8);

                expenses.slice(0, 10).forEach((expense, index) => {
                    if (yPos > 275) {
                        doc.addPage();
                        yPos = 20;

                        // Repeat headers
                        doc.setFillColor(240, 240, 240);
                        doc.rect(15, yPos - 5, 180, 8, 'F');
                        doc.setFont('helvetica', 'bold');
                        doc.setFontSize(9);
                        doc.text('Date', 17, yPos);
                        doc.text('Category', 45, yPos);
                        doc.text('Description', 80, yPos);
                        doc.text('Amount', 135, yPos);
                        doc.text('Vendor', 165, yPos);
                        yPos += 8;
                        doc.setFont('helvetica', 'normal');
                        doc.setFontSize(8);
                    }

                    // Zebra striping
                    if (index % 2 === 0) {
                        doc.setFillColor(250, 250, 250);
                        doc.rect(15, yPos - 4, 180, 6, 'F');
                    }

                    const expDateStr = expense.date ? (typeof expense.date === 'string' ? expense.date : new Date(expense.date).toISOString().split('T')[0]) : 'N/A';
                    doc.text(expDateStr, 17, yPos);
                    doc.text((expense.category || '').substring(0, 12), 45, yPos);
                    doc.text((expense.description || '').substring(0, 20), 80, yPos);
                    doc.text(String(Utils.formatCurrency(expense.amount)), 135, yPos);
                    doc.text((expense.vendor || 'N/A').substring(0, 12), 165, yPos);

                    yPos += 6;
                });
            }

            // ===== TOP CONTRIBUTING GROUPS TABLE =====
            if (groups.length > 0) {
                if (yPos > 220) {
                    doc.addPage();
                    yPos = 20;
                } else {
                    yPos += 15;
                }

                doc.setFontSize(12);
                doc.setTextColor(79, 70, 229);
                doc.setFont('helvetica', 'bold');
                doc.text('Top Contributing Groups', 15, yPos);

                yPos += 10;

                // Table headers
                doc.setFillColor(240, 240, 240);
                doc.rect(15, yPos - 5, 180, 8, 'F');

                doc.setFontSize(9);
                doc.setFont('helvetica', 'bold');
                doc.setTextColor(0, 0, 0);
                doc.text('Rank', 17, yPos);
                doc.text('Group Name', 35, yPos);
                doc.text('Fund', 85, yPos);
                doc.text('Total Paid', 125, yPos);
                doc.text('Progress', 165, yPos);

                yPos += 8;

                // Sort and get top 10 groups
                const topGroups = groups
                    .sort((a, b) => (b.totalPaid || 0) - (a.totalPaid || 0))
                    .slice(0, 10);

                doc.setFont('helvetica', 'normal');
                doc.setFontSize(8);

                topGroups.forEach((group, index) => {
                    if (yPos > 275) {
                        doc.addPage();
                        yPos = 20;
                    }

                    // Zebra striping
                    if (index % 2 === 0) {
                        doc.setFillColor(250, 250, 250);
                        doc.rect(15, yPos - 4, 180, 6, 'F');
                    }

                    const fund = funds.find(f => f.id === group.fundId);
                    const fundName = fund ? fund.name : 'Unknown';
                    const percentage = group.allocation ? Math.min(100, ((group.totalPaid / group.allocation) * 100)).toFixed(0) : 0;

                    doc.text(`${index + 1}`, 17, yPos);
                    doc.text((group.name || '').substring(0, 20), 35, yPos);
                    doc.text(fundName.substring(0, 15), 85, yPos);
                    doc.text(String(Utils.formatCurrency(group.totalPaid || 0)), 125, yPos);
                    doc.text(`${percentage}%`, 165, yPos);

                    yPos += 6;
                });
            }

            // ===== MONTHLY SUMMARY TABLE =====
            yPos += 15;
            if (yPos > 220) {
                doc.addPage();
                yPos = 20;
            }

            doc.setFontSize(12);
            doc.setTextColor(79, 70, 229);
            doc.setFont('helvetica', 'bold');
            doc.text('Monthly Summary', 15, yPos);

            yPos += 10;

            // Group by month
            const monthlyData = {};

            payments.forEach(p => {
                if (!p.date) return;
                let dateStr = p.date;
                if (typeof dateStr !== 'string') {
                    if (dateStr instanceof Date) {
                        dateStr = dateStr.toISOString().split('T')[0];
                    } else if (typeof dateStr === 'number') {
                        dateStr = new Date(dateStr).toISOString().split('T')[0];
                    }
                }
                const date = new Date(dateStr);
                const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;

                if (!monthlyData[monthKey]) {
                    monthlyData[monthKey] = { collections: 0, expenses: 0 };
                }
                monthlyData[monthKey].collections += p.amount || 0;
            });

            expenses.forEach(e => {
                if (!e.date) return;
                let dateStr = e.date;
                if (typeof dateStr !== 'string') {
                    if (dateStr instanceof Date) {
                        dateStr = dateStr.toISOString().split('T')[0];
                    } else if (typeof dateStr === 'number') {
                        dateStr = new Date(dateStr).toISOString().split('T')[0];
                    }
                }
                const date = new Date(dateStr);
                const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;

                if (!monthlyData[monthKey]) {
                    monthlyData[monthKey] = { collections: 0, expenses: 0 };
                }
                monthlyData[monthKey].expenses += e.amount || 0;
            });

            const months = Object.keys(monthlyData).sort().reverse().slice(0, 12);

            if (months.length > 0) {
                // Table headers
                doc.setFillColor(240, 240, 240);
                doc.rect(15, yPos - 5, 180, 8, 'F');

                doc.setFontSize(9);
                doc.setFont('helvetica', 'bold');
                doc.setTextColor(0, 0, 0);
                doc.text('Month', 17, yPos);
                doc.text('Collections', 55, yPos);
                doc.text('Expenses', 105, yPos);
                doc.text('Net', 145, yPos);

                yPos += 8;

                doc.setFont('helvetica', 'normal');
                doc.setFontSize(8);

                months.forEach((monthKey, index) => {
                    if (yPos > 275) {
                        doc.addPage();
                        yPos = 20;
                    }

                    // Zebra striping
                    if (index % 2 === 0) {
                        doc.setFillColor(250, 250, 250);
                        doc.rect(15, yPos - 4, 180, 6, 'F');
                    }

                    const data = monthlyData[monthKey];
                    const net = data.collections - data.expenses;
                    const [year, month] = monthKey.split('-');
                    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
                    const monthLabel = `${monthNames[parseInt(month) - 1]} ${year}`;

                    doc.setTextColor(0, 0, 0);
                    doc.text(monthLabel, 17, yPos);
                    doc.text(String(Utils.formatCurrency(data.collections)), 55, yPos);
                    doc.text(String(Utils.formatCurrency(data.expenses)), 105, yPos);

                    // Color code the net amount
                    if (net >= 0) {
                        doc.setTextColor(34, 197, 94); // Green
                    } else {
                        doc.setTextColor(239, 68, 68); // Red
                    }
                    doc.text(String(Utils.formatCurrency(net)), 145, yPos);

                    yPos += 6;
                });
            }

            // ===== FOOTER =====
            const pageCount = doc.internal.getNumberOfPages();
            for (let i = 1; i <= pageCount; i++) {
                doc.setPage(i);
                doc.setFontSize(8);
                doc.setTextColor(150, 150, 150);
                doc.setFont('helvetica', 'normal');
                doc.text(`Page ${i} of ${pageCount}`, 15, 290);
                doc.text(`ContributionTracker Pro - Analytics Report`, 105, 290, { align: 'center' });
                doc.text(new Date().toLocaleDateString(), 195, 290, { align: 'right' });
            }

            // Save PDF
            const timestamp = new Date().toISOString().split('T')[0];
            doc.save(`analytics-report-${timestamp}.pdf`);

            Toast.success('Analytics report exported successfully!');
        } catch (error) {
            console.error('Error exporting analytics:', error);
            Toast.error('Failed to export analytics report');
        }
    },

    /**
     * Download analytics report in selected format
     */
    async downloadAnalyticsReport() {
        const formatInput = document.querySelector('input[name="exportFormat"]:checked');
        if (!formatInput) {
            Toast.error('Please select an export format');
            return;
        }

        const format = formatInput.value;
        const btn = document.getElementById('btnStartExport');
        const progress = document.getElementById('exportProgress');
        const progressFill = document.getElementById('exportProgressFill');
        const progressText = document.getElementById('exportProgressText');

        try {
            // Disable button and show progress
            btn.disabled = true;
            progress.classList.remove('hidden');

            // Update progress
            progressFill.style.width = '20%';
            progressText.textContent = 'Preparing data...';
            await this.sleep(300);

            // Get filtered data
            const filteredData = this.getFilteredAnalyticsData();

            if (format === 'csv') {
                // Export as CSV
                progressFill.style.width = '60%';
                progressText.textContent = 'Generating CSV...';
                await this.sleep(300);

                await this.exportAnalyticsCSV(filteredData);

                progressFill.style.width = '100%';
                progressText.textContent = 'Export complete!';
                await this.sleep(500);

                Toast.success('CSV exported successfully');
                this.closeAnalyticsExportModal();
            } else if (format === 'pdf-charts' || format === 'pdf-tables') {
                // Export as PDF
                progressFill.style.width = '40%';
                progressText.textContent = 'Capturing charts...';
                await this.sleep(300);

                // Capture charts if needed
                const chartImages = format === 'pdf-charts' ? await this.captureAllCharts() : null;

                progressFill.style.width = '70%';
                progressText.textContent = 'Building PDF...';
                await this.sleep(300);

                await this.exportAnalyticsPDF(filteredData, chartImages, format === 'pdf-tables');

                progressFill.style.width = '100%';
                progressText.textContent = 'Export complete!';
                await this.sleep(500);

                Toast.success('PDF exported successfully');
                this.closeAnalyticsExportModal();
            }
        } catch (error) {
            console.error('Export failed:', error);
            Toast.error('Export failed. Please try again.');
            this.closeAnalyticsExportModal();
        }
    },

    /**
     * Sleep utility for progress animation
     */
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    },

    /**
     * Capture all analytics charts as images
     */
    async captureAllCharts() {
        const chartImages = {};
        const scaleFactor = 2; // 2x for better quality

        const chartIds = [
            'fundsPerformanceChart',
            'paymentTimelineChart',
            'expenseBreakdownChart',
            'groupsContributionChart',
            'collectionsVsExpensesChart',
            'fundProgressChart',
            'pledgeFulfillmentChart'
        ];

        for (const chartId of chartIds) {
            const canvas = document.getElementById(chartId);
            if (canvas) {
                // Create high-resolution canvas
                const highResCanvas = document.createElement('canvas');
                const ctx = highResCanvas.getContext('2d');

                // Scale up canvas
                highResCanvas.width = canvas.width * scaleFactor;
                highResCanvas.height = canvas.height * scaleFactor;

                // Scale context and draw original canvas
                ctx.scale(scaleFactor, scaleFactor);
                ctx.drawImage(canvas, 0, 0);

                // Get image data
                chartImages[chartId] = highResCanvas.toDataURL('image/png');
            }
        }

        return chartImages;
    },

    /**
     * Export analytics as PDF
     */
    async exportAnalyticsPDF(data, chartImages, tablesOnly = false) {
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF();

        const brandColor = [16, 185, 129]; // #10b981
        const timestamp = new Date().toLocaleDateString();
        const dateRangeLabel = this.analyticsDateRange.label || 'All Time';

        // Page 1: Header and Summary
        doc.setFillColor(...brandColor);
        doc.rect(0, 0, 210, 30, 'F');

        doc.setTextColor(255, 255, 255);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(20);
        doc.text('ContributionTracker Pro', 15, 15);

        doc.setFontSize(12);
        doc.text(`Analytics Report - ${dateRangeLabel}`, 15, 22);
        doc.setFontSize(10);
        doc.text(`Generated: ${timestamp}`, 15, 27);

        // Reset colors
        doc.setTextColor(0, 0, 0);

        // Summary Statistics
        doc.setFontSize(14);
        doc.setFont('helvetica', 'bold');
        doc.text('Summary', 15, 45);

        doc.setFontSize(10);
        doc.setFont('helvetica', 'normal');

        const totalCollected = data.payments.reduce((sum, p) => sum + (p.amount || 0), 0);
        const totalPledged = (data.pledges || []).reduce((sum, p) => sum + (p.amount || 0), 0);
        const totalExpenses = data.expenses.reduce((sum, e) => sum + (e.amount || 0), 0);
        const netBalance = totalCollected - totalExpenses;

        let yPos = 55;
        doc.text(`Total Collected: ${Utils.formatCurrency(totalCollected)}`, 15, yPos);
        yPos += 7;
        doc.text(`Total Payments: ${data.payments.length}`, 15, yPos);
        yPos += 7;
        if (totalPledged > 0) {
            doc.text(`Total Pledged: ${Utils.formatCurrency(totalPledged)} (${(data.pledges || []).length} pledges)`, 15, yPos);
            yPos += 7;
        }
        doc.text(`Total Expenses: ${Utils.formatCurrency(totalExpenses)} (${data.expenses.length} transactions)`, 15, yPos);
        yPos += 7;
        doc.text(`Net Balance: ${Utils.formatCurrency(netBalance)}`, 15, yPos);
        yPos += 7;
        doc.text(`Active Funds: ${data.funds.length}`, 15, yPos);
        yPos += 7;
        doc.text(`Contributing Groups: ${data.groups.length}`, 15, yPos);

        // Add charts if included
        if (chartImages && !tablesOnly) {
            yPos += 15;

            // Page 2: Performance Charts
            if (yPos > 220) {
                doc.addPage();
                yPos = 20;
            }

            doc.setFontSize(14);
            doc.setFont('helvetica', 'bold');
            doc.text('Performance Analytics', 15, yPos);
            yPos += 10;

            // Funds Performance Chart
            if (chartImages.fundsPerformanceChart) {
                doc.setFontSize(11);
                doc.setFont('helvetica', 'bold');
                doc.text('Funds Performance', 15, yPos);
                yPos += 5;
                doc.addImage(chartImages.fundsPerformanceChart, 'PNG', 15, yPos, 90, 60);
                yPos += 65;
            }

            // Payment Timeline Chart
            if (chartImages.paymentTimelineChart) {
                if (yPos > 220) {
                    doc.addPage();
                    yPos = 20;
                }
                doc.setFontSize(11);
                doc.setFont('helvetica', 'bold');
                doc.text('Payment Timeline', 15, yPos);
                yPos += 5;
                doc.addImage(chartImages.paymentTimelineChart, 'PNG', 15, yPos, 180, 60);
                yPos += 65;
            }

            // Page 3: Expense and Group Analytics
            doc.addPage();
            yPos = 20;

            // Expense Breakdown
            if (chartImages.expenseBreakdownChart) {
                doc.setFontSize(11);
                doc.setFont('helvetica', 'bold');
                doc.text('Expense Breakdown', 15, yPos);
                yPos += 5;
                doc.addImage(chartImages.expenseBreakdownChart, 'PNG', 15, yPos, 90, 60);
                yPos += 65;
            }

            // Groups Contribution
            if (chartImages.groupsContributionChart) {
                if (yPos > 220) {
                    doc.addPage();
                    yPos = 20;
                }
                doc.setFontSize(11);
                doc.setFont('helvetica', 'bold');
                doc.text('Top Contributing Groups', 15, yPos);
                yPos += 5;
                doc.addImage(chartImages.groupsContributionChart, 'PNG', 15, yPos, 180, 60);
                yPos += 65;
            }

            // Page 4: Trend Analysis
            doc.addPage();
            yPos = 20;

            // Collections vs Expenses
            if (chartImages.collectionsVsExpensesChart) {
                doc.setFontSize(11);
                doc.setFont('helvetica', 'bold');
                doc.text('Collections vs Expenses Trend', 15, yPos);
                yPos += 5;
                doc.addImage(chartImages.collectionsVsExpensesChart, 'PNG', 15, yPos, 180, 50);
                yPos += 55;
            }

            // Fund Progress
            if (chartImages.fundProgressChart) {
                if (yPos > 210) {
                    doc.addPage();
                    yPos = 20;
                }
                doc.setFontSize(11);
                doc.setFont('helvetica', 'bold');
                doc.text('Fund Progress Overview', 15, yPos);
                yPos += 5;
                doc.addImage(chartImages.fundProgressChart, 'PNG', 15, yPos, 180, 50);
                yPos += 55;
            }

            // Pledge Fulfillment Chart
            if (chartImages.pledgeFulfillmentChart && totalPledged > 0) {
                if (yPos > 210) {
                    doc.addPage();
                    yPos = 20;
                }
                doc.setFontSize(11);
                doc.setFont('helvetica', 'bold');
                doc.text('Pledge Fulfillment by Fund', 15, yPos);
                yPos += 5;
                doc.addImage(chartImages.pledgeFulfillmentChart, 'PNG', 15, yPos, 180, 50);
            }
        }

        // Add detailed tables
        doc.addPage();
        yPos = 20;

        doc.setFontSize(14);
        doc.setFont('helvetica', 'bold');
        doc.text('Detailed Breakdown', 15, yPos);
        yPos += 10;

        // Top Funds Table
        doc.setFontSize(11);
        doc.setFont('helvetica', 'bold');
        doc.text('Top Funds', 15, yPos);
        yPos += 6;

        doc.setFontSize(9);
        doc.setFont('helvetica', 'normal');

        const topFunds = data.funds
            .sort((a, b) => (b.totalCollected || 0) - (a.totalCollected || 0))
            .slice(0, 10);

        topFunds.forEach((fund, index) => {
            if (yPos > 270) {
                doc.addPage();
                yPos = 20;
            }
            const collected = Utils.formatCurrency(fund.totalCollected || 0);
            const pledged = fund.totalPledged || 0;
            const pledgeText = pledged > 0 ? ` (Pledged: ${Utils.formatCurrency(pledged)})` : '';
            doc.text(`${index + 1}. ${fund.name}: ${collected}${pledgeText}`, 15, yPos);
            yPos += 5;
        });

        // Outstanding Pledges Table
        if (data.pledges && data.pledges.length > 0) {
            yPos += 10;
            if (yPos > 260) {
                doc.addPage();
                yPos = 20;
            }

            doc.setFontSize(11);
            doc.setFont('helvetica', 'bold');
            doc.text('Outstanding Pledges', 15, yPos);
            yPos += 6;

            doc.setFontSize(9);
            doc.setFont('helvetica', 'normal');

            const topPledges = data.pledges
                .sort((a, b) => (b.amount || 0) - (a.amount || 0))
                .slice(0, 15);

            topPledges.forEach((pledge, index) => {
                if (yPos > 270) {
                    doc.addPage();
                    yPos = 20;
                }
                const group = data.groups.find(g => g.id === pledge.groupId);
                const fund = data.funds.find(f => f.id === pledge.fundId);
                const groupName = group ? group.name : 'Unknown';
                const fundName = fund ? fund.name : 'Unknown';
                const amount = Utils.formatCurrency(pledge.amount || 0);
                doc.text(`${index + 1}. ${groupName} (${fundName}): ${amount}`, 15, yPos);
                yPos += 5;
            });
        }

        // Save PDF
        const filename = `ContributionTracker_Analytics_${dateRangeLabel.replace(/\s+/g, '_')}_${Date.now()}.pdf`;
        doc.save(filename);
    },

    /**
     * Export analytics as CSV
     */
    async exportAnalyticsCSV(data) {
        const dateRangeLabel = this.analyticsDateRange.label || 'All Time';

        // Create CSV content
        let csvContent = `ContributionTracker Pro - Analytics Export\n`;
        csvContent += `Date Range: ${dateRangeLabel}\n`;
        csvContent += `Generated: ${new Date().toLocaleString()}\n\n`;

        // Summary Section
        csvContent += `SUMMARY\n`;
        csvContent += `Total Collected,${data.payments.reduce((sum, p) => sum + (p.amount || 0), 0)}\n`;
        csvContent += `Total Payments,${data.payments.length}\n`;
        const totalPledged = (data.pledges || []).reduce((sum, p) => sum + (p.amount || 0), 0);
        if (totalPledged > 0) {
            csvContent += `Total Pledged,${totalPledged}\n`;
            csvContent += `Number of Pledges,${(data.pledges || []).length}\n`;
        }
        csvContent += `Total Expenses,${data.expenses.reduce((sum, e) => sum + (e.amount || 0), 0)}\n`;
        csvContent += `Number of Expenses,${data.expenses.length}\n`;
        csvContent += `Active Funds,${data.funds.length}\n`;
        csvContent += `Contributing Groups,${data.groups.length}\n\n`;

        // Funds Section
        csvContent += `FUNDS\n`;
        csvContent += `Fund Name,Type,Total Collected,Total Pledged,Total Goal,Number of Groups\n`;
        data.funds.forEach(fund => {
            const fundGroups = data.groups.filter(g => g.fundId === fund.id).length;
            csvContent += `"${fund.name}",${fund.type},${fund.totalCollected || 0},${fund.totalPledged || 0},${fund.totalGoal || 0},${fundGroups}\n`;
        });
        csvContent += `\n`;

        // Groups Section
        csvContent += `GROUPS\n`;
        csvContent += `Group Name,Fund,Total Paid,Total Pledged,Members\n`;
        data.groups.forEach(group => {
            const fund = data.funds.find(f => f.id === group.fundId);
            csvContent += `"${group.name}","${fund ? fund.name : 'Unknown'}",${group.totalPaid || 0},${group.totalPledged || 0},${group.members || 0}\n`;
        });
        csvContent += `\n`;

        // Payments Section
        csvContent += `PAYMENTS\n`;
        csvContent += `ID,Date,Group,Amount,Method\n`;
        data.payments.forEach(payment => {
            const group = data.groups.find(g => g.id === payment.groupId);
            csvContent += `${payment.id},"${payment.date}","${group ? group.name : 'Unknown'}",${payment.amount},"${payment.method}"\n`;
        });
        csvContent += `\n`;

        // Pledges Section
        if (data.pledges && data.pledges.length > 0) {
            csvContent += `PLEDGES\n`;
            csvContent += `ID,Group,Fund,Amount,Description,Date Created\n`;
            data.pledges.forEach(pledge => {
                const group = data.groups.find(g => g.id === pledge.groupId);
                const fund = data.funds.find(f => f.id === pledge.fundId);
                const createdDate = new Date(pledge.createdAt).toLocaleDateString();
                csvContent += `${pledge.id},"${group ? group.name : 'Unknown'}","${fund ? fund.name : 'Unknown'}",${pledge.amount},"${pledge.description || ''}","${createdDate}"\n`;
            });
            csvContent += `\n`;
        }

        // Expenses Section
        csvContent += `EXPENSES\n`;
        csvContent += `ID,Date,Category,Description,Amount,Vendor\n`;
        data.expenses.forEach(expense => {
            csvContent += `${expense.id},"${expense.date}","${expense.category}","${expense.description}",${expense.amount},"${expense.vendor}"\n`;
        });

        // Create and download file
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        const url = URL.createObjectURL(blob);

        link.setAttribute('href', url);
        link.setAttribute('download', `ContributionTracker_Analytics_${dateRangeLabel.replace(/\s+/g, '_')}_${Date.now()}.csv`);
        link.style.visibility = 'hidden';

        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    },

    /**
     * Setup expense filter event listeners
     */
    setupExpenseFilters() {
        // Category pills
        const categoryPills = document.querySelectorAll('.expense-pill');
        categoryPills.forEach(pill => {
            pill.addEventListener('click', () => {
                // Update active state
                categoryPills.forEach(p => p.classList.remove('active'));
                pill.classList.add('active');

                // Filter expenses
                const category = pill.getAttribute('data-category');
                this.filterExpensesByCategory(category);
            });
        });

        // Date filters
        const startDateInput = document.getElementById('expenseStartDate');
        const endDateInput = document.getElementById('expenseEndDate');

        startDateInput.addEventListener('change', () => this.filterExpensesByDate());
        endDateInput.addEventListener('change', () => this.filterExpensesByDate());

        // Search
        const searchInput = document.getElementById('expenseSearch');
        let searchTimeout;
        searchInput.addEventListener('input', (e) => {
            clearTimeout(searchTimeout);
            searchTimeout = setTimeout(() => {
                this.searchExpenses(e.target.value);
            }, 300);
        });
    },

    /**
     * Filter expenses by category
     */
    filterExpensesByCategory(category) {
        let filtered = this.currentExpenses;

        if (category !== 'all') {
            filtered = filtered.filter(expense => expense.category === category);
        }

        // Apply existing date filters if any
        const startDate = document.getElementById('expenseStartDate').value;
        const endDate = document.getElementById('expenseEndDate').value;

        if (startDate) {
            filtered = filtered.filter(expense => expense.date >= startDate);
        }
        if (endDate) {
            filtered = filtered.filter(expense => expense.date <= endDate);
        }

        // Apply existing search if any
        const searchTerm = document.getElementById('expenseSearch').value.toLowerCase();
        if (searchTerm) {
            filtered = filtered.filter(expense =>
                expense.description.toLowerCase().includes(searchTerm) ||
                expense.vendor.toLowerCase().includes(searchTerm) ||
                expense.notes.toLowerCase().includes(searchTerm)
            );
        }

        this.filteredExpenses = filtered;
        this.updateCategoryAmountDisplay(category, filtered);
        this.renderExpensesTable(filtered);
    },

    /**
     * Update category amount display
     */
    updateCategoryAmountDisplay(category, expenses) {
        const amountDisplay = document.getElementById('categoryAmountDisplay');
        if (!amountDisplay) return;

        const total = expenses.reduce((sum, exp) => sum + parseFloat(exp.amount || 0), 0);
        const label = category === 'all' ? 'Total' : this.getCategoryLabel(category);

        amountDisplay.textContent = `${label}: ${Utils.formatCurrency(total)}`;
    },

    /**
     * Get category label
     */
    getCategoryLabel(category) {
        const labels = {
            'supplies': 'Supplies',
            'maintenance': 'Maintenance',
            'utilities': 'Utilities',
            'management': 'Management',
            'other': 'Other'
        };
        return labels[category] || 'Total';
    },

    /**
     * Filter expenses by date range
     */
    filterExpensesByDate() {
        const startDate = document.getElementById('expenseStartDate').value;
        const endDate = document.getElementById('expenseEndDate').value;

        let filtered = this.currentExpenses;

        // Get active category
        const activeCategory = document.querySelector('.expense-pill.active')?.getAttribute('data-category') || 'all';
        if (activeCategory !== 'all') {
            filtered = filtered.filter(expense => expense.category === activeCategory);
        }

        // Apply date filters
        if (startDate) {
            filtered = filtered.filter(expense => expense.date >= startDate);
        }
        if (endDate) {
            filtered = filtered.filter(expense => expense.date <= endDate);
        }

        // Apply search
        const searchTerm = document.getElementById('expenseSearch').value.toLowerCase();
        if (searchTerm) {
            filtered = filtered.filter(expense =>
                expense.description.toLowerCase().includes(searchTerm) ||
                expense.vendor.toLowerCase().includes(searchTerm) ||
                expense.notes.toLowerCase().includes(searchTerm)
            );
        }

        this.filteredExpenses = filtered;
        this.updateCategoryAmountDisplay(activeCategory, filtered);
        this.renderExpensesTable(filtered);
    },

    /**
     * Search expenses
     */
    searchExpenses(searchTerm) {
        searchTerm = searchTerm.toLowerCase();

        let filtered = this.currentExpenses;

        // Get active category
        const activeCategory = document.querySelector('.expense-pill.active')?.getAttribute('data-category') || 'all';
        if (activeCategory !== 'all') {
            filtered = filtered.filter(expense => expense.category === activeCategory);
        }

        // Apply date filters
        const startDate = document.getElementById('expenseStartDate').value;
        const endDate = document.getElementById('expenseEndDate').value;

        if (startDate) {
            filtered = filtered.filter(expense => expense.date >= startDate);
        }
        if (endDate) {
            filtered = filtered.filter(expense => expense.date <= endDate);
        }

        // Apply search
        if (searchTerm) {
            filtered = filtered.filter(expense =>
                expense.description.toLowerCase().includes(searchTerm) ||
                expense.vendor.toLowerCase().includes(searchTerm) ||
                (expense.notes && expense.notes.toLowerCase().includes(searchTerm))
            );
        }

        this.filteredExpenses = filtered;
        this.updateCategoryAmountDisplay(activeCategory, filtered);
        this.renderExpensesTable(filtered);
    },

    /**
     * Render expenses table
     */
    renderExpensesTable(expenses) {
        const tbody = document.getElementById('expensesTableBody');

        if (expenses.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="7" class="text-center" style="padding: 3rem; color: var(--text-secondary);">
                        No expenses found. Try adjusting your filters or add a new expense.
                    </td>
                </tr>
            `;
            return;
        }

        // Sort by creation time (newest first)
        const sortedExpenses = [...expenses].sort((a, b) => b.createdAt - a.createdAt);

        tbody.innerHTML = sortedExpenses.map(expense => {
            const categoryIcons = {
                supplies: '📦',
                maintenance: '🔧',
                utilities: '⚡',
                management: '💼',
                other: '📌'
            };

            return `
                <tr data-expense-id="${expense.id}">
                    <td data-label="Date">${Utils.formatDate(expense.date)}</td>
                    <td data-label="Category">
                        <span class="category-badge ${expense.category}">
                            ${categoryIcons[expense.category] || '📌'} ${expense.category}
                        </span>
                    </td>
                    <td data-label="Description">${expense.description}</td>
                    <td data-label="Amount" class="amount-cell">KES ${parseFloat(expense.amount).toLocaleString('en-KE', { minimumFractionDigits: 2 })}</td>
                    <td data-label="Vendor">${expense.vendor || '-'}</td>
                    <td data-label="Actions">
                        <div class="action-buttons">
                            <button class="btn-icon-small" onclick="app.editExpense('${expense.id}')" title="Edit">✏️</button>
                            <button class="btn-icon-small" onclick="app.deleteExpense('${expense.id}')" title="Delete">🗑️</button>
                        </div>
                    </td>
                </tr>
            `;
        }).join('');
    },

    /**
     * Show add expense modal
     */
    async showAddExpenseModal() {
        const today = new Date().toISOString().split('T')[0];

        Modal.show({
            title: 'Add New Expense',
            content: `
                <form id="addExpenseForm" class="form-modern">
                    <div class="form-group">
                        <label for="expenseDate">Date *</label>
                        <input type="date" id="expenseDate" class="form-control" value="${today}" required>
                    </div>

                    <div class="form-group">
                        <label for="expenseCategory">Category *</label>
                        <select id="expenseCategory" class="form-control" required>
                            <option value="supplies">📦 Supplies</option>
                            <option value="maintenance">🔧 Maintenance</option>
                            <option value="utilities">⚡ Utilities</option>
                            <option value="management">💼 Management</option>
                            <option value="other">📌 Other</option>
                        </select>
                    </div>

                    <div class="form-group">
                        <label for="expenseAmount">Amount (KES) *</label>
                        <input type="number" id="expenseAmount" class="form-control" step="0.01" min="0" placeholder="0.00" required>
                    </div>

                    <div class="form-group">
                        <label for="expenseDescription">Description *</label>
                        <input type="text" id="expenseDescription" class="form-control" placeholder="What was this expense for?" required>
                    </div>

                    <div class="form-group">
                        <label for="expensePaymentMethod">Payment Method</label>
                        <select id="expensePaymentMethod" class="form-control">
                            <option value="cash">Cash</option>
                            <option value="mpesa">M-Pesa</option>
                            <option value="bank">Bank Transfer</option>
                            <option value="other">Other</option>
                        </select>
                    </div>

                    <div class="form-group">
                        <label for="expenseVendor">Vendor/Supplier</label>
                        <input type="text" id="expenseVendor" class="form-control" placeholder="Who was paid?">
                    </div>

                    <div class="form-group">
                        <label for="expenseNotes">Notes</label>
                        <textarea id="expenseNotes" class="form-control" rows="3" placeholder="Additional details..."></textarea>
                    </div>
                </form>
            `,
            buttons: [
                {
                    text: 'Cancel',
                    className: 'btn btn-outline',
                    onClick: () => {
                        return true; // Close modal
                    }
                },
                {
                    text: 'Add Expense',
                    className: 'btn btn-primary',
                    onClick: async () => {
                        const form = document.getElementById('addExpenseForm');
                        if (!form.checkValidity()) {
                            form.reportValidity();
                            return false; // Keep modal open
                        }

                        await this.addExpense();
                        return true; // Close modal
                    }
                }
            ]
        });
    },

    /**
     * Add new expense
     */
    async addExpense() {
        try {
            const expense = {
                // ID will be auto-generated by DB.addExpense using sequential pattern EXP-0001
                date: document.getElementById('expenseDate').value,
                category: document.getElementById('expenseCategory').value,
                amount: parseFloat(document.getElementById('expenseAmount').value),
                description: document.getElementById('expenseDescription').value.trim(),
                paymentMethod: document.getElementById('expensePaymentMethod').value,
                vendor: document.getElementById('expenseVendor').value.trim(),
                notes: document.getElementById('expenseNotes').value.trim()
            };

            // Validate
            if (!expense.date || !expense.category || !expense.amount || !expense.description) {
                Toast.error('Please fill in all required fields');
                return false;
            }

            if (expense.amount <= 0) {
                Toast.error('Amount must be greater than zero');
                return false;
            }

            // Save to IndexedDB - returns the generated ID
            const generatedId = await this.getDB().addExpense(expense);

            // Add the generated ID to the expense object
            expense.id = generatedId;

            Toast.success('Expense added successfully!');

            // Note: Real-time listener automatically updates expenses panel

            // Sync to backend in background (non-blocking)
            if (window.ApiService?.config.isConfigured && navigator.onLine) {
                window.ApiService.addExpense(expense).then(() => {
                    console.log('✅ Expense synced to backend:', generatedId);
                }).catch(error => {
                    console.warn('⚠️ Background sync failed for expense:', generatedId, error);
                });
            }
        } catch (error) {
            console.error('Error adding expense:', error);
            Toast.error('Failed to add expense');
            return false;
        }
    },

    /**
     * Edit expense
     */
    async editExpense(expenseId) {
        try {
            const expense = this.currentExpenses.find(e => e.id === expenseId);
            if (!expense) {
                Toast.error('Expense not found');
                return;
            }

            Modal.show({
                title: 'Edit Expense',
                content: `
                    <form id="editExpenseForm" class="form-modern">
                        <div class="form-group">
                            <label for="editExpenseDate">Date *</label>
                            <input type="date" id="editExpenseDate" class="form-control" value="${expense.date}" required>
                        </div>

                        <div class="form-group">
                            <label for="editExpenseCategory">Category *</label>
                            <select id="editExpenseCategory" class="form-control" required>
                                <option value="supplies" ${expense.category === 'supplies' ? 'selected' : ''}>📦 Supplies</option>
                                <option value="maintenance" ${expense.category === 'maintenance' ? 'selected' : ''}>🔧 Maintenance</option>
                                <option value="utilities" ${expense.category === 'utilities' ? 'selected' : ''}>⚡ Utilities</option>
                                <option value="management" ${expense.category === 'management' ? 'selected' : ''}>💼 Management</option>
                                <option value="other" ${expense.category === 'other' ? 'selected' : ''}>📌 Other</option>
                            </select>
                        </div>

                        <div class="form-group">
                            <label for="editExpenseAmount">Amount (KES) *</label>
                            <input type="number" id="editExpenseAmount" class="form-control" step="0.01" min="0" value="${expense.amount}" required>
                        </div>

                        <div class="form-group">
                            <label for="editExpenseDescription">Description *</label>
                            <input type="text" id="editExpenseDescription" class="form-control" value="${expense.description}" required>
                        </div>

                        <div class="form-group">
                            <label for="editExpensePaymentMethod">Payment Method</label>
                            <select id="editExpensePaymentMethod" class="form-control">
                                <option value="cash" ${expense.paymentMethod === 'cash' ? 'selected' : ''}>Cash</option>
                                <option value="mpesa" ${expense.paymentMethod === 'mpesa' ? 'selected' : ''}>M-Pesa</option>
                                <option value="bank" ${expense.paymentMethod === 'bank' ? 'selected' : ''}>Bank Transfer</option>
                                <option value="other" ${expense.paymentMethod === 'other' ? 'selected' : ''}>Other</option>
                            </select>
                        </div>

                        <div class="form-group">
                            <label for="editExpenseVendor">Vendor/Supplier</label>
                            <input type="text" id="editExpenseVendor" class="form-control" value="${expense.vendor || ''}">
                        </div>

                        <div class="form-group">
                            <label for="editExpenseNotes">Notes</label>
                            <textarea id="editExpenseNotes" class="form-control" rows="3">${expense.notes || ''}</textarea>
                        </div>
                    </form>
                `,
                size: 'medium',
                buttons: [
                    {
                        text: 'Cancel',
                        className: 'btn btn-outline',
                        onClick: () => true
                    },
                    {
                        text: 'Save Changes',
                        className: 'btn btn-primary',
                        onClick: async () => {
                            const form = document.getElementById('editExpenseForm');
                            if (!form.checkValidity()) {
                                form.reportValidity();
                                return false;
                            }

                            try {
                                Loading.show();

                                const updatedExpense = {
                                    ...expense,
                                    date: document.getElementById('editExpenseDate').value,
                                    category: document.getElementById('editExpenseCategory').value,
                                    amount: parseFloat(document.getElementById('editExpenseAmount').value),
                                    description: document.getElementById('editExpenseDescription').value.trim(),
                                    paymentMethod: document.getElementById('editExpensePaymentMethod').value,
                                    vendor: document.getElementById('editExpenseVendor').value.trim(),
                                    notes: document.getElementById('editExpenseNotes').value.trim(),
                                    updatedAt: Date.now()
                                };

                                // Save to IndexedDB
                                await this.getDB().updateExpense(updatedExpense);

                                // Sync to backend if configured
                                if (window.ApiService && window.ApiService.config.isConfigured) {
                                    await window.ApiService.updateExpense(updatedExpense);
                                }

                                Toast.success('Expense updated successfully!');

                                // Note: Real-time listener automatically updates expenses panel

                                return true;
                            } catch (error) {
                                console.error('Error updating expense:', error);
                                Toast.error('Failed to update expense');
                                return false;
                            } finally {
                                Loading.hide();
                            }
                        }
                    }
                ]
            });
        } catch (error) {
            console.error('Error editing expense:', error);
            Toast.error('Failed to edit expense');
        }
    },

    /**
     * Delete expense
     */
    deleteExpense(expenseId) {
        const expense = this.currentExpenses.find(e => e.id === expenseId);
        if (!expense) {
            Toast.error('Expense not found');
            return;
        }

        Modal.show({
            title: 'Delete Expense',
            content: `
                <div style="text-align: center;">
                    <div class="modal-icon warning">⚠️</div>
                    <p style="font-size: 1.05rem;">
                        Are you sure you want to delete this expense?<br>
                        <strong>"${Utils.sanitizeHTML(expense.description)}"</strong><br>
                        <span style="color: var(--danger);">KES ${parseFloat(expense.amount).toLocaleString('en-KE', { minimumFractionDigits: 2 })}</span>
                    </p>
                    <p style="color: var(--text-secondary); font-size: 0.875rem;">This action cannot be undone.</p>
                </div>
            `,
            size: 'small',
            buttons: [
                {
                    text: 'Cancel',
                    className: 'btn btn-outline',
                    onClick: () => true
                },
                {
                    text: 'Delete',
                    className: 'btn btn-danger',
                    onClick: async () => {
                        try {
                            Loading.show();

                            // Delete from IndexedDB
                            await this.getDB().deleteExpense(expenseId);

                            // Delete from backend if configured
                            if (window.ApiService && window.ApiService.config.isConfigured) {
                                await window.ApiService.deleteExpense(expenseId);
                            }

                            Toast.success('Expense deleted successfully!');

                            // Note: Real-time listener automatically updates expenses panel

                            return true;
                        } catch (error) {
                            console.error('Error deleting expense:', error);
                            Toast.error('Failed to delete expense');
                            return false;
                        } finally {
                            Loading.hide();
                        }
                    }
                }
            ]
        });
    },

    /**
     * Export expenses
     */
    async exportExpenses() {
        // Set default date range (last 30 days)
        const endDate = new Date();
        const startDate = new Date();
        startDate.setDate(endDate.getDate() - 30);

        const startDateStr = startDate.toISOString().split('T')[0];
        const endDateStr = endDate.toISOString().split('T')[0];

        const formHTML = `
            <div class="export-info">
                <h4>💸 Export Expenses</h4>
                <p>Export expense data in your preferred format</p>
            </div>

            <form id="exportExpensesForm">
                <!-- Time Range Selection -->
                <div class="form-section">
                    <h4>📅 Time Range</h4>
                    <div class="time-range-presets">
                        <button type="button" class="time-preset-btn" data-range="7">Last 7 days</button>
                        <button type="button" class="time-preset-btn active" data-range="30">Last 30 days</button>
                        <button type="button" class="time-preset-btn" data-range="90">Last 3 months</button>
                        <button type="button" class="time-preset-btn" data-range="180">Last 6 months</button>
                        <button type="button" class="time-preset-btn" data-range="365">Last year</button>
                        <button type="button" class="time-preset-btn" data-range="all">All time</button>
                    </div>
                    <div class="custom-date-range">
                        <div class="form-group">
                            <label>From Date:</label>
                            <input type="date" id="exportExpensesStartDate" class="form-control" value="${startDateStr}">
                        </div>
                        <div class="form-group">
                            <label>To Date:</label>
                            <input type="date" id="exportExpensesEndDate" class="form-control" value="${endDateStr}">
                        </div>
                    </div>
                </div>

                <!-- Format Selection -->
                <div class="form-section">
                    <h4>📁 Export Format</h4>
                    <div class="format-options">
                        <label class="format-option">
                            <input type="radio" name="exportExpenseFormat" value="pdf" checked>
                            <div class="format-card">
                                <div class="format-icon">📄</div>
                                <div class="format-name">PDF</div>
                                <div class="format-desc">Professional report</div>
                            </div>
                        </label>
                        <label class="format-option">
                            <input type="radio" name="exportExpenseFormat" value="csv">
                            <div class="format-card">
                                <div class="format-icon">📊</div>
                                <div class="format-name">CSV</div>
                                <div class="format-desc">Spreadsheet compatible</div>
                            </div>
                        </label>
                        <label class="format-option">
                            <input type="radio" name="exportExpenseFormat" value="json">
                            <div class="format-card">
                                <div class="format-icon">🔧</div>
                                <div class="format-name">JSON</div>
                                <div class="format-desc">Developer friendly</div>
                            </div>
                        </label>
                    </div>
                </div>

                <!-- Progress Display -->
                <div class="progress-section hidden" id="expensesExportProgress">
                    <div class="progress-bar">
                        <div class="progress-fill" id="expensesProgressFill"></div>
                    </div>
                    <div class="progress-text" id="expensesProgressText">Preparing export...</div>
                </div>
            </form>
        `;

        Modal.show({
            title: 'Export Expenses',
            content: formHTML,
            size: 'medium',
            buttons: [
                {
                    text: 'Cancel',
                    className: 'btn btn-outline',
                    onClick: () => true
                },
                {
                    text: 'Export',
                    className: 'btn btn-primary',
                    onClick: () => {
                        this.handleExpensesExport();
                        return false;
                    }
                }
            ]
        });

        // Setup time preset buttons after modal renders
        setTimeout(() => {
            document.querySelectorAll('.time-preset-btn').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    // Update active state
                    document.querySelectorAll('.time-preset-btn').forEach(b => b.classList.remove('active'));
                    e.target.classList.add('active');

                    // Calculate date range
                    const range = e.target.getAttribute('data-range');
                    const end = new Date();
                    const start = new Date();

                    if (range === 'all') {
                        start.setFullYear(2020, 0, 1);
                    } else {
                        start.setDate(end.getDate() - parseInt(range));
                    }

                    document.getElementById('exportExpensesStartDate').value = start.toISOString().split('T')[0];
                    document.getElementById('exportExpensesEndDate').value = end.toISOString().split('T')[0];
                });
            });
        }, 50);
    },

    /**
     * Handle expenses export
     */
    async handleExpensesExport() {
        const format = document.querySelector('input[name="exportExpenseFormat"]:checked')?.value;
        if (!format) {
            Toast.error('Please select an export format');
            return;
        }

        const startDate = document.getElementById('exportExpensesStartDate').value;
        const endDate = document.getElementById('exportExpensesEndDate').value;

        // Validate date range
        if (startDate && endDate && new Date(startDate) > new Date(endDate)) {
            Toast.error('Start date must be before end date');
            return;
        }

        // Show progress
        const progress = document.getElementById('expensesExportProgress');
        const progressFill = document.getElementById('expensesProgressFill');
        const progressText = document.getElementById('expensesProgressText');
        const exportBtn = event.target.closest('.btn-primary');

        try {
            exportBtn.disabled = true;
            progress.classList.remove('hidden');

            // Step 1: Collect data
            progressFill.style.width = '25%';
            progressText.textContent = 'Collecting expenses...';
            await this.sleep(300);

            let expenses = await this.getDB().getExpenses();

            // Filter by date
            if (startDate && endDate) {
                const start = new Date(startDate);
                const end = new Date(endDate);
                end.setHours(23, 59, 59, 999);

                expenses = expenses.filter(expense => {
                    const expenseDate = new Date(expense.date);
                    return expenseDate >= start && expenseDate <= end;
                });
            }

            // Sort by date (newest first)
            expenses.sort((a, b) => new Date(b.date) - new Date(a.date));

            // Step 2: Process data
            progressFill.style.width = '60%';
            progressText.textContent = 'Processing data...';
            await this.sleep(300);

            const timestamp = new Date().toISOString().split('T')[0];

            // Step 3: Generate export
            progressFill.style.width = '85%';
            progressText.textContent = `Generating ${format.toUpperCase()}...`;
            await this.sleep(300);

            switch (format) {
                case 'pdf':
                    this.exportExpensesToPDF(expenses, startDate, endDate, timestamp);
                    break;
                case 'csv':
                    this.exportExpensesToCSV(expenses, timestamp);
                    break;
                case 'json':
                    this.exportExpensesToJSON(expenses, timestamp);
                    break;
            }

            // Step 4: Complete
            progressFill.style.width = '100%';
            progressText.textContent = 'Export complete!';
            await this.sleep(500);

            Modal.close();
            Toast.success(`Expenses exported successfully!`);
        } catch (error) {
            console.error('Error exporting expenses:', error);
            Toast.error('Failed to export expenses');
        } finally {
            if (exportBtn) exportBtn.disabled = false;
            if (progress) progress.classList.add('hidden');
        }
    },


    /**
     * Export expenses to CSV
     */
    exportExpensesToCSV(expenses, timestamp) {
        const safeTimestamp = timestamp || new Date().toISOString().split('T')[0];

        let csvContent = 'Date,Category,Description,Amount,Method,Vendor,Notes\n';
        expenses.forEach(e => {
            csvContent += `${e.date},"${e.category}","${e.description}",${e.amount},"${e.paymentMethod || 'N/A'}","${e.vendor || 'N/A'}","${e.notes || ''}"\n`;
        });

        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        const url = URL.createObjectURL(blob);

        link.setAttribute('href', url);
        link.setAttribute('download', `expenses_${safeTimestamp}.csv`);
        link.style.visibility = 'hidden';

        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    },


    /**
     * Export expenses to JSON
     */
    exportExpensesToJSON(expenses, timestamp) {
        const safeTimestamp = timestamp || new Date().toISOString().split('T')[0];

        const exportData = {
            exportDate: new Date().toISOString(),
            totalExpenses: expenses.length,
            totalAmount: expenses.reduce((sum, e) => sum + e.amount, 0),
            expenses: expenses
        };

        const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
        const link = document.createElement('a');
        const url = URL.createObjectURL(blob);

        link.setAttribute('href', url);
        link.setAttribute('download', `expenses_${safeTimestamp}.json`);
        link.style.visibility = 'hidden';

        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    },

    /**
     * Export expenses to PDF
     */
    exportExpensesToPDF(expenses, startDate, endDate, timestamp) {
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF();

        // Calculate metrics
        const totalAmount = expenses.reduce((sum, e) => sum + e.amount, 0);
        const categoryBreakdown = {};
        const paymentMethods = {};
        const vendorBreakdown = {};

        expenses.forEach(e => {
            // Category breakdown
            categoryBreakdown[e.category] = (categoryBreakdown[e.category] || 0) + e.amount;
            // Payment methods
            if (e.paymentMethod) {
                paymentMethods[e.paymentMethod] = (paymentMethods[e.paymentMethod] || 0) + 1;
            }
            // Vendor breakdown
            if (e.vendor) {
                vendorBreakdown[e.vendor] = (vendorBreakdown[e.vendor] || 0) + e.amount;
            }
        });

        // ===== HEADER SECTION WITH BRAND COLOR =====
        doc.setFillColor(239, 68, 68); // Red for expenses
        doc.rect(0, 0, 210, 30, 'F');

        doc.setTextColor(255, 255, 255);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(20);
        doc.text('Expenses Report', 15, 15);

        doc.setFontSize(9);
        doc.setFont('helvetica', 'normal');
        doc.text(`Generated on ${new Date().toLocaleString()}`, 15, 23);

        // ===== METADATA SECTION =====
        doc.setTextColor(100, 100, 100);
        doc.setFontSize(10);
        let yPos = 38;
        doc.text(`Report Period: ${startDate && endDate ? `${startDate} to ${endDate}` : 'All Time'}`, 15, yPos);

        // ===== EXECUTIVE SUMMARY BOX =====
        yPos = 50;
        doc.setDrawColor(239, 68, 68);
        doc.setLineWidth(0.5);
        doc.rect(15, yPos, 180, 40);

        doc.setFontSize(14);
        doc.setTextColor(239, 68, 68);
        doc.setFont('helvetica', 'bold');
        doc.text('Executive Summary', 20, yPos + 8);

        // Summary metrics
        doc.setFontSize(11);
        doc.setTextColor(0, 0, 0);
        doc.setFont('helvetica', 'normal');

        doc.text(`Total Expenses:`, 20, yPos + 18);
        doc.setFont('helvetica', 'bold');
        doc.text(`${Utils.formatCurrency(totalAmount)}`, 95, yPos + 18);

        doc.setFont('helvetica', 'normal');
        doc.text(`Number of Expenses:`, 20, yPos + 26);
        doc.setFont('helvetica', 'bold');
        doc.text(`${expenses.length}`, 95, yPos + 26);

        doc.setFont('helvetica', 'normal');
        doc.text(`Categories:`, 20, yPos + 34);
        doc.setFont('helvetica', 'bold');
        doc.text(`${Object.keys(categoryBreakdown).length}`, 95, yPos + 34);

        // Average expense
        const avgExpense = expenses.length > 0 ? totalAmount / expenses.length : 0;
        doc.setFont('helvetica', 'normal');
        doc.text(`Average Expense:`, 110, yPos + 18);
        doc.setFont('helvetica', 'bold');
        doc.text(`${Utils.formatCurrency(avgExpense)}`, 170, yPos + 18);

        // ===== CATEGORY BREAKDOWN =====
        yPos += 50;
        doc.setFontSize(12);
        doc.setTextColor(239, 68, 68);
        doc.setFont('helvetica', 'bold');
        doc.text('Expenses by Category', 15, yPos);

        yPos += 8;
        doc.setFontSize(10);
        doc.setTextColor(0, 0, 0);
        doc.setFont('helvetica', 'normal');

        Object.entries(categoryBreakdown)
            .sort((a, b) => b[1] - a[1]) // Sort by amount descending
            .forEach(([category, amount]) => {
                const percentage = ((amount / totalAmount) * 100).toFixed(1);
                doc.text(`• ${category}: ${Utils.formatCurrency(amount)} (${percentage}%)`, 20, yPos);
                yPos += 6;

                if (yPos > 270) {
                    doc.addPage();
                    yPos = 20;
                }
            });

        // ===== PAYMENT METHODS BREAKDOWN =====
        if (Object.keys(paymentMethods).length > 0) {
            yPos += 8;
            doc.setFontSize(12);
            doc.setTextColor(239, 68, 68);
            doc.setFont('helvetica', 'bold');
            doc.text('Payment Methods Used', 15, yPos);

            yPos += 8;
            doc.setFontSize(10);
            doc.setTextColor(0, 0, 0);
            doc.setFont('helvetica', 'normal');

            Object.entries(paymentMethods).forEach(([method, count]) => {
                const percentage = ((count / expenses.length) * 100).toFixed(1);
                doc.text(`• ${method}: ${count} transactions (${percentage}%)`, 20, yPos);
                yPos += 6;

                if (yPos > 270) {
                    doc.addPage();
                    yPos = 20;
                }
            });
        }

        // ===== TOP VENDORS =====
        const topVendors = Object.entries(vendorBreakdown)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5);

        if (topVendors.length > 0) {
            yPos += 8;
            doc.setFontSize(12);
            doc.setTextColor(239, 68, 68);
            doc.setFont('helvetica', 'bold');
            doc.text('Top 5 Vendors by Spending', 15, yPos);

            yPos += 8;
            doc.setFontSize(10);
            doc.setTextColor(0, 0, 0);
            doc.setFont('helvetica', 'normal');

            topVendors.forEach(([vendor, amount], index) => {
                const percentage = ((amount / totalAmount) * 100).toFixed(1);
                doc.text(`${index + 1}. ${vendor}: ${Utils.formatCurrency(amount)} (${percentage}%)`, 20, yPos);
                yPos += 6;

                if (yPos > 270) {
                    doc.addPage();
                    yPos = 20;
                }
            });
        }

        // ===== DETAILED EXPENSES TABLE =====
        if (yPos > 200) {
            doc.addPage();
            yPos = 20;
        } else {
            yPos += 10;
        }

        doc.setFontSize(12);
        doc.setTextColor(239, 68, 68);
        doc.setFont('helvetica', 'bold');
        doc.text('Detailed Expense Records', 15, yPos);

        yPos += 10;

        // Table headers
        doc.setFillColor(240, 240, 240);
        doc.rect(15, yPos - 5, 180, 8, 'F');

        doc.setFontSize(9);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(0, 0, 0);
        doc.text('Date', 17, yPos);
        doc.text('Category', 40, yPos);
        doc.text('Description', 70, yPos);
        doc.text('Amount', 120, yPos);
        doc.text('Vendor', 145, yPos);
        doc.text('Method', 175, yPos);

        yPos += 8;

        // Table rows
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8);

        expenses.forEach((expense, index) => {
            if (yPos > 275) {
                doc.addPage();
                yPos = 20;

                // Repeat headers on new page
                doc.setFillColor(240, 240, 240);
                doc.rect(15, yPos - 5, 180, 8, 'F');
                doc.setFont('helvetica', 'bold');
                doc.setFontSize(9);
                doc.text('Date', 17, yPos);
                doc.text('Category', 40, yPos);
                doc.text('Description', 70, yPos);
                doc.text('Amount', 120, yPos);
                doc.text('Vendor', 145, yPos);
                doc.text('Method', 175, yPos);
                yPos += 8;
                doc.setFont('helvetica', 'normal');
                doc.setFontSize(8);
            }

            // Zebra striping
            if (index % 2 === 0) {
                doc.setFillColor(250, 250, 250);
                doc.rect(15, yPos - 4, 180, 6, 'F');
            }

            const expDateStr2 = expense.date ? (typeof expense.date === 'string' ? expense.date : new Date(expense.date).toISOString().split('T')[0]) : 'N/A';
            doc.text(expDateStr2, 17, yPos);
            doc.text((expense.category || '').substring(0, 12), 40, yPos);
            doc.text((expense.description || '').substring(0, 20), 70, yPos);
            doc.text(String(Utils.formatCurrency(expense.amount)), 120, yPos);
            doc.text((expense.vendor || 'N/A').substring(0, 12), 145, yPos);
            doc.text((expense.paymentMethod || 'N/A').substring(0, 8), 175, yPos);

            yPos += 6;
        });

        // ===== FOOTER =====
        const pageCount = doc.internal.getNumberOfPages();
        for (let i = 1; i <= pageCount; i++) {
            doc.setPage(i);
            doc.setFontSize(8);
            doc.setTextColor(150, 150, 150);
            doc.setFont('helvetica', 'normal');
            doc.text(`Page ${i} of ${pageCount}`, 15, 290);
            doc.text(`ContributionTracker Pro - Expenses Report`, 105, 290, { align: 'center' });
            doc.text(new Date().toLocaleDateString(), 195, 290, { align: 'right' });
        }

        doc.save(`expenses-report-${timestamp}.pdf`);
    },

    /**
     * ==========================================
     * END EXPENSES MANAGEMENT FUNCTIONS
     * ==========================================
     */

    /**
     * Save app name
     */
    async saveAppName() {
        try {
            const appName = document.getElementById('settingAppName').value.trim();

            if (!appName) {
                Toast.error('Please enter an app name');
                return;
            }

            await this.getDB().updateSettings({ appName });
            document.getElementById('appName').textContent = appName;
            Toast.success('App name saved!');
        } catch (error) {
            console.error('Error saving app name:', error);
            Toast.error('Failed to save app name');
        }
    },

    /**
     * Save theme
     */
    async saveTheme(theme) {
        try {
            await this.getDB().updateSettings({ theme });
        } catch (error) {
            console.error('Error saving theme:', error);
        }
    },

    /**
     * Export all data (complete backup with expenses)
     */
    async exportAllData() {
        try {
            Loading.show();

            const funds = await this.getDB().getAllFunds();
            const groups = await this.getDB().getAllGroups();
            const payments = await this.getDB().getAllPayments();
            const expenses = await this.getDB().getExpenses?.() || [];
            const pledges = await this.getDB().getAllPledges?.() || [];
            const settings = await this.getDB().getSettings();

            const backup = {
                version: '1.0',
                timestamp: new Date().toISOString(),
                backup_type: 'complete',
                data: {
                    funds,
                    groups,
                    payments,
                    pledges,
                    expenses,
                    settings
                },
                _backup: {
                    created: new Date().toISOString(),
                    totalRecords: funds.length + groups.length + payments.length + pledges.length + expenses.length,
                    app: 'ContributionTracker-Pro'
                }
            };

            const filename = `ContributionTracker_Backup_${Utils.formatDate(Date.now(), 'iso')}.json`;
            Utils.exportToJSON(backup, filename);

            Loading.hide();
            Toast.success('Backup created successfully!');
        } catch (error) {
            console.error('Error exporting data:', error);
            Toast.error('Failed to export data');
            Loading.hide();
        }
    },

    /**
     * Show import data modal
     */
    async showImportDataModal() {
        const fileInput = document.createElement('input');
        fileInput.type = 'file';
        fileInput.accept = '.json';

        fileInput.addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (!file) return;

            try {
                Loading.show();
                Toast.info('Reading file...');

                const content = await this.readFileContent(file);
                const data = JSON.parse(content);

                // Validate data structure
                if (!data || typeof data !== 'object') {
                    throw new Error('Invalid file format');
                }

                await this.importData(data);

            } catch (error) {
                console.error('Error importing data:', error);
                Toast.error('Failed to import data: ' + error.message);
                Loading.hide();
            }
        });

        fileInput.click();
    },

    /**
     * Read file content helper
     */
    readFileContent(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();

            reader.onload = (e) => {
                resolve(e.target.result);
            };

            reader.onerror = (e) => {
                reject(new Error('Failed to read file'));
            };

            reader.readAsText(file);
        });
    },

    /**
     * Import data from file
     */
    async importData(data) {
        try {
            // Determine data structure (backup format or simple export)
            const importData = data.data || data;

            let imported = 0;

            // Import funds - USE DB.put() instead of DB.addFund()
            if (importData.funds && Array.isArray(importData.funds)) {
                for (const fund of importData.funds) {
                    try {
                        await this.getDB().put('funds', fund);
                        imported++;
                    } catch (err) {
                        console.warn('Failed to import fund:', err);
                    }
                }
            }

            // Import groups - USE DB.put() instead of DB.addGroup()
            if (importData.groups && Array.isArray(importData.groups)) {
                for (const group of importData.groups) {
                    try {
                        await this.getDB().put('groups', group);
                        imported++;
                    } catch (err) {
                        console.warn('Failed to import group:', err);
                    }
                }
            }

            // Import payments - USE DB.put() instead of DB.addPayment()
            if (importData.payments && Array.isArray(importData.payments)) {
                for (const payment of importData.payments) {
                    try {
                        await this.getDB().put('payments', payment);
                        imported++;
                    } catch (err) {
                        console.warn('Failed to import payment:', err);
                    }
                }
            }

            // Import pledges - NEW
            if (importData.pledges && Array.isArray(importData.pledges)) {
                for (const pledge of importData.pledges) {
                    try {
                        await this.getDB().put('pledges', pledge);
                        imported++;
                    } catch (err) {
                        console.warn('Failed to import pledge:', err);
                    }
                }
            }

            // Import expenses - USE DB.put() instead of DB.addExpense()
            if (importData.expenses && Array.isArray(importData.expenses)) {
                for (const expense of importData.expenses) {
                    try {
                        await this.getDB().put('expenses', expense);
                        imported++;
                    } catch (err) {
                        console.warn('Failed to import expense:', err);
                    }
                }
            }

            // Update counters after import to avoid ID conflicts
            await this.updateCountersAfterImport(importData);

            Loading.hide();

            if (imported > 0) {
                Toast.success(`Successfully imported ${imported} records!`);
                // Show dashboard (real-time listeners auto-update cache)
                this.showPanel('dashboard');
            } else {
                Toast.warning('No data was imported');
            }

        } catch (error) {
            console.error('Error processing import:', error);
            Toast.error('Failed to process import data');
            Loading.hide();
        }
    },

    /**
     * Update counters after import to avoid ID conflicts
     */
    async updateCountersAfterImport(importData) {
        try {
            // Helper to find highest ID number from imported data
            const getMaxId = (items, prefix) => {
                if (!items || items.length === 0) return 0;
                const ids = items.map(item => {
                    if (!item.id) return 0;
                    const match = item.id.match(new RegExp(`${prefix}-(\\d+)`));
                    return match ? parseInt(match[1], 10) : 0;
                });
                return Math.max(...ids, 0);
            };

            // Get current counter values
            const currentCounters = {
                fund: await this.getDB().getCounter('fund'),
                group: await this.getDB().getCounter('group'),
                payment: await this.getDB().getCounter('payment'),
                expense: await this.getDB().getCounter('expense'),
                pledge: await this.getDB().getCounter('pledge')
            };

            // Find highest IDs from imported data
            const importedMaxIds = {
                fund: getMaxId(importData.funds, 'FND'),
                group: getMaxId(importData.groups, 'GRP'),
                payment: getMaxId(importData.payments, 'PAY'),
                expense: getMaxId(importData.expenses, 'EXP'),
                pledge: getMaxId(importData.pledges, 'PLG')
            };

            // Update counters to maximum of current or imported
            for (const [type, importedMax] of Object.entries(importedMaxIds)) {
                const currentValue = currentCounters[type] || 0;
                const newValue = Math.max(currentValue, importedMax);

                if (newValue > currentValue) {
                    await this.getDB().put('counters', { type, value: newValue });
                    console.log(`Updated ${type} counter from ${currentValue} to ${newValue}`);
                }
            }

        } catch (error) {
            console.error('Error updating counters after import:', error);
            // Don't throw - this is not critical enough to fail the import
        }
    },

    /**
     * Show restore backup modal
     */
    async showRestoreBackupModal() {
        const confirmed = await new Promise((resolve) => {
            Confirm.show(
                'Restore from backup? This will ADD data from the backup file to your existing data. To replace all data, clear data first then restore.',
                () => resolve(true),
                () => resolve(false)
            );
        });

        if (!confirmed) return;

        const fileInput = document.createElement('input');
        fileInput.type = 'file';
        fileInput.accept = '.json';

        fileInput.addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (!file) return;

            try {
                Loading.show();
                Toast.info('Reading backup file...');

                const content = await this.readFileContent(file);
                const backup = JSON.parse(content);

                // Validate backup structure
                if (!backup || !backup.version) {
                    throw new Error('Invalid backup file format');
                }

                if (!backup.data && !backup.funds) {
                    throw new Error('Backup file contains no data');
                }

                Toast.info('Restoring backup...');
                await this.importData(backup);

            } catch (error) {
                console.error('Error restoring backup:', error);
                Toast.error('Failed to restore backup: ' + error.message);
                Loading.hide();
            }
        });

        fileInput.click();
    },

    /**
     * Clear all data
     */
    clearAllData() {
        Confirm.show(
            'Are you sure you want to clear ALL data? This will delete all funds, groups, and payments. This action cannot be undone!',
            async () => {
                try {
                    Loading.show();
                    await this.getDB().clearAllData();
                    Toast.success('All data cleared');
                    // Show dashboard (real-time listeners auto-update cache)
                    this.showPanel('dashboard');
                    Loading.hide();
                } catch (error) {
                    console.error('Error clearing data:', error);
                    Toast.error('Failed to clear data');
                    Loading.hide();
                }
            }
        );
    },

    /**
     * Load all payments
     */
    async loadAllPayments() {
        try {
            const payments = await this.getDB().getAllPayments();
            const funds = await this.getDB().getAllFunds();
            const groups = await this.getDB().getAllGroups();

            // Initialize filters if not already set
            if (!this.paymentFilters) {
                this.paymentFilters = {
                    fund: 'all',
                    group: 'all',
                    method: 'all',
                    dateRange: 'all',
                    search: '',
                    customDateStart: '',
                    customDateEnd: ''
                };
            }

            this.renderPaymentsStatCards(payments);
            this.renderPaymentsList(payments, funds, groups);
        } catch (error) {
            console.error('Error loading payments:', error);
            Toast.error('Failed to load payments');
        }
    },

    /**
     * Render payments stat cards
     */
    renderPaymentsStatCards(payments) {
        const container = document.getElementById('paymentsStatsCards');
        if (!container) return;

        // Calculate statistics
        const totalPayments = payments.length;
        const totalAmount = payments.reduce((sum, p) => sum + (p.amount || 0), 0);

        // Get this month's payments
        const now = new Date();
        const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
        const paymentsThisMonth = payments.filter(p => new Date(p.date) >= thisMonthStart);
        const thisMonthAmount = paymentsThisMonth.reduce((sum, p) => sum + (p.amount || 0), 0);

        // Calculate average payment
        const averagePayment = totalPayments > 0 ? totalAmount / totalPayments : 0;

        container.innerHTML = `
            <div class="metric-card success">
                <div class="metric-header">
                    <h3>Total Payments</h3>
                    <span class="metric-icon">💳</span>
                </div>
                <div class="metric-value">${Utils.formatCurrency(totalAmount)}</div>
                <div class="metric-change">All time</div>
            </div>

            <div class="metric-card info">
                <div class="metric-header">
                    <h3>This Month</h3>
                    <span class="metric-icon">📅</span>
                </div>
                <div class="metric-value">${Utils.formatCurrency(thisMonthAmount)}</div>
                <div class="metric-change">${paymentsThisMonth.length} payments</div>
            </div>

            <div class="metric-card primary">
                <div class="metric-header">
                    <h3>Average Payment</h3>
                    <span class="metric-icon">📊</span>
                </div>
                <div class="metric-value">${Utils.formatCurrency(averagePayment)}</div>
                <div class="metric-change">Per transaction</div>
            </div>

            <div class="metric-card warning">
                <div class="metric-header">
                    <h3>Payment Count</h3>
                    <span class="metric-icon">🔢</span>
                </div>
                <div class="metric-value">${totalPayments}</div>
                <div class="metric-change">Total records</div>
            </div>
        `;
    },

    /**
     * Render payments list with filters
     */
    renderPaymentsList(payments, funds, groups) {
        const container = document.getElementById('paymentsList');

        if (!payments || payments.length === 0) {
            container.innerHTML = `
                <div class="text-center" style="padding: 3rem;">
                    <div style="font-size: 4rem; margin-bottom: 1rem;">💳</div>
                    <h3>No Payments Yet</h3>
                    <p style="color: var(--text-secondary);">Payments will appear here once you start recording them.</p>
                </div>
            `;
            return;
        }

        // Apply filters
        let filtered = this.filterPayments(payments, funds, groups);

        // Sort by creation time (newest first)
        const sorted = Utils.sortBy(filtered, 'createdAt', 'desc');

        // Get unique payment methods
        const methods = [...new Set(payments.map(p => p.paymentMethod))];

        // Calculate totals
        const totalAmount = filtered.reduce((sum, p) => sum + parseFloat(p.amount), 0);

        container.innerHTML = `
            <!-- Filters Section -->
            <div style="margin-bottom: 1.5rem;">
                <!-- Search Bar -->
                <div style="margin-bottom: 1rem;">
                    <input type="text" id="paymentSearch" class="form-control" placeholder="Search by payer name or reference..."
                           value="${this.paymentFilters.search}" style="max-width: 400px;">
                </div>

                <!-- Filter Pills -->
                <div style="display: flex; flex-wrap: wrap; gap: 0.5rem; align-items: center; margin-bottom: 1rem;">
                    <span style="font-weight: 600; color: var(--text-secondary); margin-right: 0.5rem;">Filters:</span>

                    <!-- Fund Filter -->
                    <select id="filterByFund" class="form-control" style="width: auto; min-width: 150px;">
                        <option value="all">All Funds</option>
                        ${funds.map(f => `<option value="${f.id}" ${this.paymentFilters.fund === f.id ? 'selected' : ''}>${Utils.sanitizeHTML(f.name)}</option>`).join('')}
                    </select>

                    <!-- Group Filter -->
                    <select id="filterByGroup" class="form-control" style="width: auto; min-width: 150px;">
                        <option value="all">All Groups</option>
                        ${groups.map(g => `<option value="${g.id}" ${this.paymentFilters.group === g.id ? 'selected' : ''}>${Utils.sanitizeHTML(g.name)}</option>`).join('')}
                    </select>

                    <!-- Method Filter -->
                    <select id="filterByMethod" class="form-control" style="width: auto; min-width: 150px;">
                        <option value="all">All Methods</option>
                        ${methods.map(m => `<option value="${m}" ${this.paymentFilters.method === m ? 'selected' : ''}>${m}</option>`).join('')}
                    </select>

                    <!-- Date Range Filter -->
                    <select id="filterByDate" class="form-control" style="width: auto; min-width: 150px;">
                        <option value="all">All Time</option>
                        <option value="week" ${this.paymentFilters.dateRange === 'week' ? 'selected' : ''}>This Week</option>
                        <option value="month" ${this.paymentFilters.dateRange === 'month' ? 'selected' : ''}>This Month</option>
                        <option value="3months" ${this.paymentFilters.dateRange === '3months' ? 'selected' : ''}>Last 3 Months</option>
                        <option value="custom" ${this.paymentFilters.dateRange === 'custom' ? 'selected' : ''}>Custom Range</option>
                    </select>

                    <!-- Custom Date Range Inputs -->
                    <div id="customDateRange" style="display: ${this.paymentFilters.dateRange === 'custom' ? 'flex' : 'none'}; gap: 0.5rem; align-items: center;">
                        <input type="date" id="dateRangeStart" class="form-control" style="width: auto;"
                               value="${this.paymentFilters.customDateStart || ''}" placeholder="Start date">
                        <span style="color: var(--text-secondary);">to</span>
                        <input type="date" id="dateRangeEnd" class="form-control" style="width: auto;"
                               value="${this.paymentFilters.customDateEnd || ''}" placeholder="End date">
                    </div>

                    <!-- Clear Filters -->
                    ${this.hasActiveFilters() ? `
                        <button class="btn btn-sm btn-outline" onclick="App.clearPaymentFilters()">
                            <span class="btn-icon">✕</span>
                            Clear Filters
                        </button>
                    ` : ''}
                </div>

                <!-- Summary Stats -->
                <div style="display: flex; gap: 1rem; padding: 0.75rem; background: var(--surface-secondary); border-radius: var(--radius-md);">
                    <div>
                        <span style="font-size: 0.875rem; color: var(--text-secondary);">Showing:</span>
                        <strong style="margin-left: 0.25rem;">${filtered.length} payments</strong>
                    </div>
                    <div>
                        <span style="font-size: 0.875rem; color: var(--text-secondary);">Total:</span>
                        <strong style="margin-left: 0.25rem; color: var(--success-color);">${Utils.formatCurrency(totalAmount)}</strong>
                    </div>
                </div>
            </div>

            <!-- Payments Table -->
            ${filtered.length > 0 ? `
                <div style="overflow-x: auto;">
                    <table style="width: 100%; border-collapse: collapse;">
                        <thead>
                            <tr style="border-bottom: 2px solid var(--border-primary); text-align: left;">
                                <th style="padding: 1rem; cursor: pointer;" onclick="App.sortPayments('date')">
                                    Date <span style="font-size: 0.75rem;">▼</span>
                                </th>
                                <th style="padding: 1rem;">Fund</th>
                                <th style="padding: 1rem;">Group</th>
                                <th style="padding: 1rem; text-align: right;">Amount</th>
                                <th style="padding: 1rem;">Payer</th>
                                <th style="padding: 1rem;">Method</th>
                                <th style="padding: 1rem;">Reference</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${sorted.map(payment => {
                                const fund = funds.find(f => f.id === payment.fundId);
                                const group = groups.find(g => g.id === payment.groupId);
                                return `
                                    <tr style="border-bottom: 1px solid var(--border-primary); transition: background 0.2s ease;"
                                        onmouseover="this.style.background='var(--surface-secondary)'"
                                        onmouseout="this.style.background=''">
                                        <td style="padding: 1rem;">${Utils.formatDate(payment.date)}</td>
                                        <td style="padding: 1rem;">${fund ? Utils.sanitizeHTML(fund.name) : 'Unknown'}</td>
                                        <td style="padding: 1rem;">${group ? Utils.sanitizeHTML(group.name) : 'Unknown'}</td>
                                        <td style="padding: 1rem; text-align: right; font-weight: 600; color: var(--success-color);">${Utils.formatCurrency(payment.amount)}</td>
                                        <td style="padding: 1rem;">${payment.payerName || 'N/A'}</td>
                                        <td style="padding: 1rem;"><span class="badge badge-secondary">${payment.paymentMethod}</span></td>
                                        <td style="padding: 1rem; font-size: 0.875rem; color: var(--text-tertiary);">${payment.referenceNumber || '-'}</td>
                                    </tr>
                                `;
                            }).join('')}
                        </tbody>
                    </table>
                </div>
            ` : `
                <div class="text-center" style="padding: 2rem;">
                    <p style="color: var(--text-secondary);">No payments match your current filters.</p>
                </div>
            `}
        `;

        // Set up event listeners
        setTimeout(() => {
            const searchInput = document.getElementById('paymentSearch');
            if (searchInput) {
                searchInput.addEventListener('input', (e) => {
                    this.paymentFilters.search = e.target.value;
                    this.renderPaymentsFromCache(); // Instant filter from cache
                });
            }

            const filterFund = document.getElementById('filterByFund');
            if (filterFund) {
                filterFund.addEventListener('change', (e) => {
                    this.paymentFilters.fund = e.target.value;
                    this.renderPaymentsFromCache(); // Instant filter from cache
                });
            }

            const filterGroup = document.getElementById('filterByGroup');
            if (filterGroup) {
                filterGroup.addEventListener('change', (e) => {
                    this.paymentFilters.group = e.target.value;
                    this.renderPaymentsFromCache(); // Instant filter from cache
                });
            }

            const filterMethod = document.getElementById('filterByMethod');
            if (filterMethod) {
                filterMethod.addEventListener('change', (e) => {
                    this.paymentFilters.method = e.target.value;
                    this.renderPaymentsFromCache(); // Instant filter from cache
                });
            }

            const filterDate = document.getElementById('filterByDate');
            if (filterDate) {
                filterDate.addEventListener('change', (e) => {
                    this.paymentFilters.dateRange = e.target.value;
                    // Show/hide custom date range inputs
                    const customDateRange = document.getElementById('customDateRange');
                    if (customDateRange) {
                        customDateRange.style.display = e.target.value === 'custom' ? 'flex' : 'none';
                    }
                    this.renderPaymentsFromCache(); // Instant filter from cache
                });
            }

            // Custom date range inputs
            const dateRangeStart = document.getElementById('dateRangeStart');
            if (dateRangeStart) {
                dateRangeStart.addEventListener('change', (e) => {
                    this.paymentFilters.customDateStart = e.target.value;
                    this.renderPaymentsFromCache(); // Instant filter from cache
                });
            }

            const dateRangeEnd = document.getElementById('dateRangeEnd');
            if (dateRangeEnd) {
                dateRangeEnd.addEventListener('change', (e) => {
                    this.paymentFilters.customDateEnd = e.target.value;
                    this.renderPaymentsFromCache(); // Instant filter from cache
                });
            }
        }, 50);
    },

    /**
     * Filter payments based on current filters
     */
    filterPayments(payments, funds, groups) {
        return payments.filter(payment => {
            // Fund filter
            if (this.paymentFilters.fund !== 'all' && payment.fundId !== this.paymentFilters.fund) {
                return false;
            }

            // Group filter
            if (this.paymentFilters.group !== 'all' && payment.groupId !== this.paymentFilters.group) {
                return false;
            }

            // Method filter
            if (this.paymentFilters.method !== 'all' && payment.paymentMethod !== this.paymentFilters.method) {
                return false;
            }

            // Date range filter
            if (this.paymentFilters.dateRange !== 'all') {
                const paymentDate = new Date(payment.date);

                if (this.paymentFilters.dateRange === 'custom') {
                    // Custom date range
                    if (this.paymentFilters.customDateStart || this.paymentFilters.customDateEnd) {
                        const startDate = this.paymentFilters.customDateStart ? new Date(this.paymentFilters.customDateStart) : null;
                        const endDate = this.paymentFilters.customDateEnd ? new Date(this.paymentFilters.customDateEnd) : null;

                        if (startDate && paymentDate < startDate) return false;
                        if (endDate && paymentDate > endDate) return false;
                    }
                } else {
                    // Preset date ranges
                    const now = new Date();
                    const daysDiff = Math.floor((now - paymentDate) / (1000 * 60 * 60 * 24));

                    if (this.paymentFilters.dateRange === 'week' && daysDiff > 7) return false;
                    if (this.paymentFilters.dateRange === 'month' && daysDiff > 30) return false;
                    if (this.paymentFilters.dateRange === '3months' && daysDiff > 90) return false;
                }
            }

            // Search filter
            if (this.paymentFilters.search) {
                const searchTerm = this.paymentFilters.search.toLowerCase();
                const payerMatch = (payment.payerName || '').toLowerCase().includes(searchTerm);
                const refMatch = (payment.referenceNumber || '').toLowerCase().includes(searchTerm);
                if (!payerMatch && !refMatch) return false;
            }

            return true;
        });
    },

    /**
     * Check if any filters are active
     */
    hasActiveFilters() {
        return this.paymentFilters.fund !== 'all' ||
               this.paymentFilters.group !== 'all' ||
               this.paymentFilters.method !== 'all' ||
               this.paymentFilters.dateRange !== 'all' ||
               this.paymentFilters.search !== '';
    },

    /**
     * Clear all payment filters
     */
    clearPaymentFilters() {
        this.paymentFilters = {
            fund: 'all',
            group: 'all',
            method: 'all',
            dateRange: 'all',
            search: '',
            customDateStart: '',
            customDateEnd: ''
        };
        this.renderPaymentsFromCache(); // Instant render from cache
    },

    /**
     * Sort payments (placeholder for future enhancement)
     */
    sortPayments(column) {
        // Could implement multi-column sorting in the future
        Toast.info('Advanced sorting coming soon!');
    },

    /**
     * Generate fund report
     */
    async generateFundReport() {
        try {
            Loading.show();
            const funds = await this.getDB().getAllFunds();

            const reportData = funds.map(fund => ({
                'Fund Name': fund.name,
                'Type': fund.type,
                'Total Goal': fund.type === 'allocated' ? fund.totalGoal : 'N/A',
                'Total Collected': fund.totalCollected,
                'Remaining': fund.type === 'allocated' ? (fund.totalGoal - fund.totalCollected) : 'N/A',
                'Progress': fund.type === 'allocated' ? `${Utils.calculatePercentage(fund.totalCollected, fund.totalGoal)}%` : 'N/A',
                'Created': Utils.formatDate(fund.createdAt)
            }));

            Utils.exportToCSV(reportData, `Fund_Report_${Utils.formatDate(Date.now(), 'iso')}.csv`);

            Loading.hide();
            Toast.success('Fund report generated!');
        } catch (error) {
            console.error('Error generating report:', error);
            Toast.error('Failed to generate report');
            Loading.hide();
        }
    },

    /**
     * Generate payment report
     */
    async generatePaymentReport() {
        try {
            Loading.show();
            const payments = await this.getDB().getAllPayments();
            const funds = await this.getDB().getAllFunds();
            const groups = await this.getDB().getAllGroups();

            const reportData = payments.map(payment => {
                const fund = funds.find(f => f.id === payment.fundId);
                const group = groups.find(g => g.id === payment.groupId);
                return {
                    'Date': Utils.formatDate(payment.date),
                    'Fund': fund ? fund.name : 'Unknown',
                    'Group': group ? group.name : 'Unknown',
                    'Amount': payment.amount,
                    'Payer': payment.payerName || 'N/A',
                    'Method': payment.paymentMethod,
                    'Reference': payment.referenceNumber || 'N/A',
                    'Note': payment.note || 'N/A'
                };
            });

            Utils.exportToCSV(reportData, `Payment_Report_${Utils.formatDate(Date.now(), 'iso')}.csv`);

            Loading.hide();
            Toast.success('Payment report generated!');
        } catch (error) {
            console.error('Error generating report:', error);
            Toast.error('Failed to generate report');
            Loading.hide();
        }
    },

    /**
     * Search funds (instant - uses cache)
     */
    searchFunds(query) {
        const funds = this._cachedFunds || [];
        const filtered = query ?
            funds.filter(f => f.name.toLowerCase().includes(query.toLowerCase()) ||
                             (f.description && f.description.toLowerCase().includes(query.toLowerCase()))) :
            funds;
        this.renderFundsList(filtered);
    },

    /**
     * Search payments (instant - uses cache)
     */
    searchPayments(query) {
        const payments = this._cachedPayments || [];
        const funds = this._cachedFunds || [];
        const groups = this._cachedGroups || [];

        const filtered = query ?
            payments.filter(p => {
                const fund = funds.find(f => f.id === p.fundId);
                const group = groups.find(g => g.id === p.groupId);
                return (fund && fund.name.toLowerCase().includes(query.toLowerCase())) ||
                       (group && group.name.toLowerCase().includes(query.toLowerCase())) ||
                       (p.payerName && p.payerName.toLowerCase().includes(query.toLowerCase())) ||
                       (p.referenceNumber && p.referenceNumber.toLowerCase().includes(query.toLowerCase()));
            }) :
            payments;

        this.renderPaymentsList(filtered, funds, groups);
    },

    /**
     * Register service worker
     */
    registerServiceWorker() {
        // Only register service worker if served over HTTP/HTTPS
        if ('serviceWorker' in navigator && (location.protocol === 'http:' || location.protocol === 'https:')) {
            navigator.serviceWorker.register('./sw.js')
                .then(registration => {
                    console.log('✅ Service Worker registered:', registration);
                })
                .catch(error => {
                    console.error('❌ Service Worker registration failed:', error);
                });
        } else if (location.protocol === 'file:') {
            console.log('ℹ️ Service Worker skipped (file:// protocol)');
        }
    },

    /**
     * Update sync status indicator
     */
    updateSyncStatus() {
        const syncStatusEl = document.getElementById('syncStatus');
        const offlineIndicatorEl = document.getElementById('offlineIndicator');

        if (!syncStatusEl) return;

        const isOnline = navigator.onLine;

        if (isOnline) {
            // Check if Firestore is initialized
            let isFirestoreConnected = false;
            try {
                if (window.FirestoreDB && typeof window.FirestoreDB.getSyncStatus === 'function') {
                    const status = window.FirestoreDB.getSyncStatus();
                    isFirestoreConnected = status.isInitialized && status.isOnline;
                }
            } catch (error) {
                console.warn('Could not get Firestore sync status:', error);
            }

            // Update UI for online state
            syncStatusEl.className = 'sync-status connected';
            syncStatusEl.innerHTML = '<span class="sync-icon">🟢</span><span class="sync-text">Connected</span>';
            syncStatusEl.title = 'Connected to Firestore';

            if (offlineIndicatorEl) {
                offlineIndicatorEl.classList.add('hidden');
            }
        } else {
            // Update UI for offline state
            syncStatusEl.className = 'sync-status disconnected';
            syncStatusEl.innerHTML = '<span class="sync-icon">🔴</span><span class="sync-text">Offline</span>';
            syncStatusEl.title = 'No connection - changes saved locally';

            if (offlineIndicatorEl) {
                offlineIndicatorEl.classList.remove('hidden');
            }
        }
    },

    /**
     * Handle online event
     */
    handleOnline() {
        console.log('📶 Connection restored');

        this.updateSyncStatus();
        Toast.success('Connection restored');

        // Trigger sync if Firestore is available
        setTimeout(() => {
            try {
                if (window.FirestoreDB && typeof window.FirestoreDB.getSyncStatus === 'function') {
                    console.log('✅ Firestore connection restored - data will sync automatically');
                }
            } catch (error) {
                console.warn('Firestore sync check failed:', error);
            }
        }, 1000);
    },

    /**
     * Handle offline event
     */
    handleOffline() {
        console.log('📴 Connection lost');

        this.updateSyncStatus();
        Toast.warning('You are offline - changes will be saved locally');
    },

    /**
     * View group payments
     */
    async viewGroupPayments(groupId) {
        try {
            Loading.show();
            const group = await this.getDB().get('groups', groupId);
            const fund = await this.getDB().getFund(group.fundId);
            const payments = await this.getDB().getPaymentsByGroup(groupId);

            const sortedPayments = Utils.sortBy(payments, 'date', 'desc');

            // Calculate statistics
            const totalPaid = group.totalPaid;
            const remaining = fund.type === 'allocated' ? (group.allocation - totalPaid) : 0;
            const progress = fund.type === 'allocated' ? Utils.calculatePercentage(totalPaid, group.allocation) : 0;

            const paymentsHTML = sortedPayments.length > 0 ? `
                <table style="width: 100%; border-collapse: collapse; margin-top: 1rem;">
                    <thead>
                        <tr style="border-bottom: 2px solid var(--border-primary); text-align: left;">
                            <th style="padding: 0.75rem;">Date</th>
                            <th style="padding: 0.75rem;">Amount</th>
                            <th style="padding: 0.75rem;">Payer</th>
                            <th style="padding: 0.75rem;">Method</th>
                            <th style="padding: 0.75rem; text-align: center;">Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${sortedPayments.map(payment => `
                            <tr style="border-bottom: 1px solid var(--border-primary);">
                                <td style="padding: 0.75rem;">${Utils.formatDate(payment.date)}</td>
                                <td style="padding: 0.75rem; font-weight: 600; color: var(--success-color);">${Utils.formatCurrency(payment.amount)}</td>
                                <td style="padding: 0.75rem;">${payment.payerName || 'N/A'}</td>
                                <td style="padding: 0.75rem;"><span class="badge badge-secondary">${payment.paymentMethod}</span></td>
                                <td style="padding: 0.75rem; text-align: center;">
                                    <button class="btn btn-sm btn-outline" onclick="App.editPayment('${payment.id}')" style="margin-right: 0.5rem;" title="Edit Payment">
                                        ✏️
                                    </button>
                                    <button class="btn btn-sm btn-danger" onclick="App.deletePaymentFromHistory('${payment.id}', '${groupId}')" title="Delete Payment">
                                        🗑️
                                    </button>
                                </td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            ` : '<p style="text-align: center; color: var(--text-secondary); padding: 2rem;">No payments yet for this group.</p>';

            const content = `
                <div style="margin-bottom: 1.5rem;">
                    <h4 style="margin-bottom: 0.5rem;">${Utils.sanitizeHTML(group.name)}</h4>
                    <p style="color: var(--text-secondary); font-size: 0.875rem;">Fund: ${Utils.sanitizeHTML(fund.name)}</p>
                </div>

                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 1rem; margin-bottom: 1.5rem;">
                    <div style="background: var(--surface-secondary); padding: 1rem; border-radius: var(--radius-md);">
                        <div style="font-size: 0.875rem; color: var(--text-secondary);">Total Paid</div>
                        <div style="font-size: 1.5rem; font-weight: 700; color: var(--success-color);">${Utils.formatCurrency(totalPaid)}</div>
                    </div>
                    ${fund.type === 'allocated' ? `
                        <div style="background: var(--surface-secondary); padding: 1rem; border-radius: var(--radius-md);">
                            <div style="font-size: 0.875rem; color: var(--text-secondary);">Allocation</div>
                            <div style="font-size: 1.5rem; font-weight: 700; color: var(--primary-color);">${Utils.formatCurrency(group.allocation)}</div>
                        </div>
                        <div style="background: var(--surface-secondary); padding: 1rem; border-radius: var(--radius-md);">
                            <div style="font-size: 0.875rem; color: var(--text-secondary);">Remaining</div>
                            <div style="font-size: 1.5rem; font-weight: 700; color: var(--warning-color);">${Utils.formatCurrency(remaining)}</div>
                        </div>
                        <div style="background: var(--surface-secondary); padding: 1rem; border-radius: var(--radius-md);">
                            <div style="font-size: 0.875rem; color: var(--text-secondary);">Progress</div>
                            <div style="font-size: 1.5rem; font-weight: 700; color: var(--info-color);">${progress}%</div>
                        </div>
                    ` : `
                        <div style="background: var(--surface-secondary); padding: 1rem; border-radius: var(--radius-md);">
                            <div style="font-size: 0.875rem; color: var(--text-secondary);">Payments</div>
                            <div style="font-size: 1.5rem; font-weight: 700; color: var(--info-color);">${payments.length}</div>
                        </div>
                    `}
                </div>

                ${fund.type === 'allocated' && group.allocation ? `
                    <div style="margin-bottom: 1.5rem;">
                        <div style="display: flex; justify-content: space-between; margin-bottom: 0.5rem; font-size: 0.875rem;">
                            <span>${progress}% Complete</span>
                            <span>${payments.length} Payments</span>
                        </div>
                        <div class="progress">
                            <div class="progress-fill ${progress < 50 ? 'warning' : ''}" style="width: ${Math.min(progress, 100)}%"></div>
                        </div>
                    </div>
                ` : ''}

                <h4 style="margin-bottom: 1rem;">Payment History</h4>
                ${paymentsHTML}
            `;

            Modal.show({
                title: 'Group Payment History',
                content: content,
                size: 'large',
                buttons: [
                    {
                        text: 'Close',
                        className: 'btn btn-outline',
                        onClick: () => true
                    }
                ]
            });

            Loading.hide();
        } catch (error) {
            console.error('Error viewing group payments:', error);
            Toast.error('Failed to load group payment history');
            Loading.hide();
        }
    },

    /**
     * Edit payment
     */
    async editPayment(paymentId) {
        try {
            Loading.show();
            const payment = await this.getDB().get('payments', paymentId);
            const group = await this.getDB().get('groups', payment.groupId);
            const fund = await this.getDB().getFund(payment.fundId);
            Loading.hide();

            if (!payment || !group || !fund) {
                Toast.error('Payment, group, or fund not found');
                return;
            }

            // Build form HTML
            const formHTML = `
                <div class="form-group">
                    <label for="editPaymentAmount" class="form-label required">Amount</label>
                    <input type="number" id="editPaymentAmount" class="form-control" step="0.01" min="0.01" value="${payment.amount}" required>
                </div>

                <div class="form-group">
                    <label for="editPaymentDate" class="form-label required">Payment Date</label>
                    <input type="date" id="editPaymentDate" class="form-control" value="${payment.date}" required>
                </div>

                <div class="form-group">
                    <label for="editPaymentPayerName" class="form-label">Payer Name</label>
                    <input type="text" id="editPaymentPayerName" class="form-control" placeholder="Enter payer name (optional)" value="${payment.payerName || ''}">
                </div>

                <div class="form-group">
                    <label for="editPaymentMethod" class="form-label required">Payment Method</label>
                    <select id="editPaymentMethod" class="form-control" required>
                        <option value="Cash" ${payment.paymentMethod === 'Cash' ? 'selected' : ''}>Cash</option>
                        <option value="M-Pesa" ${payment.paymentMethod === 'M-Pesa' ? 'selected' : ''}>M-Pesa</option>
                        <option value="Bank Transfer" ${payment.paymentMethod === 'Bank Transfer' ? 'selected' : ''}>Bank Transfer</option>
                        <option value="Cheque" ${payment.paymentMethod === 'Cheque' ? 'selected' : ''}>Cheque</option>
                        <option value="Other" ${payment.paymentMethod === 'Other' ? 'selected' : ''}>Other</option>
                    </select>
                </div>

                <div class="form-group">
                    <label for="editPaymentReference" class="form-label">Reference Number</label>
                    <input type="text" id="editPaymentReference" class="form-control" placeholder="Transaction/Reference number (optional)" value="${payment.referenceNumber || ''}">
                </div>

                <div style="padding: 1rem; background: var(--surface-secondary); border-radius: var(--radius-md); margin-top: 1rem;">
                    <p style="margin: 0; color: var(--text-secondary); font-size: 0.875rem;">
                        <strong>Group:</strong> ${Utils.sanitizeHTML(group.name)}<br>
                        <strong>Fund:</strong> ${Utils.sanitizeHTML(fund.name)}
                    </p>
                </div>
            `;

            Modal.show({
                title: 'Edit Payment',
                content: formHTML,
                size: 'medium',
                buttons: [
                    {
                        text: 'Cancel',
                        className: 'btn btn-outline',
                        onClick: () => true
                    },
                    {
                        text: 'Save Changes',
                        className: 'btn btn-primary',
                        onClick: async () => {
                            const amount = parseFloat(document.getElementById('editPaymentAmount').value);
                            const date = document.getElementById('editPaymentDate').value;
                            const payerName = document.getElementById('editPaymentPayerName').value.trim();
                            const paymentMethod = document.getElementById('editPaymentMethod').value;
                            const referenceNumber = document.getElementById('editPaymentReference').value.trim();

                            if (!amount || amount <= 0) {
                                Toast.error('Please enter a valid amount');
                                return false;
                            }

                            if (!date) {
                                Toast.error('Please select a payment date');
                                return false;
                            }

                            if (!paymentMethod) {
                                Toast.error('Please select a payment method');
                                return false;
                            }

                            try {
                                Loading.show();

                                // Calculate the difference in amount
                                const oldAmount = payment.amount;
                                const amountDifference = amount - oldAmount;

                                // Update payment
                                const updatedPayment = {
                                    ...payment,
                                    amount,
                                    date,
                                    payerName: payerName || group.name,
                                    paymentMethod,
                                    referenceNumber,
                                    updatedAt: new Date().toISOString()
                                };

                                await this.getDB().updatePayment(updatedPayment);

                                // Update group total
                                const updatedGroup = {
                                    ...group,
                                    totalPaid: group.totalPaid + amountDifference
                                };
                                await this.getDB().updateGroup(updatedGroup);

                                // Update fund total
                                const updatedFund = {
                                    ...fund,
                                    totalCollected: fund.totalCollected + amountDifference
                                };
                                await this.getDB().updateFund(updatedFund);

                                // Sync to backend if configured
                                if (window.ApiService?.config.isConfigured && navigator.onLine) {
                                    try {
                                        await window.ApiService.updatePayment(updatedPayment);
                                        await window.ApiService.updateGroup(updatedGroup);
                                        await window.ApiService.updateFund(updatedFund);
                                        console.log('✅ Payment update synced to backend');
                                    } catch (syncError) {
                                        console.error('Failed to sync payment update to backend:', syncError);
                                    }
                                }

                                Toast.success('Payment updated successfully');

                                // Refresh the fund detail view
                                await this.viewFundDetail(fund.id);

                                Loading.hide();
                                return true;
                            } catch (error) {
                                console.error('Error updating payment:', error);
                                Toast.error(error.message || 'Failed to update payment');
                                Loading.hide();
                                return false;
                            }
                        }
                    }
                ]
            });
        } catch (error) {
            console.error('Error loading payment for edit:', error);
            Toast.error('Failed to load payment');
            Loading.hide();
        }
    },

    /**
     * Delete payment from history
     */
    async deletePaymentFromHistory(paymentId, groupId) {
        Confirm.show(
            'Are you sure you want to delete this payment? This action cannot be undone and will update the group and fund totals.',
            async () => {
                try {
                    Loading.show();

                    // Get payment, group, and fund details
                    const payment = await this.getDB().get('payments', paymentId);
                    const group = await this.getDB().get('groups', groupId);
                    const fund = await this.getDB().getFund(payment.fundId);

                    if (!payment || !group || !fund) {
                        Toast.error('Payment, group, or fund not found');
                        Loading.hide();
                        return;
                    }

                    const paymentAmount = payment.amount;

                    // Delete payment
                    await this.getDB().deletePayment(paymentId);

                    // Update group total
                    const updatedGroup = {
                        ...group,
                        totalPaid: Math.max(0, group.totalPaid - paymentAmount)
                    };
                    await this.getDB().updateGroup(updatedGroup);

                    // Update fund total
                    const updatedFund = {
                        ...fund,
                        totalCollected: Math.max(0, fund.totalCollected - paymentAmount)
                    };
                    await this.getDB().updateFund(updatedFund);

                    // Sync to backend if configured
                    if (window.ApiService?.config.isConfigured && navigator.onLine) {
                        try {
                            await window.ApiService.deletePayment({ id: paymentId });
                            await window.ApiService.updateGroup(updatedGroup);
                            await window.ApiService.updateFund(updatedFund);
                            console.log('✅ Payment deletion synced to backend');
                        } catch (syncError) {
                            console.error('Failed to sync payment deletion to backend:', syncError);
                        }
                    }

                    Toast.success('Payment deleted successfully');

                    // Refresh the fund detail view
                    await this.viewFundDetail(fund.id);

                    Loading.hide();
                } catch (error) {
                    console.error('Error deleting payment:', error);
                    Toast.error(error.message || 'Failed to delete payment');
                    Loading.hide();
                }
            }
        );
    },

    /**
     * Edit group
     */
    async editGroup(groupId) {
        try {
            Loading.show();
            const group = await this.getDB().get('groups', groupId);
            const fund = await this.getDB().getFund(group.fundId);
            Loading.hide();

            let allocationHTML = '';
            if (fund.type === 'allocated') {
                // Calculate remaining allocation (excluding current group)
                const groups = await this.getDB().getGroupsByFund(fund.id);
                const otherGroupsTotal = groups
                    .filter(g => g.id !== groupId)
                    .reduce((sum, g) => sum + (g.allocation || 0), 0);
                const available = fund.totalGoal - otherGroupsTotal;

                allocationHTML = `
                    <div class="form-group">
                        <label for="editGroupAllocation">Allocation Amount *</label>
                        <input type="number" id="editGroupAllocation" class="form-control" min="0" step="0.01"
                               value="${group.allocation}" placeholder="0.00">
                        <small style="color: var(--text-tertiary); margin-top: 0.25rem; display: block;">
                            Available to allocate (including current): <strong>${Utils.formatCurrency(available)}</strong>
                        </small>
                    </div>
                `;
            }

            const formHTML = `
                <form id="formEditGroup">
                    <div class="form-group">
                        <label for="editGroupName">Group Name *</label>
                        <input type="text" id="editGroupName" class="form-control" required
                               value="${Utils.sanitizeHTML(group.name)}" placeholder="e.g., East Wing Residents">
                    </div>
                    ${allocationHTML}
                </form>
            `;

            Modal.show({
                title: 'Edit Group',
                content: formHTML,
                size: 'medium',
                buttons: [
                    {
                        text: 'Cancel',
                        className: 'btn btn-outline',
                        onClick: () => true
                    },
                    {
                        text: 'Save Changes',
                        className: 'btn btn-primary',
                        onClick: async () => {
                            const name = document.getElementById('editGroupName').value.trim();
                            const allocation = document.getElementById('editGroupAllocation')?.value;

                            if (!name) {
                                Toast.error('Please enter a group name');
                                return false;
                            }

                            if (fund.type === 'allocated' && (!allocation || parseFloat(allocation) <= 0)) {
                                Toast.error('Please enter a valid allocation amount');
                                return false;
                            }

                            try {
                                Loading.show();

                                // Update group
                                group.name = name;
                                if (fund.type === 'allocated') {
                                    group.allocation = parseFloat(allocation);
                                }
                                group.updatedAt = Date.now();

                                await this.getDB().put('groups', group);

                                Modal.close();
                                Loading.hide();
                                Toast.success('Group updated successfully!');

                                // Schedule background sync
                                this.scheduleSyncToBackend();

                                // Refresh fund detail
                                await this.viewFundDetail(this.currentFund);
                                return true;
                            } catch (error) {
                                console.error('Error updating group:', error);
                                Toast.error(error.message || 'Failed to update group');
                                Loading.hide();
                                return false;
                            }
                        }
                    }
                ]
            });
        } catch (error) {
            console.error('Error loading group for editing:', error);
            Toast.error('Failed to load group');
            Loading.hide();
        }
    },

    /**
     * Calculator functionality
     */
    calculatorDisplay: '0',
    calculatorCurrentValue: null,
    calculatorPendingOperator: null,
    calculatorHistory: [],

    showCalculatorPanel() {
        this.renderCalculatorHistory();
    },

    calculatorInput(value) {
        const display = document.getElementById('calculatorDisplay');

        if (this.calculatorDisplay === '0' || this.calculatorDisplay === 'Error') {
            this.calculatorDisplay = value;
        } else {
            this.calculatorDisplay += value;
        }

        display.textContent = this.calculatorDisplay;
    },

    calculatorClear() {
        this.calculatorDisplay = '0';
        this.calculatorCurrentValue = null;
        this.calculatorPendingOperator = null;
        document.getElementById('calculatorDisplay').textContent = '0';
    },

    calculatorDelete() {
        if (this.calculatorDisplay.length > 1) {
            this.calculatorDisplay = this.calculatorDisplay.slice(0, -1);
        } else {
            this.calculatorDisplay = '0';
        }
        document.getElementById('calculatorDisplay').textContent = this.calculatorDisplay;
    },

    calculatorEquals() {
        try {
            const expression = this.calculatorDisplay.replace(/×/g, '*').replace(/÷/g, '/');

            // Simple evaluation (safe for basic calculator)
            const result = Function('"use strict"; return (' + expression + ')')();

            // Add to history
            this.addCalculationToHistory(this.calculatorDisplay + ' = ' + result);

            this.calculatorDisplay = result.toString();
            document.getElementById('calculatorDisplay').textContent = this.calculatorDisplay;
        } catch (error) {
            this.calculatorDisplay = 'Error';
            document.getElementById('calculatorDisplay').textContent = 'Error';
        }
    },

    addCalculationToHistory(calculation) {
        // Add to beginning of history
        this.calculatorHistory.unshift({
            expression: calculation,
            timestamp: new Date()
        });

        // Keep only last 10
        if (this.calculatorHistory.length > 10) {
            this.calculatorHistory = this.calculatorHistory.slice(0, 10);
        }

        this.renderCalculatorHistory();
    },

    renderCalculatorHistory() {
        const historyContainer = document.getElementById('calculatorHistory');

        if (this.calculatorHistory.length === 0) {
            historyContainer.innerHTML = '<div class="history-empty">No calculations yet</div>';
            return;
        }

        historyContainer.innerHTML = this.calculatorHistory.map(item => `
            <div class="history-item">
                <div class="history-expression">${item.expression}</div>
                <div class="history-time">${Utils.getRelativeTime(item.timestamp)}</div>
            </div>
        `).join('');
    },

    /**
     * Show About Dialog with app information
     */
    async showAboutDialog() {
        // Get current statistics (with fallback for locked state)
        let stats = { totalFunds: 0, totalCollected: 0, totalPledged: 0, totalPayments: 0 };
        let expenses = [];
        let groups = [];

        try {
            stats = await this.getDB().getDashboardStats();
            expenses = await this.getDB().getExpenses();
            groups = await this.getDB().getAllGroups();
        } catch (error) {
            console.log('ℹ️ About dialog shown without stats (app may be locked)');
        }

        const aboutContent = `
            <div class="about-sections">
                <!-- Header with icon and app name -->
                <div class="about-header-section">
                    <div class="about-icon">💰</div>
                    <div class="app-info">
                        <h2>ContributionTracker Pro</h2>
                        <p class="version">Version 1.1.0</p>
                    </div>
                </div>

                <!-- Application Details -->
                <div class="about-section">
                    <h3>📋 Application Details</h3>
                    <p>A comprehensive Progressive Web App for managing fund contributions, tracking payments, and monitoring expenses. Perfect for communities, groups, and organizations managing shared financial goals.</p>
                </div>

                <!-- Features List -->
                <div class="about-section">
                    <h3>⚡ Features</h3>
                    <ul>
                        <li>Create and manage multiple funds (Allocated & Open types)</li>
                        <li>Organize funds into groups with custom allocations</li>
                        <li>Record and track payments with detailed history</li>
                        <li>Monitor expenses across multiple categories</li>
                        <li>Generate comprehensive reports and exports</li>
                        <li>Built-in calculator for quick calculations</li>
                        <li>Google Sheets integration for data backup</li>
                        <li>Works completely offline with PWA technology</li>
                    </ul>
                </div>

                <!-- Developer Information -->
                <div class="about-section developer-info">
                    <h3>👨‍💻 Developer Information</h3>
                    <div class="developer-card">
                        <div class="developer-name">Built by: Hamster Innovations</div>
                        <div class="developer-contact">
                            <div class="contact-item">
                                <span class="contact-icon">📱</span>
                                <span class="contact-text">0717205175</span>
                            </div>
                            <div class="contact-item">
                                <span class="contact-icon">📧</span>
                                <span class="contact-text">innovationshamster@gmail.com</span>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Technical Information & Statistics Row -->
                <div class="about-sections-row">
                    <!-- Technical Information -->
                    <div class="about-section">
                        <h3>🔧 Technical Information</h3>
                        <div class="tech-grid">
                            <div class="tech-item"><strong>Platform:</strong> Progressive Web App</div>
                            <div class="tech-item"><strong>Framework:</strong> Vanilla JavaScript</div>
                            <div class="tech-item"><strong>Storage:</strong> IndexedDB</div>
                            <div class="tech-item"><strong>UI:</strong> Custom CSS3 + Modern Design</div>
                        </div>
                    </div>

                    <!-- Current Statistics -->
                    <div class="about-section">
                        <h3>📊 Current Statistics</h3>
                        <div class="stats-grid">
                        <div class="stat-item">
                            <span class="stat-label">Total Funds:</span>
                            <span class="stat-value">${stats.totalFunds || 0}</span>
                        </div>
                        <div class="stat-item">
                            <span class="stat-label">Total Groups:</span>
                            <span class="stat-value">${groups?.length || 0}</span>
                        </div>
                        <div class="stat-item">
                            <span class="stat-label">Total Payments:</span>
                            <span class="stat-value">${stats.totalPayments || 0}</span>
                        </div>
                        <div class="stat-item">
                            <span class="stat-label">Total Expenses:</span>
                            <span class="stat-value">${expenses?.length || 0}</span>
                        </div>
                    </div>
                </div>
                </div>
            </div>
        `;

        // Use Modal.show to display the about dialog
        Modal.show({
            title: '💰 About ContributionTracker Pro',
            content: aboutContent,
            size: 'large',
            buttons: [{
                text: 'Close',
                className: 'btn btn-primary',
                onClick: () => true
            }]
        });
    }
};

// Make App available globally for Auth module
window.App = App;
// Also create lowercase alias for HTML onclick handlers
window.app = App;

// Wait for app-init.js to complete Firebase initialization and auth
window.addEventListener('appReady', async (event) => {
    console.log('📱 appReady event received, initializing app...');
    const { user, organization, firestoreAdapter } = event.detail;

    try {
        // Initialize app with organization context
        if (App.initialize) {
            await App.initialize(organization);
        } else {
            // Fallback to legacy init
            await App.init();
        }
        console.log('✅ App initialized with organization:', organization.name);
    } catch (error) {
        console.error('❌ App initialization error:', error);
    }
});

console.log('✅ App logic loaded');
