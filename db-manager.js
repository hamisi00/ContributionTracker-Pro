// ============================================================================
// ⚠️ DEPRECATED - IndexedDB Database Manager
// ============================================================================
//
// 🚨 THIS FILE IS DEPRECATED AND MAINTAINED FOR BACKWARD COMPATIBILITY ONLY
//
// ContributionTracker Pro now uses Firebase Firestore as the primary database.
// This IndexedDB implementation is kept as a fallback for offline mode only.
//
// ❌ DO NOT ADD NEW FEATURES TO THIS FILE
// ❌ DO NOT MODIFY EXISTING FUNCTIONS UNLESS FIXING CRITICAL BUGS
//
// ✅ For new development, use:
//    - firestore-service.js (primary data layer)
//    - firestore-adapter.js (compatibility layer)
//    - firebase-config.js (configuration)
//
// Migration Status:
// ✅ All CRUD operations migrated to Firestore
// ✅ Real-time listeners implemented in Firestore
// ✅ Settings now stored in Firestore
// ✅ User management now handled by Firebase Auth
// ⚠️ This file only used when Firebase is unavailable
//
// Last Updated: 2026-08-18
// ============================================================================

// ContributionTracker Pro - IndexedDB Database Manager (LEGACY)
// Handles all database operations with IndexedDB (FALLBACK ONLY)

const DB = {
    name: 'ContributionTrackerDB',
    version: 6,
    db: null,

    /**
     * Initialize the database
     * @deprecated This IndexedDB implementation is deprecated. Use Firestore instead.
     * @returns {Promise<IDBDatabase>}
     */
    async init() {
        console.warn('⚠️ DEPRECATION WARNING: IndexedDB (db-manager.js) is running in fallback mode.');
        console.warn('   Firebase Firestore is the primary database. This should only run offline.');
        console.warn('   If you see this during normal operation, check Firebase initialization.');

        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.name, this.version);

            request.onerror = () => {
                console.error('❌ Database failed to open');
                reject(request.error);
            };

            request.onsuccess = () => {
                this.db = request.result;
                console.log('✅ IndexedDB (FALLBACK) opened successfully');
                resolve(this.db);
            };

            request.onupgradeneeded = (event) => {
                console.log('🔄 Database upgrade needed');
                const db = event.target.result;

                // Create Funds object store
                if (!db.objectStoreNames.contains('funds')) {
                    const fundsStore = db.createObjectStore('funds', { keyPath: 'id' });
                    fundsStore.createIndex('type', 'type', { unique: false });
                    fundsStore.createIndex('createdAt', 'createdAt', { unique: false });
                    fundsStore.createIndex('updatedAt', 'updatedAt', { unique: false });
                    console.log('✅ Funds store created');
                }

                // Create Groups object store
                if (!db.objectStoreNames.contains('groups')) {
                    const groupsStore = db.createObjectStore('groups', { keyPath: 'id' });
                    groupsStore.createIndex('fundId', 'fundId', { unique: false });
                    groupsStore.createIndex('name', 'name', { unique: false });
                    groupsStore.createIndex('totalPaid', 'totalPaid', { unique: false });
                    console.log('✅ Groups store created');
                }

                // Create Payments object store
                if (!db.objectStoreNames.contains('payments')) {
                    const paymentsStore = db.createObjectStore('payments', { keyPath: 'id' });
                    paymentsStore.createIndex('fundId', 'fundId', { unique: false });
                    paymentsStore.createIndex('groupId', 'groupId', { unique: false });
                    paymentsStore.createIndex('date', 'date', { unique: false });
                    paymentsStore.createIndex('createdAt', 'createdAt', { unique: false });
                    console.log('✅ Payments store created');
                }

                // Create Settings object store
                if (!db.objectStoreNames.contains('settings')) {
                    const settingsStore = db.createObjectStore('settings', { keyPath: 'id' });

                    // Initialize default settings
                    const transaction = event.target.transaction;
                    const store = transaction.objectStore('settings');
                    store.add({
                        id: 'app_settings',
                        appName: 'ContributionTracker Pro',
                        theme: 'light',
                        createdAt: Date.now(),
                        updatedAt: Date.now()
                    });
                    console.log('✅ Settings store created with defaults');
                }

                // Create Users object store
                if (!db.objectStoreNames.contains('users')) {
                    const usersStore = db.createObjectStore('users', { keyPath: 'id' });
                    usersStore.createIndex('username', 'username', { unique: true });
                    usersStore.createIndex('createdAt', 'createdAt', { unique: false });

                    // Initialize default admin user
                    const transaction = event.target.transaction;
                    const store = transaction.objectStore('users');
                    // Generate UUID inline to avoid dependency issues during upgrade
                    const uuid = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
                        const r = Math.random() * 16 | 0;
                        const v = c === 'x' ? r : (r & 0x3 | 0x8);
                        return v.toString(16);
                    });
                    store.add({
                        id: uuid,
                        username: 'admin',
                        password: 'admin123', // In production, this should be hashed
                        createdAt: Date.now(),
                        updatedAt: Date.now()
                    });
                    console.log('✅ Users store created with default admin user');
                }

                // Create Expenses object store
                if (!db.objectStoreNames.contains('expenses')) {
                    const expensesStore = db.createObjectStore('expenses', { keyPath: 'id' });
                    expensesStore.createIndex('date', 'date', { unique: false });
                    expensesStore.createIndex('category', 'category', { unique: false });
                    expensesStore.createIndex('amount', 'amount', { unique: false });
                    expensesStore.createIndex('createdAt', 'createdAt', { unique: false });
                    console.log('✅ Expenses store created');
                }

                // Create Pledges object store
                if (!db.objectStoreNames.contains('pledges')) {
                    const pledgesStore = db.createObjectStore('pledges', { keyPath: 'id' });
                    pledgesStore.createIndex('fundId', 'fundId', { unique: false });
                    pledgesStore.createIndex('groupId', 'groupId', { unique: false });
                    pledgesStore.createIndex('createdAt', 'createdAt', { unique: false });
                    console.log('✅ Pledges store created');
                }

                // Create Counters object store for sequential IDs
                if (!db.objectStoreNames.contains('counters')) {
                    const countersStore = db.createObjectStore('counters', { keyPath: 'type' });

                    // Initialize counters for each entity type
                    const transaction = event.target.transaction;
                    const store = transaction.objectStore('counters');
                    store.add({ type: 'fund', value: 0 });
                    store.add({ type: 'group', value: 0 });
                    store.add({ type: 'payment', value: 0 });
                    store.add({ type: 'expense', value: 0 });
                    store.add({ type: 'pledge', value: 0 });
                    console.log('✅ Counters store created with initial values');
                }

                console.log('🎉 Database setup complete');
            };
        });
    },

    /**
     * Generic method to add or update a record
     * @param {string} storeName - Object store name
     * @param {Object} data - Data to store
     * @returns {Promise<string>} Record ID
     */
    async put(storeName, data) {
        // Generate ID if not present
        if (!data.id) {
            // Use sequential IDs for main entity types
            switch (storeName) {
                case 'funds':
                    data.id = await Utils.generateFundId();
                    break;
                case 'groups':
                    data.id = await Utils.generateGroupId();
                    break;
                case 'payments':
                    data.id = await Utils.generatePaymentId();
                    break;
                case 'expenses':
                    data.id = await Utils.generateExpenseId();
                    break;
                case 'pledges':
                    data.id = await Utils.generatePledgeId();
                    break;
                default:
                    // Use UUID for other stores (users, settings, etc.)
                    data.id = Utils.generateUUID();
            }
            data.createdAt = Date.now();
        }
        data.updatedAt = Date.now();

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([storeName], 'readwrite');
            const store = transaction.objectStore(storeName);

            const request = store.put(data);

            request.onsuccess = () => resolve(data.id);
            request.onerror = () => reject(request.error);
        });
    },

    /**
     * Get a single record by ID
     * @param {string} storeName - Object store name
     * @param {string} id - Record ID
     * @returns {Promise<Object|null>}
     */
    async get(storeName, id) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([storeName], 'readonly');
            const store = transaction.objectStore(storeName);
            const request = store.get(id);

            request.onsuccess = () => resolve(request.result || null);
            request.onerror = () => reject(request.error);
        });
    },

    /**
     * Get all records from a store
     * @param {string} storeName - Object store name
     * @returns {Promise<Array>}
     */
    async getAll(storeName) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([storeName], 'readonly');
            const store = transaction.objectStore(storeName);
            const request = store.getAll();

            request.onsuccess = () => resolve(request.result || []);
            request.onerror = () => reject(request.error);
        });
    },

    /**
     * Get records by index
     * @param {string} storeName - Object store name
     * @param {string} indexName - Index name
     * @param {any} value - Value to match
     * @returns {Promise<Array>}
     */
    async getByIndex(storeName, indexName, value) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([storeName], 'readonly');
            const store = transaction.objectStore(storeName);
            const index = store.index(indexName);
            const request = index.getAll(value);

            request.onsuccess = () => resolve(request.result || []);
            request.onerror = () => reject(request.error);
        });
    },

    /**
     * Get and increment counter for sequential IDs
     * @param {string} type - Counter type ('fund', 'group', 'payment', 'expense')
     * @returns {Promise<number>} - Next ID number
     */
    async getAndIncrementCounter(type) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['counters'], 'readwrite');
            const store = transaction.objectStore('counters');

            // Get current counter
            const getRequest = store.get(type);

            getRequest.onsuccess = () => {
                const counter = getRequest.result || { type, value: 0 };
                const nextValue = counter.value + 1;

                // Update counter
                counter.value = nextValue;
                const putRequest = store.put(counter);

                putRequest.onsuccess = () => resolve(nextValue);
                putRequest.onerror = () => reject(putRequest.error);
            };

            getRequest.onerror = () => reject(getRequest.error);
        });
    },

    /**
     * Get current counter value without incrementing
     * @param {string} type - Counter type
     * @returns {Promise<number>}
     */
    async getCounter(type) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['counters'], 'readonly');
            const store = transaction.objectStore('counters');
            const request = store.get(type);

            request.onsuccess = () => {
                const counter = request.result || { type, value: 0 };
                resolve(counter.value);
            };
            request.onerror = () => reject(request.error);
        });
    },

    /**
     * Delete a record
     * @param {string} storeName - Object store name
     * @param {string} id - Record ID
     * @returns {Promise<void>}
     */
    async delete(storeName, id) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([storeName], 'readwrite');
            const store = transaction.objectStore(storeName);
            const request = store.delete(id);

            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    },

    /**
     * Clear all records from a store
     * @param {string} storeName - Object store name
     * @returns {Promise<void>}
     */
    async clear(storeName) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([storeName], 'readwrite');
            const store = transaction.objectStore(storeName);
            const request = store.clear();

            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    },

    /**
     * Count records in a store
     * @param {string} storeName - Object store name
     * @returns {Promise<number>}
     */
    async count(storeName) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([storeName], 'readonly');
            const store = transaction.objectStore(storeName);
            const request = store.count();

            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    },

    // =============================================
    // Fund-specific methods
    // =============================================

    /**
     * Create a new fund
     * @param {Object} fundData - Fund data
     * @returns {Promise<string>} Fund ID
     */
    async createFund(fundData) {
        // Validate required fields
        if (!fundData.name) throw new Error('Fund name is required');
        if (!fundData.type || !['allocated', 'open'].includes(fundData.type)) {
            throw new Error('Valid fund type is required (allocated or open)');
        }
        if (fundData.type === 'allocated' && !fundData.totalGoal) {
            throw new Error('Total goal is required for allocated funds');
        }

        const fund = {
            name: fundData.name,
            description: fundData.description || '',
            type: fundData.type,
            totalGoal: fundData.type === 'allocated' ? parseFloat(fundData.totalGoal) : null,
            totalCollected: 0,
            createdAt: Date.now(),
            updatedAt: Date.now()
        };

        const fundId = await this.put('funds', fund);

        fund.id = fundId;

        return fundId;
    },

    /**
     * Get all funds
     * @returns {Promise<Array>}
     */
    async getAllFunds() {
        return await this.getAll('funds');
    },

    /**
     * Get fund by ID
     * @param {string} fundId - Fund ID
     * @returns {Promise<Object|null>}
     */
    async getFund(fundId) {
        return await this.get('funds', fundId);
    },

    /**
     * Update fund
     * @param {string} fundId - Fund ID
     * @param {Object} updates - Fields to update
     * @returns {Promise<string>}
     */
    async updateFund(fundId, updates) {
        const fund = await this.getFund(fundId);
        if (!fund) throw new Error('Fund not found');

        const updated = { ...fund, ...updates, updatedAt: Date.now() };
        await this.put('funds', updated);


        return fundId;
    },

    /**
     * Delete fund and all related data
     * @param {string} fundId - Fund ID
     * @returns {Promise<void>}
     */
    async deleteFund(fundId) {
        // Delete all payments for this fund
        const payments = await this.getByIndex('payments', 'fundId', fundId);
        for (const payment of payments) {
            await this.delete('payments', payment.id);
            // Sync payment deletion to Firebase
        }

        // Delete all groups for this fund
        const groups = await this.getByIndex('groups', 'fundId', fundId);
        for (const group of groups) {
            await this.delete('groups', group.id);
            // Sync group deletion to Firebase
        }

        // Delete the fund
        await this.delete('funds', fundId);

        // Sync fund deletion to Firebase
    },

    /**
     * Switch fund type (allocated <-> open)
     * @param {string} fundId - Fund ID
     * @returns {Promise<string>}
     */
    async switchFundType(fundId) {
        const fund = await this.getFund(fundId);
        if (!fund) throw new Error('Fund not found');

        const newType = fund.type === 'allocated' ? 'open' : 'allocated';

        // If switching to allocated, need to set a goal
        if (newType === 'allocated') {
            // Calculate total from group allocations or collected amount
            const groups = await this.getByIndex('groups', 'fundId', fundId);
            const totalAllocated = groups.reduce((sum, g) => sum + (g.allocation || 0), 0);
            fund.totalGoal = totalAllocated > 0 ? totalAllocated : fund.totalCollected;
        } else {
            // Switching to open - remove goal but keep allocations as history
            fund.totalGoal = null;
        }

        fund.type = newType;
        return await this.put('funds', fund);
    },

    // =============================================
    // Group-specific methods
    // =============================================

    /**
     * Create a new group
     * @param {Object} groupData - Group data
     * @returns {Promise<string>} Group ID
     */
    async createGroup(groupData) {
        if (!groupData.name) throw new Error('Group name is required');
        if (!groupData.fundId) throw new Error('Fund ID is required');

        const fund = await this.getFund(groupData.fundId);
        if (!fund) throw new Error('Fund not found');

        // Check for duplicate group name within fund
        const existingGroups = await this.getByIndex('groups', 'fundId', groupData.fundId);
        if (existingGroups.some(g => g.name.toLowerCase() === groupData.name.toLowerCase())) {
            throw new Error('A group with this name already exists in this fund');
        }

        // Validate allocation for allocated funds
        if (fund.type === 'allocated') {
            if (!groupData.allocation || groupData.allocation <= 0) {
                throw new Error('Allocation amount is required for allocated funds');
            }

            // Note: We allow allocations to exceed the fund goal for flexibility
            // The UI will show when allocations exceed 100%
        }

        const group = {
            fundId: groupData.fundId,
            name: groupData.name,
            allocation: fund.type === 'allocated' ? parseFloat(groupData.allocation) : null,
            includeInDivision: groupData.includeInDivision !== undefined ? groupData.includeInDivision : true,
            totalPaid: 0,
            createdAt: Date.now(),
            updatedAt: Date.now()
        };

        const groupId = await this.put('groups', group);

        group.id = groupId;

        return groupId;
    },

    /**
     * Get all groups for a fund
     * @param {string} fundId - Fund ID
     * @returns {Promise<Array>}
     */
    async getGroupsByFund(fundId) {
        return await this.getByIndex('groups', 'fundId', fundId);
    },

    /**
     * Get all groups
     * @returns {Promise<Array>}
     */
    async getAllGroups() {
        return await this.getAll('groups');
    },

    /**
     * Get group by ID
     * @param {string} groupId - Group ID
     * @returns {Promise<Object|null>}
     */
    async getGroup(groupId) {
        return await this.get('groups', groupId);
    },

    /**
     * Update group
     * @param {string} groupId - Group ID
     * @param {Object} updates - Fields to update
     * @returns {Promise<string>}
     */
    async updateGroup(groupId, updates) {
        const group = await this.getGroup(groupId);
        if (!group) throw new Error('Group not found');

        const updated = { ...group, ...updates, updatedAt: Date.now() };
        await this.put('groups', updated);


        return groupId;
    },

    /**
     * Delete group and all associated payments
     * @param {string} groupId - Group ID
     * @returns {Promise<void>}
     */
    async deleteGroup(groupId) {
        const group = await this.getGroup(groupId);
        if (!group) throw new Error('Group not found');

        const fundId = group.fundId;

        // Get all payments for this group
        const payments = await this.getByIndex('payments', 'groupId', groupId);

        // Delete all payments first (this updates group and fund totals)
        for (const payment of payments) {
            await this.deletePayment(payment.id);
        }

        // Now delete the group
        await this.delete('groups', groupId);

        // Sync group deletion to Firebase
    },

    // =============================================
    // Payment-specific methods
    // =============================================

    /**
     * Create a new payment
     * @param {Object} paymentData - Payment data
     * @returns {Promise<string>} Payment ID
     */
    async createPayment(paymentData) {
        if (!paymentData.fundId) throw new Error('Fund ID is required');
        if (!paymentData.groupId) throw new Error('Group ID is required');
        if (!paymentData.amount || paymentData.amount <= 0) {
            throw new Error('Valid amount is required');
        }
        if (!paymentData.date) throw new Error('Payment date is required');
        if (!paymentData.paymentMethod) throw new Error('Payment method is required');

        const fund = await this.getFund(paymentData.fundId);
        if (!fund) throw new Error('Fund not found');

        const group = await this.getGroup(paymentData.groupId);
        if (!group) throw new Error('Group not found');

        const amount = parseFloat(paymentData.amount);

        // For allocated funds, allow payments even if they exceed allocation
        // The UI will show when a group has exceeded its allocation
        // Optional: Log a warning if payment exceeds remaining allocation
        if (fund.type === 'allocated' && group.allocation) {
            const remaining = group.allocation - group.totalPaid;
            if (amount > remaining) {
                console.warn(`Payment of ${amount} exceeds remaining allocation of ${remaining} for group ${group.name}`);
            }
        }

        const isPledge = paymentData.isPledge === true;

        const payment = {
            fundId: paymentData.fundId,
            groupId: paymentData.groupId,
            amount: amount,
            isPledge: isPledge,
            date: new Date(paymentData.date).getTime(),
            payerName: paymentData.payerName || '',
            paymentMethod: paymentData.paymentMethod,
            referenceNumber: paymentData.referenceNumber || '',
            note: paymentData.note || '',
            createdAt: Date.now(),
            updatedAt: Date.now()
        };

        const paymentId = await this.put('payments', payment);

        // Update group totals based on whether this is a pledge or payment
        if (isPledge) {
            if (!group.totalPledged) group.totalPledged = 0;
            group.totalPledged += amount;
        } else {
            group.totalPaid += amount;
        }
        await this.put('groups', group);

        // Update fund totals based on whether this is a pledge or payment
        if (isPledge) {
            if (!fund.totalPledged) fund.totalPledged = 0;
            fund.totalPledged += amount;
        } else {
            fund.totalCollected += amount;
        }
        await this.put('funds', fund);

        // Sync payment to Firebase
        payment.id = paymentId;

        // Sync updated group and fund totals to Firebase

        return paymentId;
    },

    /**
     * Get all payments
     * @returns {Promise<Array>}
     */
    async getAllPayments() {
        return await this.getAll('payments');
    },

    /**
     * Get payments by fund
     * @param {string} fundId - Fund ID
     * @returns {Promise<Array>}
     */
    async getPaymentsByFund(fundId) {
        return await this.getByIndex('payments', 'fundId', fundId);
    },

    /**
     * Get payments by group
     * @param {string} groupId - Group ID
     * @returns {Promise<Array>}
     */
    async getPaymentsByGroup(groupId) {
        return await this.getByIndex('payments', 'groupId', groupId);
    },

    /**
     * Get payment by ID
     * @param {string} paymentId - Payment ID
     * @returns {Promise<Object|null>}
     */
    async getPayment(paymentId) {
        return await this.get('payments', paymentId);
    },

    /**
     * Update payment
     * @param {string} paymentId - Payment ID
     * @param {Object} updates - Fields to update
     * @returns {Promise<string>}
     */
    async updatePayment(paymentId, updates) {
        const oldPayment = await this.getPayment(paymentId);
        if (!oldPayment) throw new Error('Payment not found');

        const oldAmount = oldPayment.amount;
        const newAmount = updates.amount ? parseFloat(updates.amount) : oldAmount;
        const amountDiff = newAmount - oldAmount;

        // Update payment
        const updated = { ...oldPayment, ...updates, updatedAt: Date.now() };
        if (updates.amount) updated.amount = newAmount;
        await this.put('payments', updated);

        // Sync payment update to Firebase

        // Update group total if amount changed
        if (amountDiff !== 0) {
            const group = await this.getGroup(oldPayment.groupId);
            if (group) {
                group.totalPaid += amountDiff;
                await this.put('groups', group);
                // Sync group update to Firebase
            }

            // Update fund total
            const fund = await this.getFund(oldPayment.fundId);
            if (fund) {
                fund.totalCollected += amountDiff;
                await this.put('funds', fund);
                // Sync fund update to Firebase
            }
        }

        return paymentId;
    },

    /**
     * Delete payment
     * @param {string} paymentId - Payment ID
     * @returns {Promise<void>}
     */
    async deletePayment(paymentId) {
        const payment = await this.getPayment(paymentId);
        if (!payment) throw new Error('Payment not found');

        const isPledge = payment.isPledge === true;

        // Update group total based on whether this was a pledge or payment
        const group = await this.getGroup(payment.groupId);
        if (group) {
            if (isPledge) {
                if (group.totalPledged) {
                    group.totalPledged -= payment.amount;
                }
            } else {
                group.totalPaid -= payment.amount;
            }
            await this.put('groups', group);
        }

        // Update fund total based on whether this was a pledge or payment
        const fund = await this.getFund(payment.fundId);
        if (fund) {
            if (isPledge) {
                if (fund.totalPledged) {
                    fund.totalPledged -= payment.amount;
                }
            } else {
                fund.totalCollected -= payment.amount;
            }
            await this.put('funds', fund);
            // Sync fund update to Firebase
        }

        // Delete payment
        await this.delete('payments', paymentId);

        // Sync payment deletion to Firebase

        // Sync group update to Firebase (totals changed)
        if (group) {
        }
    },

    // =============================================
    // Pledge-specific methods
    // =============================================

    /**
     * Create a new pledge
     * @param {Object} pledgeData - Pledge data
     * @returns {Promise<string>} Pledge ID
     */
    async createPledge(pledgeData) {
        if (!pledgeData.fundId) throw new Error('Fund ID is required');
        if (!pledgeData.groupId) throw new Error('Group ID is required');
        if (!pledgeData.amount || pledgeData.amount <= 0) {
            throw new Error('Valid amount is required');
        }

        const fund = await this.getFund(pledgeData.fundId);
        if (!fund) throw new Error('Fund not found');

        const group = await this.getGroup(pledgeData.groupId);
        if (!group) throw new Error('Group not found');

        const amount = parseFloat(pledgeData.amount);

        const pledge = {
            fundId: pledgeData.fundId,
            groupId: pledgeData.groupId,
            amount: amount,
            description: pledgeData.description || '',
            createdAt: Date.now(),
            updatedAt: Date.now()
        };

        const pledgeId = await this.put('pledges', pledge);

        // Update group totalPledged
        if (!group.totalPledged) group.totalPledged = 0;
        group.totalPledged += amount;
        await this.put('groups', group);

        // Update fund totalPledged
        if (!fund.totalPledged) fund.totalPledged = 0;
        fund.totalPledged += amount;
        await this.put('funds', fund);

        return pledgeId;
    },

    /**
     * Get all pledges
     * @returns {Promise<Array>}
     */
    async getAllPledges() {
        return await this.getAll('pledges');
    },

    /**
     * Get pledges by fund
     * @param {string} fundId - Fund ID
     * @returns {Promise<Array>}
     */
    async getPledgesByFund(fundId) {
        return await this.getByIndex('pledges', 'fundId', fundId);
    },

    /**
     * Get pledges by group
     * @param {string} groupId - Group ID
     * @returns {Promise<Array>}
     */
    async getPledgesByGroup(groupId) {
        return await this.getByIndex('pledges', 'groupId', groupId);
    },

    /**
     * Get pledge by ID
     * @param {string} pledgeId - Pledge ID
     * @returns {Promise<Object|null>}
     */
    async getPledge(pledgeId) {
        return await this.get('pledges', pledgeId);
    },

    /**
     * Update pledge
     * @param {string} pledgeId - Pledge ID
     * @param {Object} updates - Fields to update
     * @returns {Promise<string>}
     */
    async updatePledge(pledgeId, updates) {
        const oldPledge = await this.getPledge(pledgeId);
        if (!oldPledge) throw new Error('Pledge not found');

        const oldAmount = oldPledge.amount;
        const newAmount = updates.amount ? parseFloat(updates.amount) : oldAmount;
        const amountDiff = newAmount - oldAmount;

        // Update pledge
        const updated = { ...oldPledge, ...updates, updatedAt: Date.now() };
        if (updates.amount) updated.amount = newAmount;
        await this.put('pledges', updated);

        // Update group totalPledged if amount changed
        if (amountDiff !== 0) {
            const group = await this.getGroup(oldPledge.groupId);
            if (group) {
                if (!group.totalPledged) group.totalPledged = 0;
                group.totalPledged += amountDiff;
                await this.put('groups', group);
            }

            // Update fund totalPledged
            const fund = await this.getFund(oldPledge.fundId);
            if (fund) {
                if (!fund.totalPledged) fund.totalPledged = 0;
                fund.totalPledged += amountDiff;
                await this.put('funds', fund);
            }
        }

        return pledgeId;
    },

    /**
     * Delete pledge
     * @param {string} pledgeId - Pledge ID
     * @returns {Promise<void>}
     */
    async deletePledge(pledgeId) {
        const pledge = await this.getPledge(pledgeId);
        if (!pledge) throw new Error('Pledge not found');

        // Update group totalPledged
        const group = await this.getGroup(pledge.groupId);
        if (group) {
            if (!group.totalPledged) group.totalPledged = 0;
            group.totalPledged -= pledge.amount;
            await this.put('groups', group);
        }

        // Update fund totalPledged
        const fund = await this.getFund(pledge.fundId);
        if (fund) {
            if (!fund.totalPledged) fund.totalPledged = 0;
            fund.totalPledged -= pledge.amount;
            await this.put('funds', fund);
        }

        // Delete pledge
        await this.delete('pledges', pledgeId);
    },

    // =============================================
    // Expenses methods
    // =============================================

    /**
     * Add expense
     * @param {Object} expense - Expense object
     * @returns {Promise<string>}
     */
    async addExpense(expense) {
        const expenseData = {
            ...expense,
            createdAt: expense.createdAt || Date.now(),
            updatedAt: Date.now()
        };
        // ID will be auto-generated by put() method using generateExpenseId()
        const expenseId = await this.put('expenses', expenseData);

        // Sync expense to Firebase
        expenseData.id = expenseId;

        return expenseId;
    },

    /**
     * Get all expenses
     * @returns {Promise<Array>}
     */
    async getExpenses() {
        return await this.getAll('expenses');
    },

    /**
     * Get expenses by date range
     * @param {string} startDate - Start date (YYYY-MM-DD)
     * @param {string} endDate - End date (YYYY-MM-DD)
     * @returns {Promise<Array>}
     */
    async getExpensesByDateRange(startDate, endDate) {
        const allExpenses = await this.getAll('expenses');
        return allExpenses.filter(expense =>
            expense.date >= startDate && expense.date <= endDate
        );
    },

    /**
     * Get expenses by category
     * @param {string} category - Category name
     * @returns {Promise<Array>}
     */
    async getExpensesByCategory(category) {
        return await this.getByIndex('expenses', 'category', category);
    },

    /**
     * Get expense by ID
     * @param {string} expenseId - Expense ID
     * @returns {Promise<Object|null>}
     */
    async getExpense(expenseId) {
        return await this.get('expenses', expenseId);
    },

    /**
     * Update expense
     * @param {Object} expense - Updated expense object
     * @returns {Promise<string>}
     */
    async updateExpense(expense) {
        const existing = await this.getExpense(expense.id);
        if (!existing) throw new Error('Expense not found');

        const updated = {
            ...existing,
            ...expense,
            updatedAt: Date.now()
        };
        await this.put('expenses', updated);

        // Sync expense update to Firebase

        return expense.id;
    },

    /**
     * Delete expense
     * @param {string} expenseId - Expense ID
     * @returns {Promise<void>}
     */
    async deleteExpense(expenseId) {
        const expense = await this.getExpense(expenseId);
        if (!expense) throw new Error('Expense not found');

        await this.delete('expenses', expenseId);

        // Sync expense deletion to Firebase
    },

    // =============================================
    // Settings methods
    // =============================================

    /**
     * Get app settings
     * @returns {Promise<Object>}
     */
    async getSettings() {
        const settings = await this.get('settings', 'app_settings');
        if (!settings) {
            // Return defaults if not found
            return {
                id: 'app_settings',
                appName: 'ContributionTracker Pro',
                theme: 'light',
                createdAt: Date.now(),
                updatedAt: Date.now()
            };
        }
        return settings;
    },

    /**
     * Update settings
     * @param {Object} updates - Settings to update
     * @returns {Promise<string>}
     */
    async updateSettings(updates) {
        const settings = await this.getSettings();
        const updated = { ...settings, ...updates, updatedAt: Date.now() };
        return await this.put('settings', updated);
    },

    // =============================================
    // Statistics & Analytics
    // =============================================

    /**
     * Get dashboard statistics
     * @returns {Promise<Object>}
     */
    async getDashboardStats() {
        const funds = await this.getAllFunds();
        const payments = await this.getAllPayments();

        const totalCollected = funds.reduce((sum, fund) => sum + (fund.totalCollected || 0), 0);
        const totalPledged = funds.reduce((sum, fund) => sum + (fund.totalPledged || 0), 0);

        return {
            totalFunds: funds.length,
            totalCollected: totalCollected,
            totalPledged: totalPledged,
            totalPayments: payments.length,
            recentFunds: funds.slice(-5).reverse()
        };
    },

    /**
     * Get fund details with groups and payments
     * @param {string} fundId - Fund ID
     * @returns {Promise<Object>}
     */
    async getFundDetails(fundId) {
        const fund = await this.getFund(fundId);
        if (!fund) return null;

        const groups = await this.getGroupsByFund(fundId);
        const payments = await this.getPaymentsByFund(fundId);

        // Calculate remaining for allocated funds
        if (fund.type === 'allocated') {
            fund.remaining = fund.totalGoal - fund.totalCollected;
            fund.percentage = Utils.calculatePercentage(fund.totalCollected, fund.totalGoal);
        }

        return {
            fund,
            groups,
            payments,
            groupCount: groups.length,
            paymentCount: payments.length
        };
    },

    /**
     * Authenticate user
     * @param {string} username - Username
     * @param {string} password - Password
     * @returns {Promise<Object|null>} User object if authenticated, null otherwise
     */
    async authenticateUser(username, password) {
        const users = await this.getAll('users');
        const user = users.find(u => u.username === username && u.password === password);
        if (user) {
            // Remove password from returned object for security
            const { password: _, ...userWithoutPassword } = user;
            return userWithoutPassword;
        }
        return null;
    },

    /**
     * Get all users
     * @returns {Promise<Array>}
     */
    async getAllUsers() {
        const users = await this.getAll('users');
        // Remove passwords from returned objects
        return users.map(({ password, ...user }) => user);
    },

    /**
     * Create a new user
     * @param {Object} userData - User data
     * @returns {Promise<string>} User ID
     */
    async createUser(userData) {
        // Check if username already exists
        const users = await this.getAll('users');
        if (users.some(u => u.username === userData.username)) {
            throw new Error('Username already exists');
        }

        const user = {
            id: Utils.generateUUID(),
            username: userData.username,
            password: userData.password, // In production, hash this
            createdAt: Date.now(),
            updatedAt: Date.now()
        };

        await this.put('users', user);
        return user.id;
    },

    /**
     * Update user password
     * @param {string} userId - User ID
     * @param {string} newPassword - New password
     * @returns {Promise<void>}
     */
    async updateUserPassword(userId, newPassword) {
        const user = await this.get('users', userId);
        if (!user) {
            throw new Error('User not found');
        }

        user.password = newPassword; // In production, hash this
        user.updatedAt = Date.now();
        await this.put('users', user);
    },

    /**
     * Delete user
     * @param {string} userId - User ID
     * @returns {Promise<void>}
     */
    async deleteUser(userId) {
        // Prevent deleting the only admin user
        const users = await this.getAll('users');
        if (users.length === 1) {
            throw new Error('Cannot delete the only user');
        }

        await this.delete('users', userId);
    },

    /**
     * Clear all data (for testing/reset)
     * @returns {Promise<void>}
     */
    async clearAllData() {
        await this.clear('payments');
        await this.clear('groups');
        await this.clear('funds');
        await this.clear('expenses');

        // Reset all ID counters to 0
        await this.resetAllCounters();

        // Note: We keep settings and users intact for security
        console.log('✅ All data cleared (funds, groups, payments, expenses) and counters reset');
    },

    /**
     * Reset all ID counters to 0
     * @returns {Promise<void>}
     */
    async resetAllCounters() {
        const settings = await this.getSettings();
        settings.counters = {
            fund: 0,
            group: 0,
            payment: 0,
            expense: 0
        };
        await this.updateSettings(settings);
        console.log('✅ All counters reset to 0');
    },

    // =============================================
    // User management methods
    // =============================================

    /**
     * Update user credentials
     * @param {Object} user - Updated user object with id, username, password
     * @returns {Promise<string>}
     */
    async updateUserCredentials(user) {
        if (!user.id) throw new Error('User ID is required');
        if (!user.username) throw new Error('Username is required');
        if (!user.password) throw new Error('Password is required');

        const existing = await this.get('users', user.id);
        if (!existing) throw new Error('User not found');

        const updated = {
            ...existing,
            username: user.username,
            password: user.password,
            updatedAt: Date.now()
        };

        await this.put('users', updated);
        return user.id;
    }
};

// ============================================================================
// ⚠️ AUTO-INITIALIZATION DISABLED
// ============================================================================
// IndexedDB is now only initialized when Firebase is unavailable.
// The app will use Firestore as primary database through the adapter pattern.
//
// If you need to manually initialize IndexedDB (for offline testing), call:
//   await DB.init();
// ============================================================================

console.log('✅ DB Manager loaded (FALLBACK MODE - No auto-init)');
