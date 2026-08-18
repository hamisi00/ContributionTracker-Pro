// ContributionTracker Pro - Utility Modules
// Helper functions and utilities used throughout the app

const Utils = {
    /**
     * Generate sequential Fund ID (FND-0001, FND-0002, etc.)
     * @returns {Promise<string>} Sequential Fund ID
     */
    async generateFundId() {
        const counter = await DB.getAndIncrementCounter('fund');
        return `FND-${String(counter).padStart(4, '0')}`;
    },

    /**
     * Generate sequential Group ID (GRP-0001, GRP-0002, etc.)
     * @returns {Promise<string>} Sequential Group ID
     */
    async generateGroupId() {
        const counter = await DB.getAndIncrementCounter('group');
        return `GRP-${String(counter).padStart(4, '0')}`;
    },

    /**
     * Generate sequential Payment ID (PAY-0001, PAY-0002, etc.)
     * @returns {Promise<string>} Sequential Payment ID
     */
    async generatePaymentId() {
        const counter = await DB.getAndIncrementCounter('payment');
        return `PAY-${String(counter).padStart(4, '0')}`;
    },

    /**
     * Generate sequential Expense ID (EXP-0001, EXP-0002, etc.)
     * @returns {Promise<string>} Sequential Expense ID
     */
    async generateExpenseId() {
        const counter = await DB.getAndIncrementCounter('expense');
        return `EXP-${String(counter).padStart(4, '0')}`;
    },

    /**
     * Generate sequential Pledge ID (PLG-0001, PLG-0002, etc.)
     * @returns {Promise<string>} Sequential Pledge ID
     */
    async generatePledgeId() {
        const counter = await DB.getAndIncrementCounter('pledge');
        return `PLG-${String(counter).padStart(4, '0')}`;
    },

    /**
     * @deprecated Use specific ID generators instead (generateFundId, etc.)
     * Generate a unique UUID - kept for backward compatibility
     * @returns {string} UUID string
     */
    generateUUID() {
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
            const r = Math.random() * 16 | 0;
            const v = c === 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
        });
    },

    /**
     * Format a number as currency
     * @param {number} amount - The amount to format
     * @param {string} currency - Currency symbol (default: Ksh )
     * @returns {string} Formatted currency string
     */
    formatCurrency(amount, currency = 'Ksh ') {
        if (amount === null || amount === undefined) return `${currency}0.00`;
        return `${currency}${parseFloat(amount).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`;
    },

    /**
     * Format a date
     * @param {Date|string|number} date - Date to format
     * @param {string} format - Format type ('short', 'long', 'iso')
     * @returns {string} Formatted date string
     */
    formatDate(date, format = 'short') {
        if (!date) return '';
        const d = new Date(date);

        if (isNaN(d.getTime())) return '';

        switch (format) {
            case 'short':
                return d.toLocaleDateString();
            case 'long':
                return d.toLocaleDateString('en-US', {
                    weekday: 'long',
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric'
                });
            case 'iso':
                return d.toISOString().split('T')[0];
            case 'datetime':
                return d.toLocaleString();
            default:
                return d.toLocaleDateString();
        }
    },

    /**
     * Calculate percentage
     * @param {number} part - Part value
     * @param {number} total - Total value
     * @returns {number} Percentage (can exceed 100%)
     */
    calculatePercentage(part, total) {
        if (!total || total === 0) return 0;
        return Math.round((part / total) * 100);
    },

    /**
     * Debounce function
     * @param {Function} func - Function to debounce
     * @param {number} wait - Wait time in milliseconds
     * @returns {Function} Debounced function
     */
    debounce(func, wait = 300) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    },

    /**
     * Validate email format
     * @param {string} email - Email to validate
     * @returns {boolean} True if valid
     */
    isValidEmail(email) {
        const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return re.test(email);
    },

    /**
     * Truncate text
     * @param {string} text - Text to truncate
     * @param {number} length - Max length
     * @returns {string} Truncated text
     */
    truncate(text, length = 50) {
        if (!text) return '';
        if (text.length <= length) return text;
        return text.substring(0, length) + '...';
    },

    /**
     * Deep clone an object
     * @param {Object} obj - Object to clone
     * @returns {Object} Cloned object
     */
    deepClone(obj) {
        return JSON.parse(JSON.stringify(obj));
    },

    /**
     * Sort array of objects by property
     * @param {Array} array - Array to sort
     * @param {string} property - Property to sort by
     * @param {string} order - 'asc' or 'desc'
     * @returns {Array} Sorted array
     */
    sortBy(array, property, order = 'asc') {
        return [...array].sort((a, b) => {
            const aVal = a[property];
            const bVal = b[property];

            if (aVal < bVal) return order === 'asc' ? -1 : 1;
            if (aVal > bVal) return order === 'asc' ? 1 : -1;
            return 0;
        });
    },

    /**
     * Export data to CSV
     * @param {Array} data - Array of objects to export
     * @param {string} filename - Filename for download
     * @param {Object} options - Export options {title, metadata, notes}
     */
    exportToCSV(data, filename = 'export.csv', options = {}) {
        if (!data || data.length === 0) {
            console.warn('No data to export');
            return;
        }

        let csv = '';

        // Add title and metadata comments
        if (options.title) {
            csv += `# ${options.title}\n`;
        }
        if (options.metadata) {
            csv += `# Exported on: ${new Date().toLocaleString()}\n`;
            if (options.metadata.dateRange) {
                csv += `# Date Range: ${options.metadata.dateRange.from} to ${options.metadata.dateRange.to}\n`;
            }
            if (options.metadata.totalRecords) {
                csv += `# Total Records: ${options.metadata.totalRecords}\n`;
            }
        }
        if (options.notes) {
            csv += `# Notes: ${options.notes}\n`;
        }
        if (options.title || options.metadata || options.notes) {
            csv += '\n';
        }

        // Get headers from first object
        const headers = Object.keys(data[0]);

        // Create CSV headers with proper formatting
        csv += headers.map(h => h.charAt(0).toUpperCase() + h.slice(1).replace(/([A-Z])/g, ' $1')).join(',') + '\n';

        // Add data rows
        data.forEach(row => {
            const values = headers.map(header => {
                let val = row[header];
                if (val === null || val === undefined) {
                    return '';
                }
                // Handle dates
                if (header.includes('Date') || header.includes('date')) {
                    val = this.formatDate(val);
                }
                // Handle currency
                if (header.includes('amount') || header.includes('Amount') || header.includes('paid') || header.includes('allocation') || header.includes('goal')) {
                    val = typeof val === 'number' ? this.formatCurrency(val) : val;
                }
                // Escape quotes and wrap in quotes if contains comma or quotes
                val = String(val);
                if (val.includes(',') || val.includes('"') || val.includes('\n')) {
                    val = '"' + val.replace(/"/g, '""') + '"';
                }
                return val;
            });
            csv += values.join(',') + '\n';
        });

        // Create download link
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();
        window.URL.revokeObjectURL(url);
    },

    /**
     * Generate professional PDF HTML content
     * @param {Object} options - PDF options {title, subtitle, sections, metadata, notes}
     * @returns {string} HTML content for PDF
     */
    generatePDFHTML(options) {
        const { title, subtitle, sections, metadata, notes } = options;

        let html = `
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="UTF-8">
                <title>${title || 'Export Report'}</title>
                <style>
                    * { margin: 0; padding: 0; box-sizing: border-box; }
                    body {
                        font-family: Arial, sans-serif;
                        margin: 40px;
                        color: #333;
                        line-height: 1.6;
                    }
                    .pdf-header {
                        text-align: center;
                        border-bottom: 3px solid #667eea;
                        padding-bottom: 20px;
                        margin-bottom: 30px;
                    }
                    .pdf-header h1 {
                        color: #667eea;
                        margin: 0 0 10px 0;
                        font-size: 32px;
                    }
                    .pdf-header h2 {
                        color: #764ba2;
                        margin: 0;
                        font-size: 20px;
                        font-weight: 500;
                    }
                    .pdf-metadata {
                        text-align: center;
                        font-size: 14px;
                        color: #666;
                        margin-top: 10px;
                    }
                    .pdf-notes {
                        background: #f8f9ff;
                        padding: 15px;
                        border-radius: 8px;
                        margin: 20px 0;
                        border-left: 4px solid #667eea;
                    }
                    .pdf-section {
                        margin-bottom: 40px;
                        page-break-inside: avoid;
                    }
                    .pdf-section h3 {
                        color: #764ba2;
                        border-bottom: 2px solid #e2e8f0;
                        padding-bottom: 8px;
                        margin-bottom: 15px;
                        font-size: 18px;
                    }
                    table {
                        width: 100%;
                        border-collapse: collapse;
                        margin-bottom: 20px;
                    }
                    th, td {
                        padding: 10px;
                        text-align: left;
                        border-bottom: 1px solid #e2e8f0;
                    }
                    th {
                        background-color: #f8f9ff;
                        font-weight: 600;
                        color: #374151;
                    }
                    tr:hover { background-color: #fafafa; }
                    .summary-grid {
                        display: grid;
                        grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
                        gap: 15px;
                        margin-bottom: 30px;
                    }
                    .summary-card {
                        background: #f8f9ff;
                        padding: 15px;
                        border-radius: 8px;
                        border-left: 4px solid #667eea;
                    }
                    .summary-label {
                        font-size: 12px;
                        color: #666;
                        margin-bottom: 5px;
                    }
                    .summary-value {
                        font-size: 24px;
                        font-weight: 700;
                        color: #667eea;
                    }
                    .footer {
                        margin-top: 40px;
                        padding-top: 20px;
                        border-top: 1px solid #e2e8f0;
                        font-size: 12px;
                        color: #666;
                        text-align: center;
                    }
                    @media print {
                        body { margin: 20px; }
                        .pdf-section { page-break-inside: avoid; }
                        table { page-break-inside: auto; }
                        tr { page-break-inside: avoid; }
                    }
                </style>
            </head>
            <body class="pdf-export-content">
                <div class="pdf-header">
                    <h1>💰 ${this.sanitizeHTML(title || 'Export Report')}</h1>
                    ${subtitle ? `<h2>${this.sanitizeHTML(subtitle)}</h2>` : ''}
                    <div class="pdf-metadata">Generated on ${new Date().toLocaleString()}</div>
                </div>
        `;

        if (notes) {
            html += `<div class="pdf-notes"><strong>Notes:</strong> ${this.sanitizeHTML(notes)}</div>`;
        }

        // Add sections
        if (sections) {
            sections.forEach(section => {
                html += `<div class="pdf-section">`;

                if (section.title) {
                    html += `<h3>${this.sanitizeHTML(section.title)}</h3>`;
                }

                // Add summary cards if present
                if (section.summary) {
                    html += '<div class="summary-grid">';
                    section.summary.forEach(item => {
                        html += `
                            <div class="summary-card">
                                <div class="summary-label">${this.sanitizeHTML(item.label)}</div>
                                <div class="summary-value">${this.sanitizeHTML(item.value)}</div>
                            </div>
                        `;
                    });
                    html += '</div>';
                }

                // Add table if present
                if (section.data && section.data.length > 0) {
                    const headers = section.columns || Object.keys(section.data[0]);

                    html += '<table><thead><tr>';
                    headers.forEach(header => {
                        const label = typeof header === 'string' ?
                            header.charAt(0).toUpperCase() + header.slice(1).replace(/([A-Z])/g, ' $1') :
                            header.label;
                        html += `<th>${this.sanitizeHTML(label)}</th>`;
                    });
                    html += '</tr></thead><tbody>';

                    section.data.forEach(row => {
                        html += '<tr>';
                        headers.forEach(header => {
                            const key = typeof header === 'string' ? header : header.key;
                            let value = row[key];

                            if (value === null || value === undefined) value = '-';
                            if (typeof value === 'boolean') value = value ? 'Yes' : 'No';
                            if (key.includes('Date') || key.includes('date')) {
                                value = value !== '-' ? this.formatDate(value) : '-';
                            }
                            if (key.includes('amount') || key.includes('Amount') || key.includes('paid') || key.includes('allocation') || key.includes('goal')) {
                                value = typeof value === 'number' ? this.formatCurrency(value) : value;
                            }

                            html += `<td>${this.sanitizeHTML(String(value))}</td>`;
                        });
                        html += '</tr>';
                    });

                    html += '</tbody></table>';
                }

                html += '</div>';
            });
        }

        if (metadata) {
            html += '<div class="footer">';
            html += '<p>This report was generated by ContributionTracker Pro.</p>';
            if (metadata.recordCount) {
                html += `<p>Total records: ${metadata.recordCount}</p>`;
            }
            html += '</div>';
        }

        html += '</body></html>';
        return html;
    },

    /**
     * Open PDF in new window for printing/saving
     * @param {string} htmlContent - HTML content for PDF
     */
    openPDFWindow(htmlContent) {
        const printWindow = window.open('', '_blank');
        if (!printWindow) {
            Toast.error('Please allow popups to generate PDF');
            return;
        }
        printWindow.document.write(htmlContent);
        printWindow.document.close();

        // Auto-trigger print dialog after content loads
        printWindow.onload = () => {
            setTimeout(() => {
                printWindow.print();
            }, 250);
        };
    },

    /**
     * Export data to JSON
     * @param {Object|Array} data - Data to export
     * @param {string} filename - Filename for download
     */
    exportToJSON(data, filename = 'export.json') {
        const json = JSON.stringify(data, null, 2);
        const blob = new Blob([json], { type: 'application/json' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();
        window.URL.revokeObjectURL(url);
    },

    /**
     * Get current timestamp
     * @returns {number} Current timestamp
     */
    now() {
        return Date.now();
    },

    /**
     * Check if date is today
     * @param {Date|string|number} date - Date to check
     * @returns {boolean} True if today
     */
    isToday(date) {
        const d = new Date(date);
        const today = new Date();
        return d.toDateString() === today.toDateString();
    },

    /**
     * Get relative time string (e.g., "2 days ago")
     * @param {Date|string|number} date - Date to format
     * @returns {string} Relative time string
     */
    getRelativeTime(date) {
        const d = new Date(date);
        const now = new Date();
        const diff = now - d;
        const seconds = Math.floor(diff / 1000);
        const minutes = Math.floor(seconds / 60);
        const hours = Math.floor(minutes / 60);
        const days = Math.floor(hours / 24);
        const months = Math.floor(days / 30);
        const years = Math.floor(days / 365);

        if (seconds < 60) return 'just now';
        if (minutes < 60) return `${minutes} minute${minutes > 1 ? 's' : ''} ago`;
        if (hours < 24) return `${hours} hour${hours > 1 ? 's' : ''} ago`;
        if (days < 30) return `${days} day${days > 1 ? 's' : ''} ago`;
        if (months < 12) return `${months} month${months > 1 ? 's' : ''} ago`;
        return `${years} year${years > 1 ? 's' : ''} ago`;
    },

    /**
     * Sanitize HTML to prevent XSS
     * @param {string} text - Text to sanitize
     * @returns {string} Sanitized text
     */
    sanitizeHTML(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    },

    /**
     * Get query parameter from URL
     * @param {string} param - Parameter name
     * @returns {string|null} Parameter value
     */
    getQueryParam(param) {
        const urlParams = new URLSearchParams(window.location.search);
        return urlParams.get(param);
    },

    /**
     * Local storage with JSON support
     */
    storage: {
        set(key, value) {
            try {
                localStorage.setItem(key, JSON.stringify(value));
                return true;
            } catch (e) {
                console.error('Storage error:', e);
                return false;
            }
        },

        get(key, defaultValue = null) {
            try {
                const item = localStorage.getItem(key);
                if (!item) return defaultValue;

                // Try to parse as JSON first
                try {
                    return JSON.parse(item);
                } catch (parseError) {
                    // If JSON parse fails, return as plain string
                    // This handles legacy values stored without JSON.stringify()
                    return item;
                }
            } catch (e) {
                console.error('Storage error:', e);
                return defaultValue;
            }
        },

        remove(key) {
            localStorage.removeItem(key);
        },

        clear() {
            localStorage.clear();
        }
    }
};

// Toast Notification System
const Toast = {
    container: null,

    /**
     * Initialize toast container
     */
    init() {
        this.container = document.getElementById('toastContainer');
        if (!this.container) {
            this.container = document.createElement('div');
            this.container.id = 'toastContainer';
            this.container.className = 'toast-container';
            document.body.appendChild(this.container);
        }
    },

    /**
     * Show a toast notification
     * @param {string} message - Message to display
     * @param {string} type - Toast type ('success', 'error', 'warning', 'info')
     * @param {number} duration - Duration in milliseconds (0 = permanent)
     */
    show(message, type = 'info', duration = 3000) {
        if (!this.container) this.init();

        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;

        // Icon based on type
        const icons = {
            success: '✓',
            error: '✗',
            warning: '⚠',
            info: 'ℹ'
        };

        toast.innerHTML = `
            <span style="font-size: 1.25rem; font-weight: bold;">${icons[type] || icons.info}</span>
            <span style="flex: 1;">${Utils.sanitizeHTML(message)}</span>
            <button onclick="this.parentElement.remove()" style="background: none; border: none; cursor: pointer; font-size: 1.25rem; color: var(--text-secondary);">&times;</button>
        `;

        this.container.appendChild(toast);

        // Auto remove after duration
        if (duration > 0) {
            setTimeout(() => {
                toast.style.opacity = '0';
                toast.style.transform = 'translateX(400px)';
                setTimeout(() => toast.remove(), 300);
            }, duration);
        }
    },

    success(message, duration) {
        this.show(message, 'success', duration);
    },

    error(message, duration) {
        this.show(message, 'error', duration);
    },

    warning(message, duration) {
        this.show(message, 'warning', duration);
    },

    info(message, duration) {
        this.show(message, 'info', duration);
    }
};

// Loading Overlay
const Loading = {
    overlay: null,

    init() {
        this.overlay = document.getElementById('loadingOverlay');
        if (!this.overlay) {
            this.overlay = document.createElement('div');
            this.overlay.id = 'loadingOverlay';
            this.overlay.className = 'loading-overlay hidden';
            this.overlay.innerHTML = '<div class="spinner"></div>';
            document.body.appendChild(this.overlay);
        }
    },

    show() {
        if (!this.overlay) this.init();
        this.overlay.classList.remove('hidden');
    },

    hide() {
        if (this.overlay) {
            this.overlay.classList.add('hidden');
        }
    }
};

// Universal Modal System
const Modal = {
    currentModal: null,

    /**
     * Show a modal with dynamic content
     * @param {Object} options - Modal configuration
     * @param {string} options.title - Modal title
     * @param {string} options.content - Modal body HTML content
     * @param {Array} options.buttons - Array of button objects
     * @param {string} options.size - 'small', 'medium', 'large' (default: 'medium')
     * @param {boolean} options.closeOnOverlay - Close on overlay click (default: true)
     */
    show(options) {
        const {
            title = '',
            content = '',
            buttons = [],
            size = 'medium',
            closeOnOverlay = true
        } = options;

        // Remove existing modal if any
        this.close();

        // Create modal overlay
        const overlay = document.createElement('div');
        overlay.className = 'modal-overlay';
        overlay.id = 'universalModal';

        // Determine size class
        let sizeClass = '';
        if (size === 'small') sizeClass = 'modal-small';
        if (size === 'large') sizeClass = 'modal-large';

        // Build buttons HTML
        const buttonsHTML = buttons.map((btn, index) => {
            const btnClass = btn.className || 'btn btn-outline';
            const btnId = `modalBtn${index}`;
            return `<button class="${btnClass}" id="${btnId}">${btn.text}</button>`;
        }).join('');

        overlay.innerHTML = `
            <div class="modal-content ${sizeClass}">
                <div class="modal-header">
                    <h3>${Utils.sanitizeHTML(title)}</h3>
                    <button class="modal-close" id="modalCloseBtn">&times;</button>
                </div>
                <div class="modal-body">
                    ${content}
                </div>
                ${buttonsHTML ? `<div class="modal-footer">${buttonsHTML}</div>` : ''}
            </div>
        `;

        document.body.appendChild(overlay);
        this.currentModal = overlay;

        // Trigger animation
        setTimeout(() => {
            overlay.classList.add('active');
        }, 10);

        // Prevent body scroll
        document.body.style.overflow = 'hidden';

        // Add close button handler
        document.getElementById('modalCloseBtn').onclick = () => this.close();

        // Add button handlers
        buttons.forEach((btn, index) => {
            const btnElement = document.getElementById(`modalBtn${index}`);
            if (btnElement && btn.onClick) {
                btnElement.onclick = () => {
                    const result = btn.onClick();
                    // Auto-close unless explicitly returning false
                    if (result !== false) {
                        this.close();
                    }
                };
            }
        });

        // Overlay click handler
        if (closeOnOverlay) {
            overlay.onclick = (e) => {
                if (e.target === overlay) {
                    this.close();
                }
            };
        }

        return overlay;
    },

    /**
     * Close the current modal
     */
    close() {
        if (this.currentModal) {
            this.currentModal.classList.remove('active');
            setTimeout(() => {
                if (this.currentModal) {
                    this.currentModal.remove();
                    this.currentModal = null;
                }
                document.body.style.overflow = '';
            }, 300);
        }
    },

    /**
     * Show a confirmation dialog
     * @param {string} message - Message to display
     * @param {Function} onConfirm - Callback if confirmed
     * @param {Function} onCancel - Callback if cancelled
     * @param {Object} options - Additional options
     */
    confirm(message, onConfirm, onCancel, options = {}) {
        const {
            title = 'Confirm Action',
            confirmText = 'Confirm',
            cancelText = 'Cancel',
            confirmClass = 'btn btn-danger',
            icon = '⚠️'
        } = options;

        this.show({
            title: title,
            content: `
                <div style="text-align: center;">
                    ${icon ? `<div class="modal-icon warning">${icon}</div>` : ''}
                    <p style="font-size: 1.05rem;">${message}</p>
                </div>
            `,
            size: 'small',
            buttons: [
                {
                    text: cancelText,
                    className: 'btn btn-outline',
                    onClick: () => {
                        if (onCancel) onCancel();
                        return true;
                    }
                },
                {
                    text: confirmText,
                    className: confirmClass,
                    onClick: () => {
                        if (onConfirm) onConfirm();
                        return true;
                    }
                }
            ]
        });
    },

    /**
     * Show an alert dialog
     * @param {string} message - Message to display
     * @param {string} type - 'success', 'warning', 'error', 'info'
     * @param {Function} onClose - Callback when closed
     */
    alert(message, type = 'info', onClose) {
        const icons = {
            success: '✅',
            warning: '⚠️',
            error: '❌',
            info: 'ℹ️'
        };

        const titles = {
            success: 'Success',
            warning: 'Warning',
            error: 'Error',
            info: 'Information'
        };

        this.show({
            title: titles[type] || titles.info,
            content: `
                <div style="text-align: center;">
                    <div class="modal-icon ${type}">${icons[type] || icons.info}</div>
                    <p style="font-size: 1.05rem;">${Utils.sanitizeHTML(message)}</p>
                </div>
            `,
            size: 'small',
            buttons: [
                {
                    text: 'OK',
                    className: 'btn btn-primary',
                    onClick: () => {
                        if (onClose) onClose();
                        return true;
                    }
                }
            ]
        });
    }
};

// Legacy Confirm Dialog (for backwards compatibility)
const Confirm = {
    show(message, onConfirm, onCancel) {
        Modal.confirm(message, onConfirm, onCancel);
    }
};

// Theme Management
const Theme = {
    current: 'light',

    /**
     * Initialize theme from storage
     */
    init() {
        const saved = Utils.storage.get('theme', 'light');
        this.apply(saved);
    },

    /**
     * Apply theme
     * @param {string} theme - 'light' or 'dark'
     */
    apply(theme) {
        this.current = theme;
        document.documentElement.setAttribute('data-theme', theme);
        Utils.storage.set('theme', theme);

        // Update theme buttons
        const lightBtn = document.getElementById('lightThemeBtn');
        const darkBtn = document.getElementById('darkThemeBtn');

        if (lightBtn && darkBtn) {
            lightBtn.classList.toggle('active', theme === 'light');
            darkBtn.classList.toggle('active', theme === 'dark');
        }

        // Update settings display
        const display = document.getElementById('currentThemeDisplay');
        if (display) {
            display.textContent = theme.charAt(0).toUpperCase() + theme.slice(1);
        }
    },

    /**
     * Toggle between light and dark
     */
    toggle() {
        const newTheme = this.current === 'light' ? 'dark' : 'light';
        this.apply(newTheme);
    }
};

// Offline Detection
const Offline = {
    indicator: null,

    init() {
        this.indicator = document.getElementById('offlineIndicator');

        window.addEventListener('online', () => this.hide());
        window.addEventListener('offline', () => this.show());

        // Check initial status
        if (!navigator.onLine) {
            this.show();
        }
    },

    show() {
        if (this.indicator) {
            this.indicator.classList.remove('hidden');
        }
    },

    hide() {
        if (this.indicator) {
            this.indicator.classList.add('hidden');
        }
        Toast.success('You are back online!');

        // Auto-sync with backend if configured
        if (window.ApiService?.config.isConfigured && window.app?.syncWithBackend) {
            console.log('🔄 Device back online - triggering automatic sync...');
            setTimeout(() => {
                window.app.syncWithBackend();
            }, 2000); // Wait 2 seconds before syncing
        }
    },

    isOnline() {
        return navigator.onLine;
    }
};

// Authentication Management
const Auth = {
    currentUser: null,
    SESSION_KEY: 'ct_session',

    /**
     * Initialize authentication
     */
    init() {
        // Set up login form listener
        const loginForm = document.getElementById('loginForm');
        if (loginForm) {
            loginForm.addEventListener('submit', (e) => {
                e.preventDefault();
                this.login();
            });
        }

        // Set up logout button listener
        const logoutBtn = document.getElementById('logoutBtn');
        if (logoutBtn) {
            logoutBtn.addEventListener('click', () => this.logout());
        }

        // Always require login on page load (no session persistence)
        // Clear any existing session
        this.clearSession();
        this.currentUser = null;
        this.showLogin();

        // Note: Session persistence disabled - users must login on each page refresh
    },

    /**
     * Show login screen
     */
    showLogin() {
        const loginContainer = document.getElementById('loginContainer');
        const appContainer = document.getElementById('appContainer');
        if (loginContainer) loginContainer.style.display = 'flex';
        if (appContainer) appContainer.style.display = 'none';
    },

    /**
     * Show app
     */
    showApp() {
        const loginContainer = document.getElementById('loginContainer');
        const appContainer = document.getElementById('appContainer');
        if (loginContainer) loginContainer.style.display = 'none';
        if (appContainer) appContainer.style.display = 'flex';
    },

    /**
     * Login
     */
    async login() {
        const username = document.getElementById('loginUsername').value.trim();
        const password = document.getElementById('loginPassword').value;

        if (!username || !password) {
            Toast.error('Please enter username and password');
            return;
        }

        try {
            Loading.show();
            const user = await DB.authenticateUser(username, password);

            if (user) {
                this.currentUser = user;
                this.setSession(user);
                Toast.success(`Welcome back, ${user.username}!`);
                this.showApp();

                // Initialize app after login
                if (window.App) {
                    await window.App.init();
                }
            } else {
                Toast.error('Invalid username or password');
            }

            Loading.hide();
        } catch (error) {
            console.error('Login error:', error);
            Toast.error('Login failed. Please try again.');
            Loading.hide();
        }
    },

    /**
     * Logout
     */
    async logout() {
        Modal.confirm(
            'Are you sure you want to logout?',
            async () => {
                try {
                    // Use Firebase signOut if available
                    if (window.firebaseAuthModule && window.firebaseAuthModule.signOutUser) {
                        const result = await window.firebaseAuthModule.signOutUser();
                        if (result.success) {
                            Toast.info('You have been logged out');
                            // Redirect to auth page
                            setTimeout(() => {
                                window.location.href = 'auth.html';
                            }, 500);
                        } else {
                            Toast.error('Logout failed: ' + result.error);
                        }
                    } else {
                        // Fallback to legacy logout
                        this.currentUser = null;
                        this.clearSession();
                        this.showLogin();

                        // Clear login form
                        const usernameInput = document.getElementById('loginUsername');
                        const passwordInput = document.getElementById('loginPassword');
                        if (usernameInput) usernameInput.value = '';
                        if (passwordInput) passwordInput.value = '';

                        Toast.info('You have been logged out');
                    }
                } catch (error) {
                    console.error('Logout error:', error);
                    Toast.error('Logout failed');
                }
            },
            null,
            {
                title: 'Confirm Logout',
                confirmText: 'Logout',
                cancelText: 'Cancel',
                confirmClass: 'btn btn-danger',
                icon: '🚪'
            }
        );
    },

    /**
     * Set session in localStorage
     * @param {Object} user - User object
     */
    setSession(user) {
        localStorage.setItem(this.SESSION_KEY, JSON.stringify(user));
    },

    /**
     * Get session from localStorage
     * @returns {Object|null} User object or null
     */
    getSession() {
        const session = localStorage.getItem(this.SESSION_KEY);
        return session ? JSON.parse(session) : null;
    },

    /**
     * Clear session from localStorage
     */
    clearSession() {
        localStorage.removeItem(this.SESSION_KEY);
    },

    /**
     * Check if user is authenticated
     * @returns {boolean}
     */
    isAuthenticated() {
        return this.currentUser !== null;
    },

    /**
     * Get current user
     * @returns {Object|null}
     */
    getCurrentUser() {
        return this.currentUser;
    }
};

// Initialize utilities on load
document.addEventListener('DOMContentLoaded', () => {
    Toast.init();
    Loading.init();
    Theme.init();
    Offline.init();
    Auth.init();
});

console.log('✅ Utils modules loaded');
