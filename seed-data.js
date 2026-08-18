/**
 * Seed Data for Contribution Tracker Pro
 * Use: await SeedData.populate() in browser console
 * Clear: await DB.clearAllData()
 */

const SeedData = {
    async populate() {
        console.log('Starting seed data population...');

        try {
            // Clear existing data first
            await DB.clearAllData();

            // Reset counters
            await this.resetCounters();

            // Create funds
            const funds = await this.createFunds();
            console.log(`Created ${funds.length} funds`);

            // Create groups (members)
            const groups = await this.createGroups(funds);
            console.log(`Created ${groups.length} groups`);

            // Create payments
            const payments = await this.createPayments(funds, groups);
            console.log(`Created ${payments.length} payments`);

            // Create pledges
            const pledges = await this.createPledges(funds, groups);
            console.log(`Created ${pledges.length} pledges`);

            // Create expenses
            const expenses = await this.createExpenses();
            console.log(`Created ${expenses.length} expenses`);

            // Update fund and group totals
            await this.updateTotals(funds, groups, payments, pledges);

            console.log('Seed data population complete!');
            console.log('Refresh the page to see the data.');

            return { funds, groups, payments, expenses };
        } catch (error) {
            console.error('Error populating seed data:', error);
            throw error;
        }
    },

    async resetCounters() {
        const counters = ['fund', 'group', 'payment', 'expense', 'pledge'];
        for (const type of counters) {
            await DB.put('counters', { type, value: 0 });
        }
    },

    async createFunds() {
        const fundsData = [
            {
                name: 'Building Fund',
                description: 'Community building and infrastructure development',
                type: 'allocated',
                totalGoal: 100000,
                totalCollected: 0
            },
            {
                name: 'Emergency Fund',
                description: 'Emergency assistance for members in need',
                type: 'open',
                totalGoal: null,
                totalCollected: 0
            },
            {
                name: 'Investment Fund',
                description: 'Group investment and wealth creation',
                type: 'allocated',
                totalGoal: 40000,
                totalCollected: 0
            },
            {
                name: 'Welfare Fund',
                description: 'Member welfare and social support',
                type: 'open',
                totalGoal: null,
                totalCollected: 0
            }
        ];

        const funds = [];
        for (const data of fundsData) {
            const fund = await this.createFund(data);
            funds.push(fund);
        }
        return funds;
    },

    async createFund(data) {
        const counter = await DB.get('counters', 'fund');
        const newValue = (counter?.value || 0) + 1;
        await DB.put('counters', { type: 'fund', value: newValue });

        const id = `FND-${String(newValue).padStart(4, '0')}`;
        const now = Date.now();

        const fund = {
            id,
            ...data,
            createdAt: now,
            updatedAt: now
        };

        await DB.put('funds', fund);
        return fund;
    },

    async createGroups(funds) {
        const memberNames = [
            'John Kamau', 'Mary Wanjiku', 'Peter Ochieng', 'Grace Akinyi',
            'James Mwangi', 'Faith Njeri', 'David Otieno', 'Sarah Wambui',
            'Michael Kiprop', 'Ann Chebet', 'Joseph Kariuki', 'Jane Auma',
            'Samuel Mutua', 'Lucy Muthoni', 'Daniel Kibet', 'Rose Adhiambo',
            'Patrick Kimani', 'Nancy Wangari', 'Robert Omondi', 'Catherine Nyambura'
        ];

        const groups = [];
        let memberIndex = 0;

        // Distribute members across funds
        for (const fund of funds) {
            const membersPerFund = fund.type === 'allocated' ? 6 : 4;

            for (let i = 0; i < membersPerFund && memberIndex < memberNames.length; i++) {
                const name = memberNames[memberIndex];
                let allocation = null;

                if (fund.type === 'allocated') {
                    // Distribute goal among members with some variation
                    allocation = Math.round(fund.totalGoal / membersPerFund);
                    // Add some variation
                    if (i % 2 === 0) allocation = Math.round(allocation * 1.2);
                    else allocation = Math.round(allocation * 0.8);
                }

                const group = await this.createGroup({
                    fundId: fund.id,
                    name,
                    allocation,
                    includeInDivision: true,
                    totalPaid: 0
                });

                groups.push(group);
                memberIndex++;
            }
        }

        return groups;
    },

    async createGroup(data) {
        const counter = await DB.get('counters', 'group');
        const newValue = (counter?.value || 0) + 1;
        await DB.put('counters', { type: 'group', value: newValue });

        const id = `GRP-${String(newValue).padStart(4, '0')}`;
        const now = Date.now();

        const group = {
            id,
            ...data,
            createdAt: now,
            updatedAt: now
        };

        await DB.put('groups', group);
        return group;
    },

    async createPayments(funds, groups) {
        const payments = [];
        const paymentMethods = ['M-Pesa', 'Cash', 'Bank Transfer'];
        const now = Date.now();
        const sixMonthsAgo = now - (180 * 24 * 60 * 60 * 1000);

        // Create payments for each group
        for (const group of groups) {
            const fund = funds.find(f => f.id === group.fundId);

            // Each member makes 3-5 payments
            const numPayments = 3 + Math.floor(Math.random() * 3);

            for (let i = 0; i < numPayments; i++) {
                // Random date in last 6 months
                const date = sixMonthsAgo + Math.random() * (now - sixMonthsAgo);

                // Random amount based on fund type
                let amount;
                if (fund.type === 'allocated' && group.allocation) {
                    // Pay portion of allocation
                    amount = Math.round((group.allocation / numPayments) * (0.8 + Math.random() * 0.4));
                } else {
                    // Random contribution 500-5000
                    amount = Math.round((500 + Math.random() * 4500) / 100) * 100;
                }

                const method = paymentMethods[Math.floor(Math.random() * paymentMethods.length)];
                let referenceNumber = '';

                if (method === 'M-Pesa') {
                    referenceNumber = `MP${Math.random().toString(36).substr(2, 8).toUpperCase()}`;
                } else if (method === 'Bank Transfer') {
                    referenceNumber = `BT${Math.floor(Math.random() * 900000) + 100000}`;
                }

                const payment = await this.createPayment({
                    fundId: fund.id,
                    groupId: group.id,
                    amount,
                    date,
                    payerName: group.name,
                    paymentMethod: method,
                    referenceNumber,
                    note: ''
                });

                payments.push(payment);
            }
        }

        return payments;
    },

    async createPayment(data) {
        const counter = await DB.get('counters', 'payment');
        const newValue = (counter?.value || 0) + 1;
        await DB.put('counters', { type: 'payment', value: newValue });

        const id = `PAY-${String(newValue).padStart(4, '0')}`;
        const now = Date.now();

        const payment = {
            id,
            ...data,
            createdAt: now,
            updatedAt: now
        };

        await DB.put('payments', payment);
        return payment;
    },

    async createPledges(funds, groups) {
        const pledges = [];
        const descriptions = [
            'Next month commitment',
            'Future payment pledge',
            'Upcoming contribution',
            'Planned payment',
            'Commitment for Q2',
            'Advance pledge',
            'Future fund commitment'
        ];

        // Create pledges for some random groups (about 40% of groups)
        const groupsWithPledges = groups.filter(() => Math.random() < 0.4);

        for (const group of groupsWithPledges) {
            const fund = funds.find(f => f.id === group.fundId);

            // Determine pledge amount
            let amount;
            if (fund.type === 'allocated' && group.allocation) {
                // Pledge 10-30% of remaining allocation
                const remaining = group.allocation - (group.totalPaid || 0);
                if (remaining > 0) {
                    amount = Math.round(remaining * (0.1 + Math.random() * 0.2));
                } else {
                    continue; // Skip if already exceeded allocation
                }
            } else {
                // Random pledge 1000-5000
                amount = Math.round((1000 + Math.random() * 4000) / 100) * 100;
            }

            const description = descriptions[Math.floor(Math.random() * descriptions.length)];

            const pledge = await this.createPledge({
                fundId: fund.id,
                groupId: group.id,
                amount,
                description
            });

            pledges.push(pledge);
        }

        return pledges;
    },

    async createPledge(data) {
        const counter = await DB.get('counters', 'pledge');
        const newValue = (counter?.value || 0) + 1;
        await DB.put('counters', { type: 'pledge', value: newValue });

        const id = `PLG-${String(newValue).padStart(4, '0')}`;
        const now = Date.now();

        const pledge = {
            id,
            ...data,
            createdAt: now,
            updatedAt: now
        };

        await DB.put('pledges', pledge);
        return pledge;
    },

    async createExpenses() {
        const expensesData = [
            { category: 'supplies', description: 'Stationery and printing', amount: 2500, vendor: 'Office Mart' },
            { category: 'supplies', description: 'Meeting refreshments', amount: 3500, vendor: 'Naivas Supermarket' },
            { category: 'supplies', description: 'Receipt books', amount: 800, vendor: 'Bookpoint' },
            { category: 'maintenance', description: 'Office rent', amount: 8000, vendor: 'Kamau Properties' },
            { category: 'maintenance', description: 'Furniture repair', amount: 1500, vendor: 'Jua Kali Fundi' },
            { category: 'maintenance', description: 'Cleaning services', amount: 2000, vendor: 'CleanPro Services' },
            { category: 'utilities', description: 'Electricity bill', amount: 3200, vendor: 'Kenya Power' },
            { category: 'utilities', description: 'Water bill', amount: 1800, vendor: 'Nairobi Water' },
            { category: 'utilities', description: 'Internet subscription', amount: 4500, vendor: 'Safaricom' },
            { category: 'utilities', description: 'Airtime for communication', amount: 1000, vendor: 'Safaricom' },
            { category: 'management', description: 'Bank charges', amount: 650, vendor: 'Equity Bank' },
            { category: 'management', description: 'Accountant fees', amount: 5000, vendor: 'Wanjiru & Associates' },
            { category: 'management', description: 'Legal consultation', amount: 7500, vendor: 'Ochieng Advocates' },
            { category: 'management', description: 'AGM venue hire', amount: 4000, vendor: 'Kenyatta Conference' },
            { category: 'other', description: 'Member training workshop', amount: 6000, vendor: 'Capacity Builders' },
            { category: 'other', description: 'Transport for site visit', amount: 3000, vendor: 'Safari Cabs' },
            { category: 'supplies', description: 'Laptop repairs', amount: 4500, vendor: 'Tech Solutions' },
            { category: 'maintenance', description: 'Plumbing repairs', amount: 2200, vendor: 'Quick Fix Plumbers' }
        ];

        const expenses = [];
        const now = new Date();
        // Start of current month
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
        const nowTime = now.getTime();

        for (const data of expensesData) {
            // Random date within current month (for "this month" stats)
            const dateTimestamp = startOfMonth + Math.random() * (nowTime - startOfMonth);
            const date = new Date(dateTimestamp).toISOString().split('T')[0];

            const expense = await this.createExpense({
                ...data,
                date
            });

            expenses.push(expense);
        }

        return expenses;
    },

    async createExpense(data) {
        const counter = await DB.get('counters', 'expense');
        const newValue = (counter?.value || 0) + 1;
        await DB.put('counters', { type: 'expense', value: newValue });

        const id = `EXP-${String(newValue).padStart(4, '0')}`;
        const now = Date.now();

        const expense = {
            id,
            ...data,
            createdAt: now,
            updatedAt: now
        };

        await DB.put('expenses', expense);
        return expense;
    },

    async updateTotals(funds, groups, payments, pledges) {
        // Update group totals
        for (const group of groups) {
            const groupPayments = payments.filter(p => p.groupId === group.id);
            const totalPaid = groupPayments.reduce((sum, p) => sum + p.amount, 0);

            const groupPledges = pledges.filter(p => p.groupId === group.id);
            const totalPledged = groupPledges.reduce((sum, p) => sum + p.amount, 0);

            group.totalPaid = totalPaid;
            group.totalPledged = totalPledged;
            group.updatedAt = Date.now();
            await DB.put('groups', group);
        }

        // Update fund totals
        for (const fund of funds) {
            const fundPayments = payments.filter(p => p.fundId === fund.id);
            const totalCollected = fundPayments.reduce((sum, p) => sum + p.amount, 0);

            const fundPledges = pledges.filter(p => p.fundId === fund.id);
            const totalPledged = fundPledges.reduce((sum, p) => sum + p.amount, 0);

            fund.totalCollected = totalCollected;
            fund.totalPledged = totalPledged;
            fund.updatedAt = Date.now();
            await DB.put('funds', fund);
        }
    }
};

console.log('SeedData loaded. Use: await SeedData.populate()');
