// Data Migration Script
// ContributionTracker Pro - Migrate from nested subcollections to flat structure
// Run this once to migrate existing data

import { initializeFirebase, getFirebaseDb } from './firebase-config.js';
import {
    collection,
    doc,
    getDocs,
    setDoc,
    writeBatch,
    query,
    collectionGroup
} from 'firebase/firestore';

class DataMigration {
    constructor() {
        this.db = null;
        this.stats = {
            organizations: 0,
            funds: 0,
            groups: 0,
            payments: 0,
            expenses: 0,
            activityLogs: 0,
            errors: []
        };
    }

    async init() {
        try {
            await initializeFirebase();
            this.db = getFirebaseDb();
            console.log('✅ Migration tool initialized');
            return true;
        } catch (error) {
            console.error('❌ Failed to initialize migration tool:', error);
            return false;
        }
    }

    /**
     * Main migration function
     */
    async migrate() {
        console.log('🚀 Starting data migration from nested to flat structure...\n');

        try {
            // Step 1: Get all organizations
            const organizations = await this.getOrganizations();
            console.log(`📊 Found ${organizations.length} organizations to migrate\n`);

            // Step 2: Migrate each organization
            for (const org of organizations) {
                console.log(`\n📦 Migrating organization: ${org.name} (${org.id})`);
                console.log('─'.repeat(60));

                await this.migrateOrganization(org.id);
            }

            // Step 3: Print summary
            this.printSummary();

            return {
                success: true,
                stats: this.stats
            };

        } catch (error) {
            console.error('❌ Migration failed:', error);
            this.stats.errors.push(error.message);
            return {
                success: false,
                error: error.message,
                stats: this.stats
            };
        }
    }

    /**
     * Get all organizations
     */
    async getOrganizations() {
        const orgsSnapshot = await getDocs(collection(this.db, 'organizations'));
        this.stats.organizations = orgsSnapshot.size;

        return orgsSnapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        }));
    }

    /**
     * Migrate a single organization
     */
    async migrateOrganization(orgId) {
        try {
            // Migrate funds (from subcollection to top-level)
            await this.migrateFunds(orgId);

            // Migrate expenses (from subcollection to top-level)
            await this.migrateExpenses(orgId);

            // Migrate activity logs (from subcollection to top-level)
            await this.migrateActivityLogs(orgId);

            console.log(`✅ Organization ${orgId} migrated successfully`);

        } catch (error) {
            console.error(`❌ Error migrating organization ${orgId}:`, error);
            this.stats.errors.push(`Org ${orgId}: ${error.message}`);
        }
    }

    /**
     * Migrate funds and their nested collections
     */
    async migrateFunds(orgId) {
        try {
            // Get funds from old subcollection path
            const fundsPath = `organizations/${orgId}/funds`;
            const fundsSnapshot = await getDocs(collection(this.db, fundsPath));

            console.log(`  💰 Migrating ${fundsSnapshot.size} funds...`);

            for (const fundDoc of fundsSnapshot.docs) {
                const fundData = fundDoc.data();
                const fundId = fundDoc.id;

                // Write to new top-level funds collection
                const newFundRef = doc(this.db, 'funds', fundId);
                await setDoc(newFundRef, {
                    ...fundData,
                    organizationId: orgId  // ← Add organization link
                });

                this.stats.funds++;

                // Migrate groups for this fund
                await this.migrateGroups(orgId, fundId);

                // Migrate payments for this fund
                await this.migratePayments(orgId, fundId);
            }

            console.log(`  ✅ Funds migrated: ${fundsSnapshot.size}`);

        } catch (error) {
            console.error(`  ❌ Error migrating funds for org ${orgId}:`, error);
            this.stats.errors.push(`Funds for ${orgId}: ${error.message}`);
        }
    }

    /**
     * Migrate groups for a fund
     */
    async migrateGroups(orgId, fundId) {
        try {
            // Get groups from old nested path
            const groupsPath = `organizations/${orgId}/funds/${fundId}/groups`;
            const groupsSnapshot = await getDocs(collection(this.db, groupsPath));

            if (groupsSnapshot.size === 0) return;

            const batch = writeBatch(this.db);
            let count = 0;

            groupsSnapshot.forEach(groupDoc => {
                const groupData = groupDoc.data();
                const groupId = groupDoc.id;

                // Write to new top-level groups collection
                const newGroupRef = doc(this.db, 'groups', groupId);
                batch.set(newGroupRef, {
                    ...groupData,
                    organizationId: orgId,  // ← Add organization link
                    fundId: fundId          // ← Add fund link
                });

                count++;
                this.stats.groups++;
            });

            await batch.commit();
            console.log(`    👥 Groups migrated: ${count}`);

        } catch (error) {
            console.error(`    ❌ Error migrating groups for fund ${fundId}:`, error);
            this.stats.errors.push(`Groups for fund ${fundId}: ${error.message}`);
        }
    }

    /**
     * Migrate payments for a fund
     */
    async migratePayments(orgId, fundId) {
        try {
            // Get payments from old nested path
            const paymentsPath = `organizations/${orgId}/funds/${fundId}/payments`;
            const paymentsSnapshot = await getDocs(collection(this.db, paymentsPath));

            if (paymentsSnapshot.size === 0) return;

            const batch = writeBatch(this.db);
            let count = 0;

            paymentsSnapshot.forEach(paymentDoc => {
                const paymentData = paymentDoc.data();
                const paymentId = paymentDoc.id;

                // Write to new top-level payments collection
                const newPaymentRef = doc(this.db, 'payments', paymentId);
                batch.set(newPaymentRef, {
                    ...paymentData,
                    organizationId: orgId,  // ← Add organization link
                    fundId: fundId          // ← Add fund link
                });

                count++;
                this.stats.payments++;
            });

            await batch.commit();
            console.log(`    💳 Payments migrated: ${count}`);

        } catch (error) {
            console.error(`    ❌ Error migrating payments for fund ${fundId}:`, error);
            this.stats.errors.push(`Payments for fund ${fundId}: ${error.message}`);
        }
    }

    /**
     * Migrate expenses
     */
    async migrateExpenses(orgId) {
        try {
            // Get expenses from old subcollection path
            const expensesPath = `organizations/${orgId}/expenses`;
            const expensesSnapshot = await getDocs(collection(this.db, expensesPath));

            if (expensesSnapshot.size === 0) return;

            const batch = writeBatch(this.db);
            let count = 0;

            expensesSnapshot.forEach(expenseDoc => {
                const expenseData = expenseDoc.data();
                const expenseId = expenseDoc.id;

                // Write to new top-level expenses collection
                const newExpenseRef = doc(this.db, 'expenses', expenseId);
                batch.set(newExpenseRef, {
                    ...expenseData,
                    organizationId: orgId  // ← Add organization link
                });

                count++;
                this.stats.expenses++;
            });

            await batch.commit();
            console.log(`  💸 Expenses migrated: ${count}`);

        } catch (error) {
            console.error(`  ❌ Error migrating expenses for org ${orgId}:`, error);
            this.stats.errors.push(`Expenses for ${orgId}: ${error.message}`);
        }
    }

    /**
     * Migrate activity logs
     */
    async migrateActivityLogs(orgId) {
        try {
            // Get activity logs from old subcollection path
            const activityPath = `organizations/${orgId}/activityLogs`;
            const activitySnapshot = await getDocs(collection(this.db, activityPath));

            if (activitySnapshot.size === 0) return;

            const batch = writeBatch(this.db);
            let count = 0;

            activitySnapshot.forEach(activityDoc => {
                const activityData = activityDoc.data();
                const activityId = activityDoc.id;

                // Write to new top-level activityLogs collection
                const newActivityRef = doc(this.db, 'activityLogs', activityId);
                batch.set(newActivityRef, {
                    ...activityData,
                    organizationId: orgId  // ← Add organization link
                });

                count++;
                this.stats.activityLogs++;
            });

            await batch.commit();
            console.log(`  📋 Activity logs migrated: ${count}`);

        } catch (error) {
            console.error(`  ❌ Error migrating activity logs for org ${orgId}:`, error);
            this.stats.errors.push(`Activity logs for ${orgId}: ${error.message}`);
        }
    }

    /**
     * Print migration summary
     */
    printSummary() {
        console.log('\n');
        console.log('═'.repeat(60));
        console.log('📊 MIGRATION SUMMARY');
        console.log('═'.repeat(60));
        console.log(`Organizations processed: ${this.stats.organizations}`);
        console.log(`Funds migrated:          ${this.stats.funds}`);
        console.log(`Groups migrated:         ${this.stats.groups}`);
        console.log(`Payments migrated:       ${this.stats.payments}`);
        console.log(`Expenses migrated:       ${this.stats.expenses}`);
        console.log(`Activity logs migrated:  ${this.stats.activityLogs}`);
        console.log('─'.repeat(60));

        const totalMigrated = this.stats.funds + this.stats.groups +
                             this.stats.payments + this.stats.expenses +
                             this.stats.activityLogs;
        console.log(`TOTAL DOCUMENTS:         ${totalMigrated}`);

        if (this.stats.errors.length > 0) {
            console.log('\n⚠️  ERRORS ENCOUNTERED:');
            this.stats.errors.forEach((error, index) => {
                console.log(`  ${index + 1}. ${error}`);
            });
        } else {
            console.log('\n✅ Migration completed successfully with no errors!');
        }

        console.log('═'.repeat(60));
        console.log('\n');
    }

    /**
     * Verify migration - check that all data was migrated correctly
     */
    async verify() {
        console.log('🔍 Verifying migration...\n');

        try {
            // Count top-level documents
            const fundsCount = (await getDocs(collection(this.db, 'funds'))).size;
            const groupsCount = (await getDocs(collection(this.db, 'groups'))).size;
            const paymentsCount = (await getDocs(collection(this.db, 'payments'))).size;
            const expensesCount = (await getDocs(collection(this.db, 'expenses'))).size;
            const activityCount = (await getDocs(collection(this.db, 'activityLogs'))).size;

            console.log('Top-level collection counts:');
            console.log(`  Funds:        ${fundsCount}`);
            console.log(`  Groups:       ${groupsCount}`);
            console.log(`  Payments:     ${paymentsCount}`);
            console.log(`  Expenses:     ${expensesCount}`);
            console.log(`  Activity logs: ${activityCount}`);

            const matches =
                fundsCount === this.stats.funds &&
                groupsCount === this.stats.groups &&
                paymentsCount === this.stats.payments &&
                expensesCount === this.stats.expenses &&
                activityCount === this.stats.activityLogs;

            if (matches) {
                console.log('\n✅ Verification passed! All data migrated correctly.');
            } else {
                console.log('\n⚠️  Verification warning: Counts do not match migration stats.');
            }

            return matches;

        } catch (error) {
            console.error('❌ Verification failed:', error);
            return false;
        }
    }
}

// ==========================================
// EXPORT
// ==========================================

export default DataMigration;

// For standalone execution
if (typeof window !== 'undefined') {
    window.DataMigration = DataMigration;
    console.log('✅ Migration script loaded. Use: new DataMigration()');
}
