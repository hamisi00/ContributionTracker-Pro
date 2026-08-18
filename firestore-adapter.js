// Firestore Adapter v2.0 - Flat Structure
// ContributionTracker Pro - Simplified adapter for flat collections

import FirestoreService from './firestore-service.js';
import { getCurrentUser } from './firebase-auth.js';
import { Timestamp } from 'firebase/firestore';

/**
 * Firestore Adapter
 * Provides compatibility layer between app.js and new flat Firestore structure
 * Simplified from ApartmentApp patterns
 */
class FirestoreAdapter {
    constructor() {
        this.firestoreService = null;
        this.initialized = false;
        this.currentOrgId = null;
        this.listeners = [];
    }

    /**
     * Initialize the adapter with organization context
     */
    async initialize(organizationId) {
        try {
            const user = getCurrentUser();
            if (!user) {
                throw new Error('User not authenticated');
            }

            this.currentOrgId = organizationId;
            this.firestoreService = new FirestoreService();
            await this.firestoreService.init(user.uid, organizationId);

            this.initialized = true;
            console.log('✅ Firestore adapter initialized (flat structure)');
            console.log('📌 Organization ID:', organizationId);
            return true;

        } catch (error) {
            console.error('❌ Firestore adapter initialization error:', error);
            throw error;
        }
    }

    /**
     * Ensure adapter is initialized
     */
    _ensureInitialized() {
        if (!this.initialized || !this.firestoreService) {
            throw new Error('Firestore adapter not initialized. Call initialize() first.');
        }
    }

    /**
     * Convert Firestore Timestamps to milliseconds for compatibility (recursive)
     * Handles nested objects, arrays, and various timestamp formats
     */
    _processTimestamps(obj) {
        if (!obj) return obj;

        // Handle arrays
        if (Array.isArray(obj)) {
            return obj.map(item => this._processTimestamps(item));
        }

        // Handle primitive types
        if (typeof obj !== 'object' || obj === null) {
            return obj;
        }

        // Handle Firestore Timestamp objects directly
        if (obj.toMillis && typeof obj.toMillis === 'function') {
            return obj.toMillis();
        }

        // Handle plain timestamp objects with seconds/nanoseconds
        if (obj.seconds !== undefined && typeof obj.seconds === 'number') {
            return obj.seconds * 1000 + (obj.nanoseconds || 0) / 1000000;
        }

        // Handle Date objects
        if (obj instanceof Date) {
            return obj.getTime();
        }

        // Recursively process object properties
        const processed = {};
        for (const key in obj) {
            if (obj.hasOwnProperty(key)) {
                processed[key] = this._processTimestamps(obj[key]);
            }
        }

        return processed;
    }

    /**
     * Convert Date to Firestore Timestamp
     */
    _toTimestamp(date) {
        if (!date) return Timestamp.now();
        if (typeof date === 'number') {
            return Timestamp.fromMillis(date);
        }
        if (date instanceof Date) {
            return Timestamp.fromDate(date);
        }
        return Timestamp.now();
    }

    // ==========================================
    // SETTINGS
    // ==========================================

    async getSettings() {
        this._ensureInitialized();
        // Now using Firestore with localStorage fallback for offline mode
        const settings = await this.firestoreService.getUserSettings();
        return settings;
    }

    async updateSettings(settings) {
        this._ensureInitialized();
        // Save to Firestore (automatically syncs to localStorage for offline access)
        const result = await this.firestoreService.updateUserSettings(settings);
        return result.success;
    }

    // ==========================================
    // FUNDS
    // ==========================================

    async getAllFunds() {
        this._ensureInitialized();
        const funds = await this.firestoreService.getAllFunds();

        // Enrich funds with calculated totals from payments
        const enrichedFunds = await this._enrichFundsWithTotals(funds);

        return enrichedFunds.map(fund => this._processTimestamps(fund));
    }

    /**
     * Calculate and add totals to funds from their payments
     * @private
     */
    async _enrichFundsWithTotals(funds) {
        // Fetch all payments once
        const allPayments = await this.firestoreService.getAllPayments();

        // Group payments by fundId
        const paymentsByFund = {};
        allPayments.forEach(payment => {
            if (!paymentsByFund[payment.fundId]) {
                paymentsByFund[payment.fundId] = [];
            }
            paymentsByFund[payment.fundId].push(payment);
        });

        // Calculate totals for each fund
        return funds.map(fund => {
            const fundPayments = paymentsByFund[fund.id] || [];
            let totalCollected = 0;
            let totalPledged = 0;

            fundPayments.forEach(payment => {
                const amount = parseFloat(payment.amount) || 0;
                if (payment.isPledge) {
                    totalPledged += amount;
                } else {
                    totalCollected += amount;
                }
            });

            return {
                ...fund,
                totalCollected,
                totalPledged
            };
        });
    }

    async getFund(fundId) {
        this._ensureInitialized();
        const fund = await this.firestoreService.getFund(fundId);
        return fund ? this._processTimestamps(fund) : null;
    }

    async createFund(fundData) {
        this._ensureInitialized();
        const result = await this.firestoreService.createFund(fundData);
        return result.success ? result.id : null;
    }

    async updateFund(fundId, updates) {
        this._ensureInitialized();
        await this.firestoreService.updateFund(fundId, updates);
        return fundId;
    }

    async deleteFund(fundId) {
        this._ensureInitialized();
        await this.firestoreService.deleteFund(fundId);
        return true;
    }

    /**
     * Set up real-time listener for funds with automatic enrichment
     * This ensures funds always have calculated totals from payments
     * @param {function} callback - Called with enriched funds when they change
     * @returns {function} Unsubscribe function
     */
    onFundsChanged(callback) {
        this._ensureInitialized();

        return this.firestoreService.onCollectionChanged('funds', async (rawFunds) => {
            // Enrich funds with calculated totals from payments
            const enrichedFunds = await this._enrichFundsWithTotals(rawFunds);

            // Process timestamps
            const processedFunds = enrichedFunds.map(fund => this._processTimestamps(fund));

            // Call the callback with enriched funds
            callback(processedFunds);
        });
    }

    async getFundDetails(fundId) {
        this._ensureInitialized();

        const fund = await this.firestoreService.getFund(fundId);
        if (!fund) return null;

        const groups = await this.firestoreService.getGroupsByFund(fundId);
        const payments = await this.firestoreService.getPaymentsByFund(fundId);

        // Calculate totals
        let totalCollected = 0;
        let totalPledged = 0;

        payments.forEach(payment => {
            const amount = parseFloat(payment.amount) || 0;
            if (payment.isPledge) {
                totalPledged += amount;
            } else {
                totalCollected += amount;
            }
        });

        return {
            fund: this._processTimestamps(fund),
            groups: groups.map(g => this._processTimestamps(g)),
            payments: payments.map(p => this._processTimestamps(p)),
            totalCollected,
            totalPledged,
            groupCount: groups.length,
            paymentCount: payments.length
        };
    }

    // ==========================================
    // GROUPS
    // ==========================================

    async getGroupsByFund(fundId) {
        this._ensureInitialized();
        const groups = await this.firestoreService.getGroupsByFund(fundId);

        // Enrich groups with calculated totals from payments
        const enrichedGroups = await this._enrichGroupsWithTotals(groups);

        return enrichedGroups.map(group => this._processTimestamps(group));
    }

    /**
     * Calculate and add totals to groups from their payments
     * @private
     */
    async _enrichGroupsWithTotals(groups) {
        if (groups.length === 0) return groups;

        // Fetch payments for all groups
        const groupIds = groups.map(g => g.id);
        const allPayments = await this.firestoreService.getAllPayments();

        // Filter payments for these specific groups and group by groupId
        const paymentsByGroup = {};
        allPayments.forEach(payment => {
            if (groupIds.includes(payment.groupId)) {
                if (!paymentsByGroup[payment.groupId]) {
                    paymentsByGroup[payment.groupId] = [];
                }
                paymentsByGroup[payment.groupId].push(payment);
            }
        });

        // Calculate totals for each group
        return groups.map(group => {
            const groupPayments = paymentsByGroup[group.id] || [];
            let totalPaid = 0;
            let totalPledged = 0;

            groupPayments.forEach(payment => {
                const amount = parseFloat(payment.amount) || 0;
                if (payment.isPledge) {
                    totalPledged += amount;
                } else {
                    totalPaid += amount;
                }
            });

            return {
                ...group,
                totalPaid,
                totalPledged
            };
        });
    }

    /**
     * Set up real-time listener for groups with automatic enrichment
     * This ensures groups always have calculated totals (totalPaid, totalPledged) from payments
     * @param {function} callback - Called with enriched groups when they change
     * @returns {function} Unsubscribe function
     */
    onGroupsChanged(callback) {
        this._ensureInitialized();

        return this.firestoreService.onCollectionChanged('groups', async (rawGroups) => {
            // Enrich groups with calculated totals from payments
            const enrichedGroups = await this._enrichGroupsWithTotals(rawGroups);

            // Process timestamps
            const processedGroups = enrichedGroups.map(group => this._processTimestamps(group));

            // Call the callback with enriched groups
            callback(processedGroups);
        });
    }

    async getGroup(groupId) {
        this._ensureInitialized();
        const group = await this.firestoreService.getGroup(groupId);
        return group ? this._processTimestamps(group) : null;
    }

    async createGroup(groupData) {
        this._ensureInitialized();
        const result = await this.firestoreService.createGroup(groupData);
        return result.success ? result.id : null;
    }

    async updateGroup(groupId, updates) {
        this._ensureInitialized();
        await this.firestoreService.updateGroup(groupId, updates);
        return groupId;
    }

    async deleteGroup(groupId) {
        this._ensureInitialized();
        await this.firestoreService.deleteGroup(groupId);
        return true;
    }

    async getAllGroups() {
        this._ensureInitialized();

        // Use efficient single-query method from service
        const groups = await this.firestoreService.getAllGroups();

        // Enrich groups with calculated totals from payments
        const enrichedGroups = await this._enrichGroupsWithTotals(groups);

        return enrichedGroups.map(group => this._processTimestamps(group));
    }

    // ==========================================
    // PAYMENTS
    // ==========================================

    async getPaymentsByFund(fundId) {
        this._ensureInitialized();
        const payments = await this.firestoreService.getPaymentsByFund(fundId);
        return payments.map(payment => this._processTimestamps(payment));
    }

    async getPaymentsByGroup(groupId) {
        this._ensureInitialized();
        const payments = await this.firestoreService.getPaymentsByGroup(groupId);
        return payments.map(payment => this._processTimestamps(payment));
    }

    async getPayment(paymentId) {
        this._ensureInitialized();
        const payment = await this.firestoreService.getPayment(paymentId);
        return payment ? this._processTimestamps(payment) : null;
    }

    async createPayment(paymentData) {
        this._ensureInitialized();
        const result = await this.firestoreService.createPayment(paymentData);
        return result.success ? result.id : null;
    }

    async updatePayment(paymentId, updates) {
        this._ensureInitialized();
        await this.firestoreService.updatePayment(paymentId, updates);
        return paymentId;
    }

    async deletePayment(paymentId) {
        this._ensureInitialized();
        await this.firestoreService.deletePayment(paymentId);
        return true;
    }

    async getAllPayments() {
        this._ensureInitialized();
        const payments = await this.firestoreService.getAllPayments();
        return payments.map(payment => this._processTimestamps(payment));
    }

    // ==========================================
    // PLEDGES (Payments with isPledge=true)
    // ==========================================

    async createPledge(pledgeData) {
        this._ensureInitialized();

        // Pledges are stored as payments with isPledge flag
        const paymentData = {
            ...pledgeData,
            isPledge: true,
            payerName: pledgeData.pledgerName || 'Anonymous',
            note: pledgeData.description || pledgeData.note || '',
            date: pledgeData.date || Date.now(),
            amount: pledgeData.amount || 0
        };

        const result = await this.firestoreService.createPayment(paymentData);
        return result.success ? result.id : null;
    }

    async getPledgesByFund(fundId) {
        this._ensureInitialized();
        const payments = await this.firestoreService.getPaymentsByFund(fundId);
        const pledges = payments.filter(p => p.isPledge === true);
        return pledges.map(pledge => this._processTimestamps(pledge));
    }

    async getAllPledges() {
        this._ensureInitialized();
        const payments = await this.firestoreService.getAllPayments();
        const pledges = payments.filter(p => p.isPledge === true);
        return pledges.map(pledge => this._processTimestamps(pledge));
    }

    // ==========================================
    // EXPENSES
    // ==========================================

    async getExpenses() {
        this._ensureInitialized();
        const expenses = await this.firestoreService.getAllExpenses();
        return expenses.map(expense => this._processTimestamps(expense));
    }

    async getExpense(expenseId) {
        this._ensureInitialized();
        const expense = await this.firestoreService.getExpense(expenseId);
        return expense ? this._processTimestamps(expense) : null;
    }

    async createExpense(expenseData) {
        this._ensureInitialized();
        const result = await this.firestoreService.createExpense(expenseData);
        return result.success ? result.id : null;
    }

    async updateExpense(expenseId, updates) {
        this._ensureInitialized();
        await this.firestoreService.updateExpense(expenseId, updates);
        return expenseId;
    }

    async deleteExpense(expenseId) {
        this._ensureInitialized();
        await this.firestoreService.deleteExpense(expenseId);
        return true;
    }

    // Alias for backward compatibility
    async addExpense(expenseData) {
        return await this.createExpense(expenseData);
    }

    // ==========================================
    // DASHBOARD STATS
    // ==========================================

    async getDashboardStats() {
        this._ensureInitialized();

        try {
            // OPTIMIZED: Load all data in parallel (getAllFunds now enriches with totals)
            const [funds, expenses, allGroups, allPayments] = await Promise.all([
                this.getAllFunds(), // Now returns funds with calculated totals
                this.getExpenses(),
                this.getAllGroups(),
                this.getAllPayments()
            ]);

            let totalFunds = funds.length;
            let totalCollected = 0;
            let totalPledged = 0;
            let totalAllocated = 0;
            let totalExpenses = 0;
            let totalPayments = 0;

            // Calculate totals from payments (in-memory aggregation, no more queries)
            allPayments.forEach(payment => {
                const amount = parseFloat(payment.amount) || 0;
                if (payment.isPledge) {
                    totalPledged += amount;
                } else {
                    totalCollected += amount;
                    totalPayments++;
                }
            });

            // Calculate total allocated from funds
            funds.forEach(fund => {
                totalAllocated += fund.totalGoal || 0;
            });

            // Calculate total expenses
            expenses.forEach(expense => {
                totalExpenses += parseFloat(expense.amount) || 0;
            });

            // Sort recentFunds by createdAt (most recent first) and ensure they have totals
            const recentFunds = funds
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
                recentExpenses: expenses.slice(0, 5),
                recentFunds // Now includes calculated totalCollected and totalPledged
            };

        } catch (error) {
            console.error('❌ Error calculating dashboard stats:', error);
            return {
                totalFunds: 0,
                totalCollected: 0,
                totalPledged: 0,
                totalAllocated: 0,
                totalExpenses: 0,
                totalPayments: 0,
                balance: 0,
                recentExpenses: [],
                recentFunds: []
            };
        }
    }

    // ==========================================
    // REAL-TIME LISTENERS (ApartmentApp Pattern)
    // ==========================================

    /**
     * Setup real-time listener for a collection
     * Pattern from ApartmentApp
     */
    onCollectionChanged(collectionName, callback, filters = {}) {
        this._ensureInitialized();

        const unsubscribe = this.firestoreService.onCollectionChanged(
            collectionName,
            (items) => {
                // Process timestamps before calling callback
                const processedItems = items.map(item => this._processTimestamps(item));
                callback(processedItems);
            },
            filters
        );

        // Store for cleanup
        this.listeners.push(unsubscribe);
        return unsubscribe;
    }

    /**
     * Remove all listeners
     */
    removeAllListeners() {
        this.listeners.forEach(unsubscribe => {
            if (unsubscribe) unsubscribe();
        });
        this.listeners = [];
        console.log('✅ All adapter listeners removed');
    }

    // ==========================================
    // GENERIC METHODS (for compatibility)
    // ==========================================

    async getAll(storeName) {
        this._ensureInitialized();

        switch (storeName) {
            case 'funds':
                return await this.getAllFunds();
            case 'groups':
                // Use efficient single-query method (with enrichment)
                return await this.getAllGroups();
            case 'payments':
                const allPayments = await this.getAllPayments();
                return allPayments;
            case 'expenses':
                return await this.getExpenses();
            case 'pledges':
                // Pledges are stored as payments with isPledge flag
                const payments = await this.getAllPayments();
                return payments.filter(p => p.isPledge === true);
            case 'users':
                // Users managed by Firebase Auth, not stored locally
                // Return empty for backward compatibility
                return [];
            default:
                console.warn('Unknown store:', storeName);
                return [];
        }
    }

    async getByIndex(storeName, indexName, value) {
        this._ensureInitialized();

        switch (storeName) {
            case 'payments':
                if (indexName === 'groupId') {
                    return await this.getPaymentsByGroup(value);
                } else if (indexName === 'fundId') {
                    return await this.getPaymentsByFund(value);
                }
                break;
            case 'groups':
                if (indexName === 'fundId') {
                    return await this.getGroupsByFund(value);
                }
                break;
            default:
                console.warn('Unknown store/index:', storeName, indexName);
                return [];
        }

        return [];
    }

    // ==========================================
    // BULK SYNC (ApartmentApp Pattern)
    // ==========================================

    async syncFunds(funds) {
        this._ensureInitialized();
        return await this.firestoreService.syncFunds(funds);
    }

    async syncGroups(groups) {
        this._ensureInitialized();
        return await this.firestoreService.syncGroups(groups);
    }

    async syncPayments(payments) {
        this._ensureInitialized();
        return await this.firestoreService.syncPayments(payments);
    }

    async syncExpenses(expenses) {
        this._ensureInitialized();
        return await this.firestoreService.syncExpenses(expenses);
    }

    // ==========================================
    // LEGACY INDEXEDDB COMPATIBILITY
    // ==========================================

    /**
     * Generic put method for import operations
     * Maps legacy IndexedDB put() calls to appropriate Firestore create/update
     */
    async put(storeName, item) {
        this._ensureInitialized();

        if (!item.id) {
            throw new Error('Item must have an id property');
        }

        switch (storeName) {
            case 'funds':
                // Check if exists, update if so, create if not
                const existingFund = await this.firestoreService.getFund(item.id);
                if (existingFund) {
                    await this.firestoreService.updateFund(item.id, item);
                } else {
                    await this.firestoreService.createFund({ ...item, id: item.id });
                }
                return item.id;

            case 'groups':
                const existingGroup = await this.firestoreService.getGroup(item.id);
                if (existingGroup) {
                    await this.firestoreService.updateGroup(item.id, item);
                } else {
                    await this.firestoreService.createGroup({ ...item, id: item.id });
                }
                return item.id;

            case 'payments':
                const existingPayment = await this.firestoreService.getPayment(item.id);
                if (existingPayment) {
                    await this.firestoreService.updatePayment(item.id, item);
                } else {
                    await this.firestoreService.createPayment({ ...item, id: item.id });
                }
                return item.id;

            case 'pledges':
                // Pledges are stored as payments with isPledge flag
                const pledgeAsPayment = { ...item, isPledge: true };
                const existingPledge = await this.firestoreService.getPayment(item.id);
                if (existingPledge) {
                    await this.firestoreService.updatePayment(item.id, pledgeAsPayment);
                } else {
                    await this.firestoreService.createPayment({ ...pledgeAsPayment, id: item.id });
                }
                return item.id;

            case 'expenses':
                const existingExpense = await this.firestoreService.getExpense(item.id);
                if (existingExpense) {
                    await this.firestoreService.updateExpense(item.id, item);
                } else {
                    await this.firestoreService.createExpense({ ...item, id: item.id });
                }
                return item.id;

            case 'counters':
                // Counters stored in localStorage for backward compatibility
                if (item.type && item.value !== undefined) {
                    await this.updateCounter(item.type, item.value);
                }
                return item.type;

            default:
                console.warn('Unknown store name for put():', storeName);
                return null;
        }
    }

    /**
     * Clear all documents from a collection
     * WARNING: Destructive operation
     */
    async clear(storeName) {
        this._ensureInitialized();

        console.warn(`⚠️ Clearing collection: ${storeName}`);

        switch (storeName) {
            case 'funds':
                const funds = await this.getAllFunds();
                for (const fund of funds) {
                    await this.firestoreService.deleteFund(fund.id);
                }
                break;

            case 'groups':
                const groups = await this.getAllGroups();
                for (const group of groups) {
                    await this.firestoreService.deleteGroup(group.id);
                }
                break;

            case 'payments':
                const payments = await this.getAllPayments();
                for (const payment of payments) {
                    await this.firestoreService.deletePayment(payment.id);
                }
                break;

            case 'pledges':
                // Delete all payments with isPledge flag
                const allPayments = await this.getAllPayments();
                const pledges = allPayments.filter(p => p.isPledge === true);
                for (const pledge of pledges) {
                    await this.firestoreService.deletePayment(pledge.id);
                }
                break;

            case 'expenses':
                const expenses = await this.getExpenses();
                for (const expense of expenses) {
                    await this.firestoreService.deleteExpense(expense.id);
                }
                break;

            default:
                console.warn('Unknown store name for clear():', storeName);
        }

        console.log(`✅ Cleared collection: ${storeName}`);
    }

    /**
     * Clear all data from all collections
     * WARNING: EXTREMELY DESTRUCTIVE
     */
    async clearAllData() {
        this._ensureInitialized();

        console.warn('⚠️⚠️⚠️ CLEARING ALL DATA ⚠️⚠️⚠️');

        await this.clear('payments');  // Includes pledges
        await this.clear('expenses');
        await this.clear('groups');
        await this.clear('funds');

        console.log('✅ All data cleared');
    }

    /**
     * Switch fund type between 'allocated' and 'open'
     */
    async switchFundType(fundId) {
        this._ensureInitialized();

        const fund = await this.firestoreService.getFund(fundId);
        if (!fund) {
            throw new Error('Fund not found');
        }

        const newType = fund.type === 'allocated' ? 'open' : 'allocated';
        const updates = { type: newType };

        // If switching to open, remove goal
        if (newType === 'open') {
            updates.totalGoal = 0;
        } else {
            // If switching to allocated, set goal based on current totalCollected
            updates.totalGoal = fund.totalCollected || 0;
        }

        await this.firestoreService.updateFund(fundId, updates);
        console.log(`✅ Fund ${fundId} switched to ${newType} type`);
    }

    /**
     * Get/Update counters for ID generation
     * NOTE: Firestore auto-generates IDs, but we keep this for import compatibility
     */
    async getCounter(type) {
        this._ensureInitialized();
        // Counters stored in localStorage for backward compatibility
        const key = `counter_${type}`;
        const value = localStorage.getItem(key);
        return value ? parseInt(value, 10) : 0;
    }

    async updateCounter(type, value) {
        const key = `counter_${type}`;
        localStorage.setItem(key, value.toString());
    }

    /**
     * Update user credentials (Legacy - Firebase Auth handles this now)
     */
    async updateUserCredentials(userData) {
        console.warn('updateUserCredentials is deprecated - use Firebase Auth functions');
        // This is a legacy method from local-only implementation
        // Firebase Auth now handles user credentials
        return true;
    }

    // ==========================================
    // EXPORT/IMPORT
    // ==========================================

    async exportData() {
        this._ensureInitialized();

        const funds = await this.getAllFunds();
        const expenses = await this.getExpenses();

        const allGroups = [];
        const allPayments = [];

        for (const fund of funds) {
            const groups = await this.getGroupsByFund(fund.id);
            const payments = await this.getPaymentsByFund(fund.id);
            allGroups.push(...groups);
            allPayments.push(...payments);
        }

        return {
            funds,
            groups: allGroups,
            payments: allPayments,
            expenses,
            settings: await this.getSettings(),
            exportDate: new Date().toISOString(),
            version: '2.0.0-flat'
        };
    }

    // ==========================================
    // SYNC STATUS
    // ==========================================

    /**
     * Get sync status information
     * Used by UI to display connection status
     */
    getSyncStatus() {
        const isOnline = typeof navigator !== 'undefined' ? navigator.onLine : true;

        return {
            isOnline: isOnline,
            isInitialized: this.initialized,
            organizationId: this.currentOrgId,
            listenerCount: this.listeners.length,
            hasFirestore: this.firestoreService !== null
        };
    }

    // ==========================================
    // CLEANUP
    // ==========================================

    cleanup() {
        this.removeAllListeners();
        if (this.firestoreService) {
            this.firestoreService.removeAllListeners();
        }
        console.log('✅ Firestore adapter cleaned up');
    }
}

// ==========================================
// EXPORT
// ==========================================

export default FirestoreAdapter;

console.log('✅ Firestore Adapter v2.0 loaded (Flat Structure)');
