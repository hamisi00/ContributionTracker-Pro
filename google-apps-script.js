// Code.gs - Google Apps Script for ContributionTracker Pro Backend
// Deploy this script as a Web App to connect with your ContributionTracker Pro application

// IMPORTANT: Replace this with your actual Google Spreadsheet ID
const SPREADSHEET_ID = '1r9WYsA2HqUNAxvL7_pu53Jlo-tJGbwAeK5vNwAFHtEM';

const SHEETS = {
  FUNDS_SUMMARY: 'FundsSummary',
  PAYMENTS: 'Payments',
  EXPENSES: 'Expenses',
  SETTINGS: 'Settings'
};

// Simple doGet handler
function doGet(e) {
  try {
    const params = e.parameter;
    const action = params.action || 'test';

    let result;

    switch(action) {
      case 'test':
        result = { success: true, message: 'ContributionTracker Pro backend connected successfully!' };
        break;

      case 'setupSheets':
        result = setupAllSheets();
        break;

      case 'getFunds':
        result = getFunds();
        break;

      case 'getGroups':
        result = getGroups(params.fundId);
        break;

      case 'getPayments':
        result = getPayments();
        break;

      case 'getExpenses':
        result = getExpenses(params.startDate, params.endDate);
        break;

      case 'getSettings':
        result = getSettings();
        break;

      case 'getAllData':
        result = getAllData();
        break;

      default:
        result = { success: false, error: 'Unknown action: ' + action };
    }

    return ContentService.createTextOutput(JSON.stringify(result))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({
      success: false,
      error: error.toString()
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

// Simple doPost handler
function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    const action = data.action;
    const payload = data.payload || data.data;

    console.log(`📥 ${action} request received`);

    let result;

    switch(action) {
      // Fund Management
      case 'addFund':
        result = addFund(payload);
        break;

      case 'updateFund':
        result = updateFund(payload);
        break;

      case 'deleteFund':
        result = deleteFund(payload);
        break;

      // Group Management
      case 'addGroup':
        result = addGroup(payload);
        break;

      case 'updateGroup':
        result = updateGroup(payload);
        break;

      case 'deleteGroup':
        result = deleteGroup(payload);
        break;

      // Payment Management
      case 'recordPayment':
        result = recordPayment(payload);
        break;

      case 'deletePayment':
        result = deletePayment(payload);
        break;

      // Expense Management
      case 'addExpense':
        result = addExpense(payload);
        break;

      case 'updateExpense':
        result = updateExpense(payload);
        break;

      case 'deleteExpense':
        result = deleteExpense(payload);
        break;

      // Settings
      case 'updateSettings':
        result = updateSettings(payload);
        break;

      // Sync
      case 'syncAll':
        result = syncAllData(payload);
        break;

      default:
        result = { success: false, error: 'Unknown action: ' + action };
    }

    return ContentService.createTextOutput(JSON.stringify(result))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({
      success: false,
      error: error.toString()
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

// === UTILITY FUNCTIONS ===

function getSheetData(sheetName) {
  try {
    const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(sheetName);

    if (!sheet) {
      return [];
    }

    const data = sheet.getDataRange().getValues();
    if (data.length <= 1) return []; // No data or only headers

    const headers = data[0];
    const rows = data.slice(1);

    return rows.map(row => {
      const obj = {};
      headers.forEach((header, index) => {
        obj[header] = row[index];
      });
      return obj;
    });
  } catch (error) {
    console.error(`Error getting data from ${sheetName}:`, error);
    return [];
  }
}

function createSheet(sheetName, headers) {
  try {
    const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
    let sheet = spreadsheet.getSheetByName(sheetName);

    if (!sheet) {
      sheet = spreadsheet.insertSheet(sheetName);

      if (headers && headers.length > 0) {
        sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
        sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold');
        sheet.setFrozenRows(1);
      }
    }

    return sheet;
  } catch (error) {
    console.error(`Error creating sheet ${sheetName}:`, error);
    throw error;
  }
}

function sanitizeSheetName(name) {
  // Handle undefined, null, or empty names
  if (!name || typeof name !== 'string') {
    return 'Untitled';
  }

  // Remove invalid characters and limit length
  let sanitized = name.replace(/[:\\/?*\[\]]/g, '');

  // Limit to 100 characters (Google Sheets limit)
  if (sanitized.length > 100) {
    sanitized = sanitized.substring(0, 100);
  }

  // Ensure not empty after sanitization
  return sanitized.trim() || 'Untitled';
}

// === SETUP FUNCTIONS ===

function setupAllSheets() {
  try {
    const results = [];

    // Create FundsSummary sheet
    createSheet(SHEETS.FUNDS_SUMMARY, [
      'FundID', 'FundName', 'Type', 'Description', 'TotalGoal', 'TotalCollected',
      'TotalGroups', 'Status', 'CreatedDate', 'SheetName'
    ]);
    results.push('FundsSummary sheet ready');

    // Create Payments sheet (centralized)
    createSheet(SHEETS.PAYMENTS, [
      'PaymentID', 'FundID', 'FundName', 'GroupID', 'GroupName', 'Amount', 'IsPledge', 'Date',
      'PayerName', 'PaymentMethod', 'ReferenceNumber', 'Notes', 'CreatedDate'
    ]);
    results.push('Payments sheet ready');

    // Create Expenses sheet
    createSheet(SHEETS.EXPENSES, [
      'ExpenseID', 'Date', 'Category', 'Amount', 'Description',
      'PaymentMethod', 'Vendor', 'Notes', 'CreatedDate'
    ]);
    results.push('Expenses sheet ready');

    // Create Settings sheet
    createSheet(SHEETS.SETTINGS, ['Key', 'Value']);
    results.push('Settings sheet ready');

    return {
      success: true,
      message: 'All sheets setup completed successfully',
      results: results,
      totalSheets: results.length
    };
  } catch (error) {
    return { success: false, error: error.toString() };
  }
}

// === FUND MANAGEMENT ===

function getFunds() {
  try {
    const data = getSheetData(SHEETS.FUNDS_SUMMARY);
    return { success: true, data: data };
  } catch (error) {
    return { success: false, error: error.toString() };
  }
}

function addFund(fundData) {
  try {
    const summarySheet = createSheet(SHEETS.FUNDS_SUMMARY);

    // Anti-duplication check
    const data = summarySheet.getDataRange().getValues();
    for (let i = 1; i < data.length; i++) {
      if (data[i][0] == fundData.id) {
        console.log(`Fund ID ${fundData.id} already exists, updating instead`);
        return updateFund(fundData);
      }
    }

    if (!fundData.id) {
      return { success: false, error: 'Fund data must have a valid ID' };
    }

    // Create dedicated sheet for this fund
    const fundSheetName = sanitizeSheetName(fundData.name);
    const fundSheet = createSheet(fundSheetName, [
      'GroupID', 'GroupName', 'Allocation', 'TotalPaid', 'TotalPledged', 'Remaining',
      'Progress%', 'PaymentCount', 'MemberCount', 'Status', 'CreatedDate',
      'LastPaymentDate', 'LastPaymentAmount', 'Notes'
    ]);

    // Add fund to summary
    const row = [
      fundData.id,
      fundData.name,
      fundData.type || 'allocated',
      fundData.description || '',
      fundData.totalGoal || 0,
      fundData.totalCollected || 0,
      0, // totalGroups
      'active',
      new Date().toISOString(),
      fundSheetName
    ];

    summarySheet.appendRow(row);

    return {
      success: true,
      message: 'Fund added successfully',
      sheetName: fundSheetName
    };
  } catch (error) {
    return { success: false, error: error.toString() };
  }
}

function updateFund(fundData) {
  try {
    const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(SHEETS.FUNDS_SUMMARY);
    if (!sheet) return { success: false, error: 'FundsSummary sheet not found' };

    const data = sheet.getDataRange().getValues();

    for (let i = 1; i < data.length; i++) {
      if (data[i][0] == fundData.id) {
        // Check if fund name changed - need to rename sheet
        const oldSheetName = data[i][9];
        const newSheetName = sanitizeSheetName(fundData.name);

        if (oldSheetName !== newSheetName) {
          const fundSheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(oldSheetName);
          if (fundSheet) {
            fundSheet.setName(newSheetName);
          }
        }

        const updatedRow = [
          fundData.id,
          fundData.name || data[i][1],
          fundData.type || data[i][2],
          fundData.description || data[i][3],
          fundData.totalGoal || data[i][4],
          fundData.totalCollected || data[i][5],
          data[i][6], // Keep totalGroups
          data[i][7], // Keep status
          data[i][8], // Keep created date
          newSheetName
        ];

        sheet.getRange(i + 1, 1, 1, updatedRow.length).setValues([updatedRow]);
        return { success: true, message: 'Fund updated successfully' };
      }
    }

    return { success: false, error: 'Fund not found' };
  } catch (error) {
    return { success: false, error: error.toString() };
  }
}

function deleteFund(fundData) {
  try {
    const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(SHEETS.FUNDS_SUMMARY);
    if (!sheet) return { success: false, error: 'FundsSummary sheet not found' };

    const data = sheet.getDataRange().getValues();

    for (let i = 1; i < data.length; i++) {
      if (data[i][0] == fundData.id) {
        const fundSheetName = data[i][9];

        // Delete the fund's dedicated sheet
        const fundSheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(fundSheetName);
        if (fundSheet) {
          SpreadsheetApp.openById(SPREADSHEET_ID).deleteSheet(fundSheet);
        }

        // Delete from summary
        sheet.deleteRow(i + 1);
        return { success: true, message: 'Fund deleted successfully' };
      }
    }

    return { success: false, error: 'Fund not found' };
  } catch (error) {
    return { success: false, error: error.toString() };
  }
}

// === GROUP MANAGEMENT ===

function getGroups(fundId) {
  try {
    // Get fund sheet name from summary
    const summaryData = getSheetData(SHEETS.FUNDS_SUMMARY);
    const fundSummary = summaryData.find(f => f.FundID == fundId);

    if (!fundSummary) {
      return { success: false, error: 'Fund not found' };
    }

    const fundSheetName = fundSummary.SheetName;
    const data = getSheetData(fundSheetName);

    return { success: true, data: data };
  } catch (error) {
    return { success: false, error: error.toString() };
  }
}

function addGroup(groupData) {
  try {
    // Get fund sheet name
    const summaryData = getSheetData(SHEETS.FUNDS_SUMMARY);
    const fundSummary = summaryData.find(f => f.FundID == groupData.fundId);

    if (!fundSummary) {
      return { success: false, error: 'Fund not found' };
    }

    const fundSheetName = fundSummary.SheetName;
    const sheet = createSheet(fundSheetName);

    // Anti-duplication check
    const data = sheet.getDataRange().getValues();
    for (let i = 1; i < data.length; i++) {
      if (data[i][0] == groupData.id) {
        console.log(`Group ID ${groupData.id} already exists, updating instead`);
        return updateGroup(groupData);
      }
    }

    if (!groupData.id) {
      return { success: false, error: 'Group data must have a valid ID' };
    }

    const row = [
      groupData.id,
      groupData.name,
      groupData.allocation || 0,
      groupData.totalPaid || 0,
      groupData.totalPledged || 0,
      (groupData.allocation || 0) - (groupData.totalPaid || 0),
      groupData.allocation > 0 ? ((groupData.totalPaid || 0) / groupData.allocation * 100).toFixed(1) : 0,
      0, // paymentCount
      groupData.memberCount || 0,
      'active',
      new Date().toISOString(),
      '', // lastPaymentDate
      0,  // lastPaymentAmount
      groupData.notes || ''
    ];

    sheet.appendRow(row);

    // Update total groups count in summary
    updateFundGroupCount(groupData.fundId);

    return { success: true, message: 'Group added successfully' };
  } catch (error) {
    return { success: false, error: error.toString() };
  }
}

function updateGroup(groupData) {
  try {
    // Get fund sheet name
    const summaryData = getSheetData(SHEETS.FUNDS_SUMMARY);
    const fundSummary = summaryData.find(f => f.FundID == groupData.fundId);

    if (!fundSummary) {
      return { success: false, error: 'Fund not found' };
    }

    const fundSheetName = fundSummary.SheetName;
    const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(fundSheetName);
    if (!sheet) return { success: false, error: 'Fund sheet not found' };

    const data = sheet.getDataRange().getValues();

    for (let i = 1; i < data.length; i++) {
      if (data[i][0] == groupData.id) {
        const allocation = groupData.allocation !== undefined ? groupData.allocation : data[i][2];
        const totalPaid = groupData.totalPaid !== undefined ? groupData.totalPaid : data[i][3];
        const totalPledged = groupData.totalPledged !== undefined ? groupData.totalPledged : data[i][4];
        const remaining = allocation - totalPaid;
        const progress = allocation > 0 ? (totalPaid / allocation * 100).toFixed(1) : 0;

        const updatedRow = [
          groupData.id,
          groupData.name || data[i][1],
          allocation,
          totalPaid,
          totalPledged,
          remaining,
          progress,
          data[i][7], // paymentCount
          groupData.memberCount !== undefined ? groupData.memberCount : data[i][8],
          groupData.status || data[i][9],
          data[i][10], // createdDate
          data[i][11], // lastPaymentDate
          data[i][12], // lastPaymentAmount
          groupData.notes || data[i][13]
        ];

        sheet.getRange(i + 1, 1, 1, updatedRow.length).setValues([updatedRow]);
        return { success: true, message: 'Group updated successfully' };
      }
    }

    return { success: false, error: 'Group not found' };
  } catch (error) {
    return { success: false, error: error.toString() };
  }
}

function deleteGroup(groupData) {
  try {
    const { fundId, id: groupId } = groupData;
    let deletedPayments = 0;

    // Step 1: Delete all payments for this group from Payments sheet
    const paymentsSheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(SHEETS.PAYMENTS);
    if (paymentsSheet) {
      const paymentData = paymentsSheet.getDataRange().getValues();

      // Delete in reverse order to avoid row shift issues
      for (let i = paymentData.length - 1; i >= 1; i--) {
        if (paymentData[i][2] == groupId) { // Column C (index 2): GroupID
          paymentsSheet.deleteRow(i + 1);
          deletedPayments++;
        }
      }
    }

    // Step 2: Get fund sheet name and delete group row
    const summaryData = getSheetData(SHEETS.FUNDS_SUMMARY);
    const fundSummary = summaryData.find(f => f.FundID == fundId);

    if (!fundSummary) {
      return { success: false, error: 'Fund not found' };
    }

    const fundSheetName = fundSummary.SheetName;
    const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(fundSheetName);
    if (!sheet) return { success: false, error: 'Fund sheet not found' };

    const data = sheet.getDataRange().getValues();

    for (let i = 1; i < data.length; i++) {
      if (data[i][0] == groupId) {
        sheet.deleteRow(i + 1);

        // Update total groups count
        updateFundGroupCount(fundId);

        return {
          success: true,
          message: 'Group deleted successfully',
          deletedPayments: deletedPayments
        };
      }
    }

    return { success: false, error: 'Group not found' };
  } catch (error) {
    return { success: false, error: error.toString() };
  }
}

function updateFundGroupCount(fundId) {
  try {
    const summarySheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(SHEETS.FUNDS_SUMMARY);
    const summaryData = summarySheet.getDataRange().getValues();

    for (let i = 1; i < summaryData.length; i++) {
      if (summaryData[i][0] == fundId) {
        const fundSheetName = summaryData[i][9];
        const fundSheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(fundSheetName);

        if (fundSheet) {
          const groupCount = fundSheet.getLastRow() - 1; // Subtract header row
          summarySheet.getRange(i + 1, 7).setValue(groupCount);
        }
        break;
      }
    }
  } catch (error) {
    console.error('Error updating group count:', error);
  }
}

// === PAYMENT MANAGEMENT ===

function getPayments() {
  try {
    const data = getSheetData(SHEETS.PAYMENTS);
    return { success: true, data: data };
  } catch (error) {
    return { success: false, error: error.toString() };
  }
}

function recordPayment(paymentData) {
  try {
    const paymentsSheet = createSheet(SHEETS.PAYMENTS);

    // Anti-duplication check
    const data = paymentsSheet.getDataRange().getValues();
    for (let i = 1; i < data.length; i++) {
      if (data[i][0] == paymentData.id) {
        console.log(`Payment ID ${paymentData.id} already exists, skipping duplicate`);
        return { success: true, message: 'Payment already exists', action: 'skipped' };
      }
    }

    if (!paymentData.id) {
      return { success: false, error: 'Payment data must have a valid ID' };
    }

    // Add payment to centralized sheet
    const isPledge = paymentData.isPledge || false;
    const row = [
      paymentData.id,
      paymentData.fundId,
      paymentData.fundName,
      paymentData.groupId,
      paymentData.groupName,
      paymentData.amount,
      isPledge,
      paymentData.date,
      paymentData.payerName || '',
      paymentData.paymentMethod || 'cash',
      paymentData.referenceNumber || '',
      paymentData.note || '',
      new Date().toISOString()
    ];

    paymentsSheet.appendRow(row);

    // Update group totals in fund sheet
    updateGroupPaymentTotals(paymentData.fundId, paymentData.groupId, paymentData.amount, isPledge);

    // Update fund totals in summary (only if not a pledge)
    if (!isPledge) {
      updateFundTotals(paymentData.fundId, paymentData.amount);
    }

    return { success: true, message: 'Payment recorded successfully' };
  } catch (error) {
    return { success: false, error: error.toString() };
  }
}

function deletePayment(paymentData) {
  try {
    const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(SHEETS.PAYMENTS);
    if (!sheet) return { success: false, error: 'Payments sheet not found' };

    const data = sheet.getDataRange().getValues();

    for (let i = 1; i < data.length; i++) {
      if (data[i][0] == paymentData.id) {
        const fundId = data[i][1];
        const groupId = data[i][3];
        const amount = parseFloat(data[i][5]) || 0;
        const isPledge = data[i][6] || false;

        sheet.deleteRow(i + 1);

        // Update totals (subtract amount)
        updateGroupPaymentTotals(fundId, groupId, -amount, isPledge);

        // Update fund totals only if not a pledge
        if (!isPledge) {
          updateFundTotals(fundId, -amount);
        }

        return { success: true, message: 'Payment deleted successfully' };
      }
    }

    return { success: false, error: 'Payment not found' };
  } catch (error) {
    return { success: false, error: error.toString() };
  }
}

function updateGroupPaymentTotals(fundId, groupId, amountChange, isPledge) {
  try {
    const summaryData = getSheetData(SHEETS.FUNDS_SUMMARY);
    const fundSummary = summaryData.find(f => f.FundID == fundId);

    if (!fundSummary) return;

    const fundSheetName = fundSummary.SheetName;
    const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(fundSheetName);
    if (!sheet) return;

    const data = sheet.getDataRange().getValues();

    for (let i = 1; i < data.length; i++) {
      if (data[i][0] == groupId) {
        const allocation = parseFloat(data[i][2]) || 0;
        const currentPaid = parseFloat(data[i][3]) || 0;
        const currentPledged = parseFloat(data[i][4]) || 0;

        // Update paid or pledged based on type
        const newPaid = isPledge ? currentPaid : currentPaid + amountChange;
        const newPledged = isPledge ? currentPledged + amountChange : currentPledged;

        // Remaining is based only on paid amounts, not pledges
        const remaining = allocation - newPaid;
        const progress = allocation > 0 ? (newPaid / allocation * 100).toFixed(1) : 0;
        const paymentCount = (parseInt(data[i][7]) || 0) + (amountChange > 0 ? 1 : -1);

        // Update totals
        sheet.getRange(i + 1, 4).setValue(newPaid); // TotalPaid
        sheet.getRange(i + 1, 5).setValue(newPledged); // TotalPledged
        sheet.getRange(i + 1, 6).setValue(remaining); // Remaining
        sheet.getRange(i + 1, 7).setValue(progress); // Progress%
        sheet.getRange(i + 1, 8).setValue(Math.max(0, paymentCount)); // PaymentCount
        sheet.getRange(i + 1, 12).setValue(new Date().toISOString()); // LastPaymentDate
        sheet.getRange(i + 1, 13).setValue(Math.abs(amountChange)); // LastPaymentAmount

        break;
      }
    }
  } catch (error) {
    console.error('Error updating group payment totals:', error);
  }
}

function updateFundTotals(fundId, amountChange) {
  try {
    const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(SHEETS.FUNDS_SUMMARY);
    if (!sheet) return;

    const data = sheet.getDataRange().getValues();

    for (let i = 1; i < data.length; i++) {
      if (data[i][0] == fundId) {
        const currentTotal = parseFloat(data[i][5]) || 0;
        const newTotal = currentTotal + amountChange;

        sheet.getRange(i + 1, 6).setValue(newTotal); // TotalCollected
        break;
      }
    }
  } catch (error) {
    console.error('Error updating fund totals:', error);
  }
}

// === EXPENSE MANAGEMENT ===

function getExpenses(startDate, endDate) {
  try {
    let data = getSheetData(SHEETS.EXPENSES);

    // Filter by date range if provided
    if (startDate || endDate) {
      data = data.filter(expense => {
        const expenseDate = new Date(expense.Date);
        if (startDate && expenseDate < new Date(startDate)) return false;
        if (endDate && expenseDate > new Date(endDate)) return false;
        return true;
      });
    }

    return { success: true, data: data };
  } catch (error) {
    return { success: false, error: error.toString() };
  }
}

function addExpense(expenseData) {
  try {
    const sheet = createSheet(SHEETS.EXPENSES);

    // Anti-duplication check
    const data = sheet.getDataRange().getValues();
    for (let i = 1; i < data.length; i++) {
      if (data[i][0] == expenseData.id) {
        console.log(`Expense ID ${expenseData.id} already exists, skipping duplicate`);
        return { success: true, message: 'Expense already exists', action: 'skipped' };
      }
    }

    if (!expenseData.id) {
      return { success: false, error: 'Expense data must have a valid ID' };
    }

    const row = [
      expenseData.id,
      expenseData.date,
      expenseData.category || 'other',
      parseFloat(expenseData.amount) || 0,
      expenseData.description,
      expenseData.paymentMethod || 'cash',
      expenseData.vendor || '',
      expenseData.notes || '',
      new Date().toISOString()
    ];

    sheet.appendRow(row);
    return { success: true, message: 'Expense added successfully' };
  } catch (error) {
    return { success: false, error: error.toString() };
  }
}

function updateExpense(expenseData) {
  try {
    const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(SHEETS.EXPENSES);
    if (!sheet) return { success: false, error: 'Expenses sheet not found' };

    const data = sheet.getDataRange().getValues();

    for (let i = 1; i < data.length; i++) {
      if (data[i][0] == expenseData.id) {
        const updatedRow = [
          expenseData.id,
          expenseData.date || data[i][1],
          expenseData.category || data[i][2],
          parseFloat(expenseData.amount) || data[i][3],
          expenseData.description || data[i][4],
          expenseData.paymentMethod || data[i][5],
          expenseData.vendor || data[i][6],
          expenseData.notes || data[i][7],
          data[i][8] // Keep original created date
        ];

        sheet.getRange(i + 1, 1, 1, updatedRow.length).setValues([updatedRow]);
        return { success: true, message: 'Expense updated successfully' };
      }
    }

    return { success: false, error: 'Expense not found' };
  } catch (error) {
    return { success: false, error: error.toString() };
  }
}

function deleteExpense(expenseData) {
  try {
    const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(SHEETS.EXPENSES);
    if (!sheet) return { success: false, error: 'Expenses sheet not found' };

    const data = sheet.getDataRange().getValues();

    for (let i = 1; i < data.length; i++) {
      if (data[i][0] == expenseData.id) {
        sheet.deleteRow(i + 1);
        return { success: true, message: 'Expense deleted successfully' };
      }
    }

    return { success: false, error: 'Expense not found' };
  } catch (error) {
    return { success: false, error: error.toString() };
  }
}

// === SETTINGS FUNCTIONS ===

function getSettings() {
  try {
    const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(SHEETS.SETTINGS);
    if (!sheet) {
      return { success: true, data: {} };
    }

    const data = sheet.getDataRange().getValues();
    const settings = {};

    for (let i = 1; i < data.length; i++) {
      settings[data[i][0]] = data[i][1];
    }

    return { success: true, data: settings };
  } catch (error) {
    return { success: false, error: error.toString() };
  }
}

function updateSettings(settings) {
  try {
    const sheet = createSheet(SHEETS.SETTINGS, ['Key', 'Value']);

    // Clear existing data (except headers)
    const lastRow = sheet.getLastRow();
    if (lastRow > 1) {
      sheet.deleteRows(2, lastRow - 1);
    }

    // Add settings
    Object.entries(settings).forEach(([key, value]) => {
      sheet.appendRow([key, value]);
    });

    // Add last sync timestamp
    sheet.appendRow(['lastSync', new Date().toISOString()]);

    return { success: true, message: 'Settings updated successfully' };
  } catch (error) {
    return { success: false, error: error.toString() };
  }
}

// === SYNC FUNCTIONS ===

function syncAllData(payload) {
  try {
    console.log('🔄 syncAllData function called');

    if (!payload || typeof payload !== 'object') {
      return {
        success: false,
        error: 'Invalid payload - expected object with data arrays',
        timestamp: new Date().toISOString()
      };
    }

    const results = {
      processed: 0,
      errors: [],
      details: {}
    };

    // Process Funds
    if (payload.funds && Array.isArray(payload.funds)) {
      console.log(`📦 Processing ${payload.funds.length} funds...`);
      let fundCount = 0;
      let fundErrors = [];

      payload.funds.forEach(fund => {
        try {
          const fundResult = addFund(fund);
          if (fundResult.success) {
            fundCount++;
          } else {
            fundErrors.push(`Fund ${fund.id || 'unknown'}: ${fundResult.error}`);
          }
        } catch (error) {
          fundErrors.push(`Fund ${fund.id || 'unknown'}: ${error.toString()}`);
        }
      });

      results.details.funds = { processed: fundCount, errors: fundErrors };
      results.processed += fundCount;
      results.errors = results.errors.concat(fundErrors);
    }

    // Process Groups
    if (payload.groups && Array.isArray(payload.groups)) {
      console.log(`👥 Processing ${payload.groups.length} groups...`);
      let groupCount = 0;
      let groupErrors = [];

      payload.groups.forEach(group => {
        try {
          const groupResult = addGroup(group);
          if (groupResult.success) {
            groupCount++;
          } else {
            groupErrors.push(`Group ${group.id || 'unknown'}: ${groupResult.error}`);
          }
        } catch (error) {
          groupErrors.push(`Group ${group.id || 'unknown'}: ${error.toString()}`);
        }
      });

      results.details.groups = { processed: groupCount, errors: groupErrors };
      results.processed += groupCount;
      results.errors = results.errors.concat(groupErrors);
    }

    // Process Payments
    if (payload.payments && Array.isArray(payload.payments)) {
      console.log(`💰 Processing ${payload.payments.length} payments...`);
      let paymentCount = 0;
      let paymentErrors = [];

      payload.payments.forEach(payment => {
        try {
          const paymentResult = recordPayment(payment);
          if (paymentResult.success) {
            paymentCount++;
          } else {
            paymentErrors.push(`Payment ${payment.id || 'unknown'}: ${paymentResult.error}`);
          }
        } catch (error) {
          paymentErrors.push(`Payment ${payment.id || 'unknown'}: ${error.toString()}`);
        }
      });

      results.details.payments = { processed: paymentCount, errors: paymentErrors };
      results.processed += paymentCount;
      results.errors = results.errors.concat(paymentErrors);
    }

    // Process Expenses
    if (payload.expenses && Array.isArray(payload.expenses)) {
      console.log(`💸 Processing ${payload.expenses.length} expenses...`);
      let expenseCount = 0;
      let expenseErrors = [];

      payload.expenses.forEach(expense => {
        try {
          const expenseResult = addExpense(expense);
          if (expenseResult.success) {
            expenseCount++;
          } else {
            expenseErrors.push(`Expense ${expense.id || 'unknown'}: ${expenseResult.error}`);
          }
        } catch (error) {
          expenseErrors.push(`Expense ${expense.id || 'unknown'}: ${error.toString()}`);
        }
      });

      results.details.expenses = { processed: expenseCount, errors: expenseErrors };
      results.processed += expenseCount;
      results.errors = results.errors.concat(expenseErrors);
    }

    const totalErrors = results.errors.length;
    const successRate = results.processed > 0 ? ((results.processed - totalErrors) / results.processed * 100).toFixed(1) : 0;

    console.log(`✅ syncAllData completed: ${results.processed} records processed, ${totalErrors} errors`);

    return {
      success: totalErrors === 0,
      message: totalErrors === 0 ?
        `Successfully synced ${results.processed} records` :
        `Synced ${results.processed - totalErrors}/${results.processed} records with ${totalErrors} errors`,
      totalProcessed: results.processed,
      totalErrors: totalErrors,
      successRate: parseFloat(successRate),
      details: results.details,
      timestamp: new Date().toISOString()
    };

  } catch (error) {
    console.error('❌ syncAllData failed:', error);
    return {
      success: false,
      error: `Sync failed: ${error.toString()}`,
      timestamp: new Date().toISOString()
    };
  }
}

function getAllData() {
  try {
    const data = {};

    // Get all funds with their groups - with field mapping
    const rawFunds = getSheetData(SHEETS.FUNDS_SUMMARY);
    data.funds = rawFunds.map(fund => ({
      id: fund.FundID,
      name: fund.FundName,
      type: fund.Type,
      description: fund.Description || '',
      totalGoal: fund.TotalGoal || 0,
      totalCollected: fund.TotalCollected || 0,
      createdAt: fund.CreatedDate ? new Date(fund.CreatedDate).getTime() : Date.now(),
      updatedAt: Date.now()
    }));

    // Get all groups from each fund sheet - with field mapping
    const allGroups = [];
    rawFunds.forEach(fund => {
      if (fund.SheetName) {
        const rawGroups = getSheetData(fund.SheetName);
        const mappedGroups = rawGroups.map(group => ({
          id: group.GroupID,
          fundId: fund.FundID,
          name: group.GroupName,
          allocation: group.Allocation || null,
          totalPaid: group.TotalPaid || 0,
          totalPledged: group.TotalPledged || 0,
          includeInDivision: true,
          createdAt: group.CreatedDate ? new Date(group.CreatedDate).getTime() : Date.now(),
          updatedAt: Date.now()
        }));
        allGroups.push(...mappedGroups);
      }
    });
    data.groups = allGroups;

    // Get payments - with field mapping
    const rawPayments = getSheetData(SHEETS.PAYMENTS);
    data.payments = rawPayments.map(payment => ({
      id: payment.PaymentID,
      fundId: payment.FundID,
      groupId: payment.GroupID,
      amount: payment.Amount || 0,
      isPledge: payment.IsPledge || false,
      date: payment.Date || new Date().toISOString().split('T')[0],
      payerName: payment.PayerName || '',
      paymentMethod: payment.PaymentMethod || '',
      referenceNumber: payment.ReferenceNumber || '',
      note: payment.Notes || '',
      createdAt: payment.CreatedDate ? new Date(payment.CreatedDate).getTime() : Date.now()
    }));

    // Get expenses - with field mapping
    const rawExpenses = getSheetData(SHEETS.EXPENSES);
    data.expenses = rawExpenses.map(expense => ({
      id: expense.ExpenseID,
      date: expense.Date || new Date().toISOString().split('T')[0],
      category: expense.Category || 'other',
      amount: expense.Amount || 0,
      description: expense.Description || '',
      paymentMethod: expense.PaymentMethod || '',
      vendor: expense.Vendor || '',
      note: expense.Notes || '',
      createdAt: expense.CreatedDate ? new Date(expense.CreatedDate).getTime() : Date.now()
    }));

    data.settings = getSettings().data || {};

    return { success: true, data: data };
  } catch (error) {
    return { success: false, error: error.toString() };
  }
}
