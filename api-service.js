// api-service.js - Backend API Service for ContributionTracker Pro
// Handles communication with Google Sheets via Google Apps Script

const ApiService = {
    // Configuration
    config: {
        webAppUrl: null,
        spreadsheetId: null,
        isConfigured: false,
        retryAttempts: 3,
        retryDelay: 1000
    },

    // Sleep helper function
    sleep: function(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    },

    // Retry mechanism with exponential backoff
    retryRequest: async function(requestFn, attempts = this.config.retryAttempts) {
        for (let i = 0; i < attempts; i++) {
            try {
                const result = await requestFn();
                return result;
            } catch (error) {
                console.warn(`Request attempt ${i + 1} failed:`, error.message);

                if (i === attempts - 1) {
                    throw error;
                }

                // Wait before retry with exponential backoff
                const delay = this.config.retryDelay * Math.pow(2, i);
                await this.sleep(delay);
            }
        }
    },

    // Initialize the API service with Google Sheets URL
    init: function(webAppUrl, spreadsheetId) {
        if (webAppUrl) {
            // Ensure URL ends with /exec for deployed web apps
            let cleanUrl = webAppUrl.trim();
            if (!cleanUrl.endsWith('/exec') && cleanUrl.includes('/macros/s/')) {
                cleanUrl += '/exec';
                console.log('🔧 Auto-corrected URL to:', cleanUrl);
            }

            this.config.webAppUrl = cleanUrl;
            this.config.spreadsheetId = spreadsheetId;
            this.config.isConfigured = true;
            console.log('✅ ApiService initialized with Google Sheets backend:', cleanUrl);
        } else {
            console.log('⚠️ ApiService running in local mode');
            this.config.isConfigured = false;
        }
    },

    // Set API URL (for settings updates)
    setApiUrl: function(url) {
        this.init(url, this.config.spreadsheetId);
        // Save to localStorage for persistence
        localStorage.setItem('contributionTracker_apiUrl', url);
    },

    // Get current API URL
    getApiUrl: function() {
        return this.config.webAppUrl;
    },

    // Test connection to Google Sheets backend
    testConnection: async function() {
        if (!this.config.isConfigured) {
            return { success: false, message: 'Google Sheets not configured - running in local mode' };
        }

        try {
            const url = `${this.config.webAppUrl}?action=test`;
            console.log('🧪 Testing connection to:', url);

            const response = await fetch(url);
            console.log('📶 Response status:', response.status);

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const contentType = response.headers.get('content-type');
            let result;

            if (contentType && contentType.includes('application/json')) {
                result = await response.json();
            } else {
                const textResult = await response.text();
                try {
                    result = JSON.parse(textResult);
                } catch (parseError) {
                    throw new Error(`Invalid JSON response: ${textResult.substring(0, 100)}...`);
                }
            }

            if (result.success) {
                return { success: true, message: result.message };
            } else {
                throw new Error(result.error);
            }
        } catch (error) {
            console.error('❌ Connection test failed:', error);
            return { success: false, message: `Connection failed: ${error.message}` };
        }
    },

    // Generic POST request handler
    makePostRequest: async function(action, data) {
        if (!this.config.isConfigured) {
            console.log(`📦 ${action} - Google Sheets not configured, operation saved locally`);
            return { success: true, message: 'Operation saved locally' };
        }

        try {
            const result = await this.retryRequest(async () => {
                console.log(`📤 ${action}:`, data?.id || 'new record');

                const response = await fetch(this.config.webAppUrl, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'text/plain', // KEY: Avoids CORS preflight!
                    },
                    body: JSON.stringify({
                        action: action,
                        data: data
                    })
                });

                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
                }

                return await response.json();
            });

            if (result.success) {
                console.log(`✅ ${action} successful`);
            }

            return result;
        } catch (error) {
            console.error(`❌ ${action} failed:`, error);
            return { success: false, error: error.message };
        }
    },

    // Generic GET request handler
    makeGetRequest: async function(action, params = {}) {
        if (!this.config.isConfigured) {
            return { success: false, message: 'Google Sheets not configured' };
        }

        try {
            const queryParams = new URLSearchParams({ action, ...params }).toString();
            const url = `${this.config.webAppUrl}?${queryParams}`;
            console.log(`📥 ${action}:`, url);

            const response = await fetch(url);

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const result = await response.json();

            if (result.success) {
                console.log(`✅ ${action} successful`);

                // Cache successful GET requests
                if (result.data) {
                    this.cacheData(action, result.data);
                }
            }

            return result;
        } catch (error) {
            console.error(`❌ ${action} failed:`, error);

            // Try to get cached data as fallback
            const cachedData = this.getCachedData(action);
            if (cachedData) {
                console.log(`📦 Using cached data for ${action}`);
                return { success: true, data: cachedData, cached: true };
            }

            return { success: false, error: error.message };
        }
    },

    // === CONTRIBUTIONTRACKER PRO SPECIFIC METHODS ===

    // Setup sheets
    setupSheets: async function() {
        return await this.makeGetRequest('setupSheets');
    },

    // === FUNDS MANAGEMENT ===
    getFunds: async function() {
        return await this.makeGetRequest('getFunds');
    },

    addFund: async function(fundData) {
        return await this.makePostRequest('addFund', fundData);
    },

    updateFund: async function(fundData) {
        return await this.makePostRequest('updateFund', fundData);
    },

    deleteFund: async function(fundId) {
        return await this.makePostRequest('deleteFund', { id: fundId });
    },

    // === GROUPS MANAGEMENT ===
    getGroups: async function(fundId) {
        return await this.makeGetRequest('getGroups', { fundId });
    },

    addGroup: async function(groupData) {
        return await this.makePostRequest('addGroup', groupData);
    },

    updateGroup: async function(groupData) {
        return await this.makePostRequest('updateGroup', groupData);
    },

    deleteGroup: async function(groupId) {
        return await this.makePostRequest('deleteGroup', { id: groupId });
    },

    // === PAYMENTS MANAGEMENT ===
    getPayments: async function() {
        return await this.makeGetRequest('getPayments');
    },

    recordPayment: async function(paymentData) {
        // Simple validation
        if (!paymentData.fundId || !paymentData.groupId || !paymentData.amount) {
            return { success: false, error: 'Missing required payment fields' };
        }

        if (!paymentData.id) {
            throw new Error('Payment data must have a valid ID');
        }

        const enhancedData = {
            ...paymentData,
            id: paymentData.id,
            timestamp: new Date().toISOString()
        };

        return await this.makePostRequest('recordPayment', enhancedData);
    },

    deletePayment: async function(paymentId) {
        return await this.makePostRequest('deletePayment', { id: paymentId });
    },

    // === EXPENSES MANAGEMENT ===
    getExpenses: async function(startDate = null, endDate = null) {
        const params = {};
        if (startDate) params.startDate = startDate;
        if (endDate) params.endDate = endDate;
        return await this.makeGetRequest('getExpenses', params);
    },

    addExpense: async function(expenseData) {
        // Simple validation
        if (!expenseData.amount || !expenseData.date || !expenseData.description) {
            return { success: false, error: 'Missing required expense fields' };
        }

        if (!expenseData.id) {
            throw new Error('Expense data must have a valid ID');
        }

        const enhancedData = {
            ...expenseData,
            id: expenseData.id,
            timestamp: new Date().toISOString(),
            category: expenseData.category || 'other'
        };

        return await this.makePostRequest('addExpense', enhancedData);
    },

    updateExpense: async function(expenseData) {
        return await this.makePostRequest('updateExpense', expenseData);
    },

    deleteExpense: async function(expenseId) {
        return await this.makePostRequest('deleteExpense', { id: expenseId });
    },

    // === SETTINGS ===
    getSettings: async function() {
        return await this.makeGetRequest('getSettings');
    },

    updateSettings: async function(settings) {
        return await this.makePostRequest('updateSettings', settings);
    },

    // === SYNC AND BACKUP ===

    // Sync all data to sheets
    syncToSheets: async function(data) {
        if (!this.config.isConfigured) {
            console.log('📤 Google Sheets not configured - data saved locally only');
            return { success: true, message: 'Data saved locally' };
        }

        try {
            console.log('📤 Syncing data to Google Sheets...');

            const response = await fetch(this.config.webAppUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'text/plain',
                },
                body: JSON.stringify({
                    action: 'syncAll',
                    payload: data
                })
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const result = await response.json();

            if (result.success) {
                console.log('✅ Data synced to Google Sheets:', result);
                return {
                    success: true,
                    results: result,
                    message: result.message || 'Data synced to Google Sheets successfully',
                    totalProcessed: result.totalProcessed,
                    totalErrors: result.totalErrors
                };
            } else {
                throw new Error(result.error);
            }
        } catch (error) {
            console.error('📤 Sync failed:', error);
            return { success: false, error: error.message };
        }
    },

    getAllData: async function() {
        return await this.makeGetRequest('getAllData');
    },

    // === SIMPLE CACHING SYSTEM ===
    cacheData: function(key, data) {
        try {
            const cacheEntry = {
                data: data,
                timestamp: Date.now(),
                ttl: 5 * 60 * 1000 // 5 minutes
            };
            localStorage.setItem(`contributionTracker_cache_${key}`, JSON.stringify(cacheEntry));
        } catch (error) {
            console.warn('Cache write failed:', error);
        }
    },

    getCachedData: function(key) {
        try {
            const cached = localStorage.getItem(`contributionTracker_cache_${key}`);
            if (!cached) return null;

            const cacheEntry = JSON.parse(cached);
            const now = Date.now();

            if (now - cacheEntry.timestamp < cacheEntry.ttl) {
                return cacheEntry.data;
            } else {
                localStorage.removeItem(`contributionTracker_cache_${key}`);
                return null;
            }
        } catch (error) {
            console.warn('Cache read failed:', error);
            return null;
        }
    },

    clearCache: function() {
        const keys = Object.keys(localStorage);
        keys.forEach(key => {
            if (key.startsWith('contributionTracker_cache_')) {
                localStorage.removeItem(key);
            }
        });
        console.log('🧹 Cache cleared');
    },

    // === BACKWARD COMPATIBILITY ===
    // Generic makeRequest method for frontend compatibility
    makeRequest: async function(action, method = 'GET', data = null) {
        if (method.toUpperCase() === 'POST') {
            return await this.makePostRequest(action, data);
        } else {
            return await this.makeGetRequest(action, data);
        }
    },

    // === INITIALIZATION ===
    loadStoredConfig: function() {
        const storedUrl = localStorage.getItem('contributionTracker_apiUrl');
        if (storedUrl) {
            this.init(storedUrl);
        }
    }
};

// Initialize on load
document.addEventListener('DOMContentLoaded', () => {
    ApiService.loadStoredConfig();
});

// Create global instance
window.ApiService = ApiService;

console.log('✅ ContributionTracker Pro API Service loaded');
console.log('🔧 Key features: Content-Type text/plain, retry mechanism, graceful fallback');
