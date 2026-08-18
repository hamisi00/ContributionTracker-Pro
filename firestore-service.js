// Firestore Service v2.0 - Flat Collection Structure
// ContributionTracker Pro - Simplified Data Layer with Real-time Support

import {
    collection,
    doc,
    getDoc,
    getDocs,
    setDoc,
    updateDoc,
    deleteDoc,
    query,
    where,
    orderBy,
    limit as firestoreLimit,
    serverTimestamp,
    onSnapshot,
    writeBatch
} from 'firebase/firestore';

import { getFirebaseDb } from './firebase-config.js';

/**
 * Firestore Service Class - Flat Structure Pattern
 * Simplified from ApartmentApp's Realtime Database approach
 */
class FirestoreService {
    constructor() {
        this.db = null;
        this.currentUserId = null;
        this.currentOrgId = null;
        this.initialized = false;
        this.listeners = new Map(); // Track active listeners for cleanup
    }

    /**
     * Initialize the service with user and organization context
     */
    async init(userId, organizationId) {
        try {
            this.db = getFirebaseDb();
            this.currentUserId = userId;
            this.currentOrgId = organizationId;
            this.initialized = true;

            console.log('✅ Firestore service initialized (flat structure)');
            console.log('📌 Organization:', organizationId, '| User:', userId);
            return true;

        } catch (error) {
            console.error('❌ Firestore service initialization error:', error);
            throw error;
        }
    }

    /**
     * Generate unique ID with prefix
     */
    generateId(prefix) {
        const timestamp = Date.now();
        const random = Math.floor(Math.random() * 10000);
        return `${prefix}_${timestamp}_${random}`;
    }

    // ===========================
    // FUND OPERATIONS (Top-level collection)
    // ===========================

    async createFund(fundData) {
        try {
            if (!this.currentOrgId) {
                return { success: false, error: 'No organization context' };
            }

            const fundId = fundData.id || this.generateId('fund');
            const fund = {
                id: fundId,
                organizationId: this.currentOrgId,  // ← Link to org
                name: fundData.name,
                description: fundData.description || '',
                type: fundData.type,
                totalGoal: fundData.type === 'allocated' ? parseFloat(fundData.totalGoal) : null,
                totalCollected: 0,
                totalPledged: 0,
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp(),
                createdBy: this.currentUserId
            };

            const fundRef = doc(this.db, 'funds', fundId);
            await setDoc(fundRef, fund);
            await this.logActivity('create', 'fund', fundId, `Created fund: ${fund.name}`);

            console.log(`✅ Fund created: ${fund.name} (${fundId})`);
            return { success: true, id: fundId };

        } catch (error) {
            console.error('❌ Error creating fund:', error);
            return { success: false, error: error.message };
        }
    }

    async getAllFunds() {
        try {
            if (!this.currentOrgId) return [];

            const q = query(
                collection(this.db, 'funds'),
                where('organizationId', '==', this.currentOrgId),
                orderBy('createdAt', 'desc')
            );
            const snapshot = await getDocs(q);
            return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

        } catch (error) {
            console.error('❌ Error getting funds:', error);
            return [];
        }
    }

    async getFund(fundId) {
        try {
            const fundRef = doc(this.db, 'funds', fundId);
            const fundDoc = await getDoc(fundRef);
            return fundDoc.exists() ? { id: fundDoc.id, ...fundDoc.data() } : null;

        } catch (error) {
            console.error('❌ Error getting fund:', error);
            return null;
        }
    }

    async updateFund(fundId, updates) {
        try {
            const fundRef = doc(this.db, 'funds', fundId);
            await updateDoc(fundRef, {
                ...updates,
                updatedAt: serverTimestamp()
            });
            await this.logActivity('update', 'fund', fundId, 'Updated fund');

            console.log(`✅ Fund updated: ${fundId}`);
            return { success: true };

        } catch (error) {
            console.error('❌ Error updating fund:', error);
            return { success: false, error: error.message };
        }
    }

    async deleteFund(fundId) {
        try {
            const fundRef = doc(this.db, 'funds', fundId);
            await deleteDoc(fundRef);
            await this.logActivity('delete', 'fund', fundId, 'Deleted fund');

            console.log(`✅ Fund deleted: ${fundId}`);
            return { success: true };

        } catch (error) {
            console.error('❌ Error deleting fund:', error);
            return { success: false, error: error.message };
        }
    }

    // ===========================
    // GROUP OPERATIONS (Top-level collection)
    // ===========================

    async createGroup(groupData) {
        try {
            if (!this.currentOrgId) {
                return { success: false, error: 'No organization context' };
            }

            const groupId = groupData.id || this.generateId('group');
            const group = {
                id: groupId,
                organizationId: this.currentOrgId,  // ← Link to org
                fundId: groupData.fundId,            // ← Link to fund
                name: groupData.name,
                allocation: groupData.allocation || null,
                totalPaid: 0,
                totalPledged: 0,
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp(),
                createdBy: this.currentUserId
            };

            const groupRef = doc(this.db, 'groups', groupId);
            await setDoc(groupRef, group);
            await this.logActivity('create', 'group', groupId, `Created group: ${group.name}`);

            console.log(`✅ Group created: ${group.name} (${groupId})`);
            return { success: true, id: groupId };

        } catch (error) {
            console.error('❌ Error creating group:', error);
            return { success: false, error: error.message };
        }
    }

    async getGroupsByFund(fundId) {
        try {
            const q = query(
                collection(this.db, 'groups'),
                where('fundId', '==', fundId)
            );
            const snapshot = await getDocs(q);
            return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

        } catch (error) {
            console.error('❌ Error getting groups:', error);
            return [];
        }
    }

    async getAllGroups() {
        try {
            const q = query(
                collection(this.db, 'groups'),
                where('organizationId', '==', this.organizationId)
            );
            const snapshot = await getDocs(q);
            return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

        } catch (error) {
            console.error('❌ Error getting all groups:', error);
            return [];
        }
    }

    async getGroup(groupId) {
        try {
            const groupRef = doc(this.db, 'groups', groupId);
            const groupDoc = await getDoc(groupRef);
            return groupDoc.exists() ? { id: groupDoc.id, ...groupDoc.data() } : null;

        } catch (error) {
            console.error('❌ Error getting group:', error);
            return null;
        }
    }

    async updateGroup(groupId, updates) {
        try {
            const groupRef = doc(this.db, 'groups', groupId);
            await updateDoc(groupRef, {
                ...updates,
                updatedAt: serverTimestamp()
            });
            await this.logActivity('update', 'group', groupId, 'Updated group');

            console.log(`✅ Group updated: ${groupId}`);
            return { success: true };

        } catch (error) {
            console.error('❌ Error updating group:', error);
            return { success: false, error: error.message };
        }
    }

    async deleteGroup(groupId) {
        try {
            const groupRef = doc(this.db, 'groups', groupId);
            await deleteDoc(groupRef);
            await this.logActivity('delete', 'group', groupId, 'Deleted group');

            console.log(`✅ Group deleted: ${groupId}`);
            return { success: true };

        } catch (error) {
            console.error('❌ Error deleting group:', error);
            return { success: false, error: error.message };
        }
    }

    // ===========================
    // PAYMENT OPERATIONS (Top-level collection)
    // ===========================

    async createPayment(paymentData) {
        try {
            if (!this.currentOrgId) {
                return { success: false, error: 'No organization context' };
            }

            const paymentId = paymentData.id || this.generateId('payment');
            const payment = {
                id: paymentId,
                organizationId: this.currentOrgId,  // ← Link to org
                fundId: paymentData.fundId,          // ← Link to fund
                groupId: paymentData.groupId,        // ← Link to group
                amount: parseFloat(paymentData.amount),
                date: paymentData.date,
                payer: paymentData.payer || '',
                method: paymentData.method || '',
                reference: paymentData.reference || '',
                notes: paymentData.notes || '',
                isPledge: paymentData.isPledge || false,
                createdAt: serverTimestamp(),
                createdBy: this.currentUserId
            };

            const paymentRef = doc(this.db, 'payments', paymentId);
            await setDoc(paymentRef, payment);
            await this.logActivity('create', 'payment', paymentId, `Recorded payment of ${payment.amount}`);

            console.log(`✅ Payment created: ${paymentId}`);
            return { success: true, id: paymentId };

        } catch (error) {
            console.error('❌ Error creating payment:', error);
            return { success: false, error: error.message };
        }
    }

    async getPaymentsByFund(fundId) {
        try {
            const q = query(
                collection(this.db, 'payments'),
                where('fundId', '==', fundId),
                orderBy('date', 'desc')
            );
            const snapshot = await getDocs(q);
            return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

        } catch (error) {
            console.error('❌ Error getting payments:', error);
            return [];
        }
    }

    async getPaymentsByGroup(groupId) {
        try {
            const q = query(
                collection(this.db, 'payments'),
                where('groupId', '==', groupId)
            );
            const snapshot = await getDocs(q);
            return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

        } catch (error) {
            console.error('❌ Error getting payments by group:', error);
            return [];
        }
    }

    async getAllPayments() {
        try {
            if (!this.currentOrgId) return [];

            const q = query(
                collection(this.db, 'payments'),
                where('organizationId', '==', this.currentOrgId),
                orderBy('date', 'desc')
            );
            const snapshot = await getDocs(q);
            return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

        } catch (error) {
            console.error('❌ Error getting all payments:', error);
            return [];
        }
    }

    async getPayment(paymentId) {
        try {
            const paymentRef = doc(this.db, 'payments', paymentId);
            const paymentDoc = await getDoc(paymentRef);
            return paymentDoc.exists() ? { id: paymentDoc.id, ...paymentDoc.data() } : null;

        } catch (error) {
            console.error('❌ Error getting payment:', error);
            return null;
        }
    }

    async updatePayment(paymentId, updates) {
        try {
            const paymentRef = doc(this.db, 'payments', paymentId);
            await updateDoc(paymentRef, {
                ...updates,
                updatedAt: serverTimestamp()
            });
            await this.logActivity('update', 'payment', paymentId, 'Updated payment');

            console.log(`✅ Payment updated: ${paymentId}`);
            return { success: true };

        } catch (error) {
            console.error('❌ Error updating payment:', error);
            return { success: false, error: error.message };
        }
    }

    async deletePayment(paymentId) {
        try {
            const paymentRef = doc(this.db, 'payments', paymentId);
            await deleteDoc(paymentRef);
            await this.logActivity('delete', 'payment', paymentId, 'Deleted payment');

            console.log(`✅ Payment deleted: ${paymentId}`);
            return { success: true };

        } catch (error) {
            console.error('❌ Error deleting payment:', error);
            return { success: false, error: error.message };
        }
    }

    // ===========================
    // EXPENSE OPERATIONS (Top-level collection)
    // ===========================

    async createExpense(expenseData) {
        try {
            if (!this.currentOrgId) {
                return { success: false, error: 'No organization context' };
            }

            const expenseId = expenseData.id || this.generateId('expense');
            const expense = {
                id: expenseId,
                organizationId: this.currentOrgId,  // ← Link to org
                category: expenseData.category,
                amount: parseFloat(expenseData.amount),
                date: expenseData.date,
                vendor: expenseData.vendor || '',
                description: expenseData.description || '',
                notes: expenseData.notes || '',
                createdAt: serverTimestamp(),
                createdBy: this.currentUserId
            };

            const expenseRef = doc(this.db, 'expenses', expenseId);
            await setDoc(expenseRef, expense);
            await this.logActivity('create', 'expense', expenseId, `Recorded expense of ${expense.amount}`);

            console.log(`✅ Expense created: ${expenseId}`);
            return { success: true, id: expenseId };

        } catch (error) {
            console.error('❌ Error creating expense:', error);
            return { success: false, error: error.message };
        }
    }

    async getAllExpenses() {
        try {
            if (!this.currentOrgId) return [];

            const q = query(
                collection(this.db, 'expenses'),
                where('organizationId', '==', this.currentOrgId),
                orderBy('date', 'desc')
            );
            const snapshot = await getDocs(q);
            return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

        } catch (error) {
            console.error('❌ Error getting expenses:', error);
            return [];
        }
    }

    async getExpense(expenseId) {
        try {
            const expenseRef = doc(this.db, 'expenses', expenseId);
            const expenseDoc = await getDoc(expenseRef);
            return expenseDoc.exists() ? { id: expenseDoc.id, ...expenseDoc.data() } : null;

        } catch (error) {
            console.error('❌ Error getting expense:', error);
            return null;
        }
    }

    async updateExpense(expenseId, updates) {
        try {
            const expenseRef = doc(this.db, 'expenses', expenseId);
            await updateDoc(expenseRef, {
                ...updates,
                updatedAt: serverTimestamp()
            });
            await this.logActivity('update', 'expense', expenseId, 'Updated expense');

            console.log(`✅ Expense updated: ${expenseId}`);
            return { success: true };

        } catch (error) {
            console.error('❌ Error updating expense:', error);
            return { success: false, error: error.message };
        }
    }

    async deleteExpense(expenseId) {
        try {
            const expenseRef = doc(this.db, 'expenses', expenseId);
            await deleteDoc(expenseRef);
            await this.logActivity('delete', 'expense', expenseId, 'Deleted expense');

            console.log(`✅ Expense deleted: ${expenseId}`);
            return { success: true };

        } catch (error) {
            console.error('❌ Error deleting expense:', error);
            return { success: false, error: error.message };
        }
    }

    // ===========================
    // USER SETTINGS
    // ===========================

    /**
     * Get user settings from Firestore
     * Falls back to localStorage if Firestore unavailable
     */
    async getUserSettings() {
        try {
            if (!this.currentUserId) {
                console.warn('⚠️ No user ID - using localStorage fallback');
                return this._getLocalStorageSettings();
            }

            const settingsRef = doc(this.db, 'users', this.currentUserId, 'settings', 'preferences');
            const settingsDoc = await getDoc(settingsRef);

            if (settingsDoc.exists()) {
                const firestoreSettings = settingsDoc.data();
                // Merge with defaults and sync to localStorage
                const settings = {
                    appName: firestoreSettings.appName || 'ContributionTracker Pro',
                    theme: firestoreSettings.theme || 'light',
                    currency: firestoreSettings.currency || 'KES',
                    googleAppsScriptUrl: firestoreSettings.googleAppsScriptUrl || '',
                    googleSpreadsheetId: firestoreSettings.googleSpreadsheetId || ''
                };

                // Sync to localStorage for offline access
                this._syncToLocalStorage(settings);

                console.log('✅ Settings loaded from Firestore');
                return settings;
            } else {
                // No settings in Firestore, get from localStorage and save to Firestore
                const localSettings = this._getLocalStorageSettings();
                await this.updateUserSettings(localSettings);
                return localSettings;
            }

        } catch (error) {
            // Handle permissions errors gracefully
            if (error.code === 'permission-denied' || error.message?.includes('Missing or insufficient permissions')) {
                console.warn('⚠️ Firestore settings not accessible (permissions) - using localStorage');
            } else {
                console.warn('⚠️ Could not load settings from Firestore - using localStorage:', error.message);
            }
            // Silently fall back to localStorage
            return this._getLocalStorageSettings();
        }
    }

    /**
     * Update user settings in Firestore
     * Also syncs to localStorage for offline access
     */
    async updateUserSettings(settings) {
        try {
            if (!this.currentUserId) {
                console.warn('⚠️ No user ID - saving to localStorage only');
                this._syncToLocalStorage(settings);
                return { success: true };
            }

            const settingsRef = doc(this.db, 'users', this.currentUserId, 'settings', 'preferences');

            const settingsData = {
                appName: settings.appName,
                theme: settings.theme,
                currency: settings.currency,
                googleAppsScriptUrl: settings.googleAppsScriptUrl || '',
                googleSpreadsheetId: settings.googleSpreadsheetId || '',
                updatedAt: serverTimestamp()
            };

            await setDoc(settingsRef, settingsData, { merge: true });

            // Sync to localStorage for offline access
            this._syncToLocalStorage(settings);

            console.log('✅ Settings saved to Firestore and localStorage');
            return { success: true };

        } catch (error) {
            // Handle permissions errors gracefully
            if (error.code === 'permission-denied' || error.message?.includes('Missing or insufficient permissions')) {
                console.warn('⚠️ Firestore settings not writable (permissions) - saved to localStorage only');
            } else {
                console.warn('⚠️ Could not save settings to Firestore - saved to localStorage:', error.message);
            }
            // Still save to localStorage as fallback
            this._syncToLocalStorage(settings);
            return { success: false, error: error.message };
        }
    }

    /**
     * Get settings from localStorage (fallback/offline mode)
     * @private
     */
    _getLocalStorageSettings() {
        return {
            appName: localStorage.getItem('appName') || 'ContributionTracker Pro',
            theme: localStorage.getItem('theme') || 'light',
            currency: localStorage.getItem('currency') || 'KES',
            googleAppsScriptUrl: localStorage.getItem('googleAppsScriptUrl') || '',
            googleSpreadsheetId: localStorage.getItem('googleSpreadsheetId') || ''
        };
    }

    /**
     * Sync settings to localStorage for offline access
     * @private
     */
    _syncToLocalStorage(settings) {
        if (settings.appName) localStorage.setItem('appName', settings.appName);
        if (settings.theme) localStorage.setItem('theme', settings.theme);
        if (settings.currency) localStorage.setItem('currency', settings.currency);
        if (settings.googleAppsScriptUrl !== undefined) {
            localStorage.setItem('googleAppsScriptUrl', settings.googleAppsScriptUrl);
        }
        if (settings.googleSpreadsheetId !== undefined) {
            localStorage.setItem('googleSpreadsheetId', settings.googleSpreadsheetId);
        }
    }

    // ===========================
    // REAL-TIME LISTENERS (ApartmentApp Pattern)
    // ===========================

    /**
     * Listen to real-time changes in a collection
     * Pattern from ApartmentApp's onCollectionChanged
     */
    onCollectionChanged(collectionName, callback, filters = {}) {
        if (!this.db || !this.currentOrgId) {
            console.warn('⚠️ Cannot setup listener - not initialized');
            return null;
        }

        let q = collection(this.db, collectionName);

        // Always filter by organization
        q = query(q, where('organizationId', '==', this.currentOrgId));

        // Apply additional filters
        if (filters.fundId) {
            q = query(q, where('fundId', '==', filters.fundId));
        }
        if (filters.groupId) {
            q = query(q, where('groupId', '==', filters.groupId));
        }

        // Setup real-time listener
        const unsubscribe = onSnapshot(q,
            (snapshot) => {
                const items = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                console.log(`🔄 Real-time update: ${collectionName} (${items.length} items)`);

                try {
                    callback(items);
                } catch (error) {
                    console.error(`Listener callback error for ${collectionName}:`, error);
                }
            },
            (error) => {
                console.error(`❌ Listener error for ${collectionName}:`, error);
            }
        );

        // Store listener for cleanup
        const listenerId = `${collectionName}_${Date.now()}`;
        this.listeners.set(listenerId, unsubscribe);

        console.log(`✅ Real-time listener active for ${collectionName}`);
        return unsubscribe;
    }

    /**
     * Remove a specific listener
     */
    offCollectionChanged(unsubscribe) {
        if (unsubscribe) {
            unsubscribe();
            console.log('✅ Listener removed');
        }
    }

    /**
     * Remove all active listeners
     */
    removeAllListeners() {
        this.listeners.forEach(unsubscribe => unsubscribe());
        this.listeners.clear();
        console.log('✅ All listeners removed');
    }

    // ===========================
    // BULK OPERATIONS (ApartmentApp Pattern)
    // ===========================

    /**
     * Bulk sync pattern from ApartmentApp
     */
    async syncFunds(funds) {
        try {
            const batch = writeBatch(this.db);

            funds.forEach(fund => {
                const fundRef = doc(this.db, 'funds', fund.id);
                batch.set(fundRef, {
                    ...fund,
                    organizationId: this.currentOrgId,
                    updatedAt: serverTimestamp()
                });
            });

            await batch.commit();
            console.log(`✅ Synced ${funds.length} funds (bulk)`);
            return { success: true, count: funds.length };

        } catch (error) {
            console.error('❌ Error syncing funds:', error);
            return { success: false, error: error.message };
        }
    }

    async syncGroups(groups) {
        try {
            const batch = writeBatch(this.db);

            groups.forEach(group => {
                const groupRef = doc(this.db, 'groups', group.id);
                batch.set(groupRef, {
                    ...group,
                    organizationId: this.currentOrgId,
                    updatedAt: serverTimestamp()
                });
            });

            await batch.commit();
            console.log(`✅ Synced ${groups.length} groups (bulk)`);
            return { success: true, count: groups.length };

        } catch (error) {
            console.error('❌ Error syncing groups:', error);
            return { success: false, error: error.message };
        }
    }

    async syncPayments(payments) {
        try {
            const batch = writeBatch(this.db);

            payments.forEach(payment => {
                const paymentRef = doc(this.db, 'payments', payment.id);
                batch.set(paymentRef, {
                    ...payment,
                    organizationId: this.currentOrgId
                });
            });

            await batch.commit();
            console.log(`✅ Synced ${payments.length} payments (bulk)`);
            return { success: true, count: payments.length };

        } catch (error) {
            console.error('❌ Error syncing payments:', error);
            return { success: false, error: error.message };
        }
    }

    async syncExpenses(expenses) {
        try {
            const batch = writeBatch(this.db);

            expenses.forEach(expense => {
                const expenseRef = doc(this.db, 'expenses', expense.id);
                batch.set(expenseRef, {
                    ...expense,
                    organizationId: this.currentOrgId
                });
            });

            await batch.commit();
            console.log(`✅ Synced ${expenses.length} expenses (bulk)`);
            return { success: true, count: expenses.length };

        } catch (error) {
            console.error('❌ Error syncing expenses:', error);
            return { success: false, error: error.message };
        }
    }

    // ===========================
    // ACTIVITY LOGGING
    // ===========================

    async logActivity(action, entityType, entityId, description) {
        try {
            if (!this.currentOrgId) return;

            const activityId = this.generateId('activity');
            const activityRef = doc(this.db, 'activityLogs', activityId);

            await setDoc(activityRef, {
                id: activityId,
                organizationId: this.currentOrgId,  // ← Link to org
                action,
                entityType,
                entityId,
                description,
                userId: this.currentUserId,
                timestamp: serverTimestamp()
            });

        } catch (error) {
            console.error('❌ Error logging activity:', error);
            // Don't throw - logging should not break operations
        }
    }

    async getActivityLog(limit = 50) {
        try {
            if (!this.currentOrgId) return [];

            const q = query(
                collection(this.db, 'activityLogs'),
                where('organizationId', '==', this.currentOrgId),
                orderBy('timestamp', 'desc'),
                firestoreLimit(limit)
            );
            const snapshot = await getDocs(q);
            return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

        } catch (error) {
            console.error('❌ Error getting activity log:', error);
            return [];
        }
    }
}

// Export
export default FirestoreService;

console.log('✅ Firestore Service v2.0 loaded (Flat Structure)');
