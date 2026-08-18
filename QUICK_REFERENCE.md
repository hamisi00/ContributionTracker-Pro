# Quick Reference - Flat Firestore Structure

## 🚀 Quick Start

### Initialize Firestore Adapter
```javascript
import FirestoreAdapter from './firestore-adapter.js';

const adapter = new FirestoreAdapter();
await adapter.initialize(organizationId);
```

---

## 📚 Common Operations

### **Funds**

```javascript
// Get all funds for current organization
const funds = await adapter.getAllFunds();

// Create a new fund
const fundId = await adapter.createFund({
  name: "Building Fund",
  type: "allocated",  // or "open"
  totalGoal: 50000,
  description: "New church building"
});

// Get fund details with groups and payments
const details = await adapter.getFundDetails(fundId);

// Update fund
await adapter.updateFund(fundId, {
  name: "Updated Name",
  totalGoal: 60000
});

// Delete fund
await adapter.deleteFund(fundId);
```

### **Groups**

```javascript
// Get groups for a fund
const groups = await adapter.getGroupsByFund(fundId);

// Create group
const groupId = await adapter.createGroup({
  fundId: fundId,
  name: "Team A",
  allocation: 10000
});

// Update group
await adapter.updateGroup(groupId, {
  name: "Updated Team Name",
  allocation: 12000
});

// Delete group
await adapter.deleteGroup(groupId);
```

### **Payments**

```javascript
// Get payments for a fund
const payments = await adapter.getPaymentsByFund(fundId);

// Get payments for a group
const groupPayments = await adapter.getPaymentsByGroup(groupId);

// Create payment
const paymentId = await adapter.createPayment({
  fundId: fundId,
  groupId: groupId,
  amount: 1000,
  date: Date.now(),
  payer: "John Doe",
  method: "M-Pesa",
  reference: "ABC123",
  notes: "Monthly contribution",
  isPledge: false
});

// Update payment
await adapter.updatePayment(paymentId, {
  amount: 1200,
  notes: "Corrected amount"
});

// Delete payment
await adapter.deletePayment(paymentId);
```

### **Expenses**

```javascript
// Get all expenses
const expenses = await adapter.getExpenses();

// Create expense
const expenseId = await adapter.createExpense({
  category: "supplies",
  amount: 500,
  date: Date.now(),
  vendor: "ABC Store",
  description: "Office supplies",
  notes: ""
});

// Update expense
await adapter.updateExpense(expenseId, {
  amount: 550,
  description: "Updated description"
});

// Delete expense
await adapter.deleteExpense(expenseId);
```

---

## 🔄 Real-Time Listeners

### **Setup Listener**

```javascript
// Listen to payments in a fund
const unsubscribe = adapter.onCollectionChanged(
  'payments',           // collection name
  (payments) => {       // callback
    console.log('Updated payments:', payments);
    updateUI(payments);
  },
  { fundId: fundId }    // optional filters
);

// Later: cleanup
unsubscribe();
```

### **Available Collections**
- `funds`
- `groups`
- `payments`
- `expenses`
- `activityLogs`

### **Available Filters**
```javascript
// Filter by fund
{ fundId: 'fund_123' }

// Filter by group
{ groupId: 'group_456' }

// Combine filters
{ fundId: 'fund_123', groupId: 'group_456' }
```

---

## 📊 Dashboard Stats

```javascript
const stats = await adapter.getDashboardStats();
console.log(stats);
/*
{
  totalFunds: 5,
  totalCollected: 50000,
  totalPledged: 10000,
  totalAllocated: 100000,
  totalExpenses: 15000,
  totalPayments: 25,
  balance: 35000,
  recentExpenses: [...]
}
*/
```

---

## 💾 Bulk Operations

### **Bulk Sync**

```javascript
// Sync multiple funds at once
const result = await adapter.syncFunds([
  { id: 'fund_1', name: 'Fund 1', type: 'allocated', totalGoal: 10000 },
  { id: 'fund_2', name: 'Fund 2', type: 'open', totalGoal: null },
]);

// Similarly for groups, payments, expenses
await adapter.syncGroups(groupsArray);
await adapter.syncPayments(paymentsArray);
await adapter.syncExpenses(expensesArray);
```

---

## 📤 Export/Import

### **Export Data**

```javascript
const exportData = await adapter.exportData();
console.log(exportData);
/*
{
  funds: [...],
  groups: [...],
  payments: [...],
  expenses: [...],
  settings: {...},
  exportDate: "2025-01-15T10:00:00Z",
  version: "2.0.0-flat"
}
*/

// Download as JSON
const blob = new Blob([JSON.stringify(exportData, null, 2)],
  { type: 'application/json' });
const url = URL.createObjectURL(blob);
const a = document.createElement('a');
a.href = url;
a.download = `contribution-data-${Date.now()}.json`;
a.click();
```

---

## 🔍 Generic Methods

### **Get All Items**

```javascript
// Get all items from a collection
const allFunds = await adapter.getAll('funds');
const allGroups = await adapter.getAll('groups');
const allPayments = await adapter.getAll('payments');
const allExpenses = await adapter.getAll('expenses');
```

### **Query by Index**

```javascript
// Get payments by fund
const payments = await adapter.getByIndex('payments', 'fundId', fundId);

// Get payments by group
const groupPayments = await adapter.getByIndex('payments', 'groupId', groupId);

// Get groups by fund
const groups = await adapter.getByIndex('groups', 'fundId', fundId);
```

---

## ⚙️ Settings

```javascript
// Get settings
const settings = await adapter.getSettings();
/*
{
  appName: "ContributionTracker Pro",
  theme: "light",
  currency: "KES"
}
*/

// Update settings
await adapter.updateSettings({
  appName: "My Church",
  theme: "dark",
  currency: "USD"
});
```

---

## 🧹 Cleanup

```javascript
// Remove all listeners when done
adapter.removeAllListeners();

// Full cleanup
adapter.cleanup();
```

---

## 🔥 Direct Firestore Service Access

### **Access Lower-Level Service**

```javascript
import FirestoreService from './firestore-service.js';

const service = new FirestoreService();
await service.init(userId, organizationId);

// Use service methods directly
const funds = await service.getAllFunds();
const fund = await service.getFund(fundId);
```

### **Service Methods**

**Funds:**
- `createFund(fundData)`
- `getAllFunds()`
- `getFund(fundId)`
- `updateFund(fundId, updates)`
- `deleteFund(fundId)`

**Groups:**
- `createGroup(groupData)`
- `getGroupsByFund(fundId)`
- `getGroup(groupId)`
- `updateGroup(groupId, updates)`
- `deleteGroup(groupId)`

**Payments:**
- `createPayment(paymentData)`
- `getPaymentsByFund(fundId)`
- `getPaymentsByGroup(groupId)`
- `getAllPayments()`
- `getPayment(paymentId)`
- `updatePayment(paymentId, updates)`
- `deletePayment(paymentId)`

**Expenses:**
- `createExpense(expenseData)`
- `getAllExpenses()`
- `getExpense(expenseId)`
- `updateExpense(expenseId, updates)`
- `deleteExpense(expenseId)`

**Listeners:**
- `onCollectionChanged(collection, callback, filters)`
- `offCollectionChanged(unsubscribe)`
- `removeAllListeners()`

**Bulk:**
- `syncFunds(funds)`
- `syncGroups(groups)`
- `syncPayments(payments)`
- `syncExpenses(expenses)`

**Activity:**
- `logActivity(action, entityType, entityId, description)`
- `getActivityLog(limit)`

---

## 📋 Data Structure Reference

### **Fund Document**
```javascript
{
  id: "fund_123",
  organizationId: "org_456",
  name: "Building Fund",
  description: "...",
  type: "allocated",  // or "open"
  totalGoal: 50000,
  totalCollected: 0,
  totalPledged: 0,
  createdAt: Timestamp,
  updatedAt: Timestamp,
  createdBy: "user_789"
}
```

### **Group Document**
```javascript
{
  id: "group_101",
  organizationId: "org_456",
  fundId: "fund_123",
  name: "Team A",
  allocation: 10000,
  totalPaid: 0,
  totalPledged: 0,
  createdAt: Timestamp,
  updatedAt: Timestamp,
  createdBy: "user_789"
}
```

### **Payment Document**
```javascript
{
  id: "payment_202",
  organizationId: "org_456",
  fundId: "fund_123",
  groupId: "group_101",
  amount: 1000,
  date: Timestamp,
  payer: "John Doe",
  method: "M-Pesa",
  reference: "ABC123",
  notes: "...",
  isPledge: false,
  createdAt: Timestamp,
  createdBy: "user_789"
}
```

### **Expense Document**
```javascript
{
  id: "expense_303",
  organizationId: "org_456",
  category: "supplies",
  amount: 500,
  date: Timestamp,
  vendor: "ABC Store",
  description: "...",
  notes: "...",
  createdAt: Timestamp,
  createdBy: "user_789"
}
```

---

## 🔐 Security Rules Summary

- ✅ **Read**: Members of organization can read
- ✅ **Create**: Members can create
- ✅ **Update/Delete**: Admin or Owner only
- ✅ **Activity Logs**: Immutable (create-only)

---

## 📚 File Reference

- **`firestore-service.js`** - Low-level Firestore operations
- **`firestore-adapter.js`** - High-level compatibility layer
- **`firestore.rules`** - Security rules
- **`firestore.indexes.json`** - Performance indexes
- **`migrate-flatten.js`** - Migration script

---

**Quick tip**: Always use the adapter layer for consistency. Only use the service directly if you need lower-level control.
