let importHistory = [];
let accounts = [];
let activeAccountId = 'acc_default';
let transactions = [];
let categories = [];
let nicknames = JSON.parse(localStorage.getItem('expensebook_nicknames')) || [];
let lastUpdated = null;

// DOM Elements
const totalBalanceEl = document.getElementById('totalBalance');
const totalIncomeEl = document.getElementById('totalIncome');
const totalExpenseEl = document.getElementById('totalExpense');
const transactionListEl = document.getElementById('transactionList');
const filterStartDateEl = document.getElementById('filterStartDate');
const filterEndDateEl = document.getElementById('filterEndDate');
const filterSearchEl = document.getElementById('filterSearch');
const filterTxTypeEl = document.getElementById('filterTxType');
const filterPaymentMethodEl = document.getElementById('filterPaymentMethod');
const lastUpdatedEl = document.getElementById('lastUpdatedText');
const accountSelector = document.getElementById('accountSelector');

let expenseChartInstance = null;
let selectedCategories = [];
let currentFilteredTransactions = [];

// Modals
const transactionModal = document.getElementById('transactionModal');
const categoriesModal = document.getElementById('categoriesModal');
const accountsModal = document.getElementById('accountsModal');
const deleteConfirmModal = document.getElementById('deleteConfirmModal');
const deleteAccountConfirmModal = document.getElementById('deleteAccountConfirmModal');
const importHistoryModal = document.getElementById('importHistoryModal');
let transactionToDelete = null;
let accountToDelete = null;

let lastAddedTx = null; // Remembers the last added transaction's details

// Theme Logic
const themeToggleBtn = document.getElementById('themeToggleBtn');
let currentTheme = localStorage.getItem('expensebook_theme') || 'dark';

function applyTheme(theme) {
    if (theme === 'light') {
        document.documentElement.setAttribute('data-theme', 'light');
        if(themeToggleBtn) themeToggleBtn.innerHTML = '<i class="fa-solid fa-sun" style="width: 20px;"></i> Toggle Theme';
    } else {
        document.documentElement.removeAttribute('data-theme');
        if(themeToggleBtn) themeToggleBtn.innerHTML = '<i class="fa-solid fa-moon" style="width: 20px;"></i> Toggle Theme';
    }
}

if(themeToggleBtn) {
    themeToggleBtn.addEventListener('click', () => {
        currentTheme = currentTheme === 'dark' ? 'light' : 'dark';
        localStorage.setItem('expensebook_theme', currentTheme);
        applyTheme(currentTheme);
        
        // Redraw chart with new colors
        if(expenseChartInstance) {
            updateDashboard(); 
        }
    });
}
applyTheme(currentTheme);

// Init & Local Data Load
function init() {
    // Load accounts
    const savedAccounts = localStorage.getItem('expensebook_accounts');
    if (savedAccounts) {
        accounts = JSON.parse(savedAccounts);
    } else {
        accounts = [{ id: 'acc_default', name: 'Personal' }];
        localStorage.setItem('expensebook_accounts', JSON.stringify(accounts));
    }
    
    // Load active account ID
    activeAccountId = localStorage.getItem('expensebook_active_account') || 'acc_default';
    if (!accounts.find(a => a.id === activeAccountId)) {
        activeAccountId = accounts[0].id;
        localStorage.setItem('expensebook_active_account', activeAccountId);
    }
    
    // Load transactions
    const savedTransactions = localStorage.getItem('expensebook_transactions');
    if (savedTransactions) {
        transactions = JSON.parse(savedTransactions);
    } else {
        transactions = [];
        localStorage.setItem('expensebook_transactions', JSON.stringify(transactions));
    }
    
    // Sort transactions
    sortTransactions();

    // Load importHistory
    const savedHistory = localStorage.getItem('expensebook_import_history');
    if (savedHistory) {
        importHistory = JSON.parse(savedHistory);
    } else {
        importHistory = [];
        localStorage.setItem('expensebook_import_history', JSON.stringify(importHistory));
    }
    
    // Populate categories
    categories = JSON.parse(localStorage.getItem('expensebook_categories')) || ['Food', 'Personal', 'Transport', 'Utilities', 'Entertainment', 'Salary'];
    if (!localStorage.getItem('expensebook_categories')) {
        localStorage.setItem('expensebook_categories', JSON.stringify(categories));
    }

    populateCategoryDropdowns();
    renderCategoryList();
    populateAccountSelector();
    renderAccountList();
    
    lastUpdated = new Date().toLocaleString();
    if (lastUpdatedEl) lastUpdatedEl.innerText = `Last updated on: ${lastUpdated}`;
    
    updateDashboard();
    renderTransactions();
}

function sortTransactions() {
    transactions.sort((a, b) => {
        const dateDiff = new Date(b.date) - new Date(a.date);
        if (dateDiff === 0) return b.id.localeCompare(a.id);
        return dateDiff;
    });
}

// Event Listeners
document.getElementById('fabBtn').addEventListener('click', () => {
    document.getElementById('transactionForm').reset();
    document.getElementById('txId').value = '';
    
    // Default date to today
    document.getElementById('date').valueAsDate = new Date();
    
    // Restore previous defaults if available
    if (lastAddedTx) {
        document.querySelector(`input[name="type"][value="${lastAddedTx.type}"]`).checked = true;
        document.querySelector(`input[name="paymentMethod"][value="${lastAddedTx.paymentMethod}"]`).checked = true;
        document.getElementById('title').value = lastAddedTx.title;
        document.getElementById('category').value = lastAddedTx.category;
    }
    
    openModal(transactionModal);
});
document.getElementById('importExcelBtn').addEventListener('click', () => {
    document.getElementById('excelFileInput').click();
    document.getElementById('menuDropdown').classList.add('hidden');
});

document.getElementById('manageCategoriesBtn').addEventListener('click', () => {
    openModal(categoriesModal);
    document.getElementById('menuDropdown').classList.add('hidden');
});
document.getElementById('manageAccountsBtn').addEventListener('click', () => {
    openModal(accountsModal);
    document.getElementById('menuDropdown').classList.add('hidden');
});
document.getElementById('importHistoryBtn').addEventListener('click', () => {
    renderImportHistory();
    openModal(importHistoryModal);
    document.getElementById('menuDropdown').classList.add('hidden');
});
document.getElementById('exportPdfBtn').addEventListener('click', () => {
    exportToPDF();
    document.getElementById('menuDropdown').classList.add('hidden');
});

// Close dropdown on outside click
document.addEventListener('click', (e) => {
    const menuDropdown = document.getElementById('menuDropdown');
    const menuDropdownBtn = document.getElementById('menuDropdownBtn');
    if (menuDropdown && !menuDropdown.classList.contains('hidden') && !menuDropdown.contains(e.target) && !menuDropdownBtn.contains(e.target)) {
        menuDropdown.classList.add('hidden');
    }

    const accountDropdown = document.getElementById('accountDropdown');
    const accountDropdownBtn = document.getElementById('accountDropdownBtn');
    if (accountDropdown && !accountDropdown.classList.contains('hidden') && !accountDropdown.contains(e.target) && !accountDropdownBtn.contains(e.target)) {
        accountDropdown.classList.add('hidden');
    }

    const txTypeDropdown = document.getElementById('txTypeDropdown');
    const txTypeDropdownBtn = document.getElementById('txTypeDropdownBtn');
    if (txTypeDropdown && !txTypeDropdown.classList.contains('hidden') && !txTypeDropdown.contains(e.target) && !txTypeDropdownBtn.contains(e.target)) {
        txTypeDropdown.classList.add('hidden');
    }

    const paymentMethodDropdown = document.getElementById('paymentMethodDropdown');
    const paymentMethodDropdownBtn = document.getElementById('paymentMethodDropdownBtn');
    if (paymentMethodDropdown && !paymentMethodDropdown.classList.contains('hidden') && !paymentMethodDropdown.contains(e.target) && !paymentMethodDropdownBtn.contains(e.target)) {
        paymentMethodDropdown.classList.add('hidden');
    }
});

const accountDropdownBtn = document.getElementById('accountDropdownBtn');
const accountDropdown = document.getElementById('accountDropdown');
if (accountDropdownBtn && accountDropdown) {
    accountDropdownBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        accountDropdown.classList.toggle('hidden');
        document.getElementById('txTypeDropdown').classList.add('hidden');
        document.getElementById('paymentMethodDropdown').classList.add('hidden');
        document.getElementById('multiSelectDropdown').classList.add('hidden');
        document.getElementById('menuDropdown').classList.add('hidden');
    });
}

const txTypeDropdownBtn = document.getElementById('txTypeDropdownBtn');
const txTypeDropdown = document.getElementById('txTypeDropdown');
const activeTxTypeText = document.getElementById('activeTxTypeText');
if (txTypeDropdownBtn && txTypeDropdown) {
    txTypeDropdownBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        txTypeDropdown.classList.toggle('hidden');
        if (accountDropdown) accountDropdown.classList.add('hidden');
        document.getElementById('paymentMethodDropdown').classList.add('hidden');
        document.getElementById('multiSelectDropdown').classList.add('hidden');
        document.getElementById('menuDropdown').classList.add('hidden');
    });

    document.querySelectorAll('.tx-type-option').forEach(btn => {
        btn.addEventListener('click', () => {
            const val = btn.getAttribute('data-value');
            if (activeTxTypeText) activeTxTypeText.innerText = btn.innerText;
            filterTxTypeEl.value = val;
            txTypeDropdown.classList.add('hidden');
            renderTransactions();
        });
    });
}

const paymentMethodDropdownBtn = document.getElementById('paymentMethodDropdownBtn');
const paymentMethodDropdown = document.getElementById('paymentMethodDropdown');
const activePaymentMethodText = document.getElementById('activePaymentMethodText');
if (paymentMethodDropdownBtn && paymentMethodDropdown) {
    paymentMethodDropdownBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        paymentMethodDropdown.classList.toggle('hidden');
        if (accountDropdown) accountDropdown.classList.add('hidden');
        txTypeDropdown.classList.add('hidden');
        document.getElementById('multiSelectDropdown').classList.add('hidden');
        document.getElementById('menuDropdown').classList.add('hidden');
    });

    document.querySelectorAll('.payment-method-option').forEach(btn => {
        btn.addEventListener('click', () => {
            const val = btn.getAttribute('data-value');
            if (activePaymentMethodText) activePaymentMethodText.innerText = btn.innerText;
            filterPaymentMethodEl.value = val;
            paymentMethodDropdown.classList.add('hidden');
            renderTransactions();
        });
    });
}

accountSelector.addEventListener('change', (e) => {
    activeAccountId = e.target.value;
    localStorage.setItem('expensebook_active_account', activeAccountId);
    updateDashboard();
    renderTransactions();
});

document.querySelectorAll('[data-close]').forEach(btn => {
    btn.addEventListener('click', (e) => {
        const modalId = e.currentTarget.getAttribute('data-close');
        closeModal(document.getElementById(modalId));
    });
});

// Close modal on outside click
document.querySelectorAll('.modal-overlay').forEach(overlay => {
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) {
            closeModal(overlay);
        }
    });
});

// Filters
filterSearchEl.addEventListener('input', renderTransactions);
filterTxTypeEl.addEventListener('change', renderTransactions);
filterPaymentMethodEl.addEventListener('change', renderTransactions);

// Multi-Select Dropdown Logic
const multiSelectContainer = document.getElementById('multiSelectContainer');
const multiSelectHeader = document.getElementById('multiSelectHeader');
const multiSelectDropdown = document.getElementById('multiSelectDropdown');

multiSelectHeader.addEventListener('click', (e) => {
    e.stopPropagation();
    multiSelectDropdown.classList.toggle('hidden');
});

document.addEventListener('click', (e) => {
    if (!multiSelectContainer.contains(e.target)) {
        multiSelectDropdown.classList.add('hidden');
    }
});

filterStartDateEl.addEventListener('change', () => {
    if (filterStartDateEl.value) {
        filterEndDateEl.min = filterStartDateEl.value;
        if (filterEndDateEl.value && filterStartDateEl.value > filterEndDateEl.value) {
            filterEndDateEl.value = filterStartDateEl.value;
        }
    } else {
        filterEndDateEl.min = '';
    }
    renderTransactions();
});

filterEndDateEl.addEventListener('change', () => {
    if (filterEndDateEl.value) {
        filterStartDateEl.max = filterEndDateEl.value;
        if (filterStartDateEl.value && filterStartDateEl.value > filterEndDateEl.value) {
            filterStartDateEl.value = filterEndDateEl.value;
        }
    } else {
        filterStartDateEl.max = '';
    }
    renderTransactions();
});

// Tab Switching
document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));

        btn.classList.add('active');
        const targetTab = btn.getAttribute('data-tab');
        document.getElementById(targetTab).classList.add('active');
    });
});

// Add / Edit Transaction Form
document.getElementById('transactionForm').addEventListener('submit', (e) => {
    e.preventDefault();

    const txId = document.getElementById('txId').value;
    const type = document.querySelector('input[name="type"]:checked').value;
    const paymentMethod = document.querySelector('input[name="paymentMethod"]:checked').value;
    const amount = parseFloat(document.getElementById('amount').value);
    const rawTitle = document.getElementById('title').value.trim();
    const category = document.getElementById('category').value;
    const title = rawTitle || category;
    const date = document.getElementById('date').value;

    const tx = {
        id: txId || Date.now().toString(),
        accountId: activeAccountId,
        type,
        paymentMethod,
        amount,
        title,
        category,
        date
    };

    // Save for next time
    lastAddedTx = { type, paymentMethod, title, category };
    
    // Reset and close immediately
    e.target.reset();
    document.getElementById('txId').value = '';
    document.getElementById('date').valueAsDate = new Date(); // Reset to today
    closeModal(transactionModal);

    if (txId) {
        const idx = transactions.findIndex(t => t.id === txId);
        if (idx !== -1) transactions[idx] = tx;
    } else {
        transactions.push(tx);
    }
    
    localStorage.setItem('expensebook_transactions', JSON.stringify(transactions));
    sortTransactions();
    lastUpdated = new Date().toLocaleString();
    if (lastUpdatedEl) lastUpdatedEl.innerText = `Last updated on: ${lastUpdated}`;

    updateDashboard();
    renderTransactions();
});

// Add Category Form
document.getElementById('addCategoryForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const input = document.getElementById('newCategoryName');
    const newCat = input.value.trim();

    if (newCat && !categories.includes(newCat)) {
        categories.push(newCat);
        saveCategories();
        renderCategoryList();
        populateCategoryDropdowns();
        input.value = '';
    }
});

// Add Account Form
document.getElementById('addAccountForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const input = document.getElementById('newAccountName');
    const newName = input.value.trim();

    if (newName) {
        const newId = 'acc_' + Date.now();
        const acc = { id: newId, name: newName };
        
        accounts.push(acc);
        localStorage.setItem('expensebook_accounts', JSON.stringify(accounts));
        
        activeAccountId = newId;
        localStorage.setItem('expensebook_active_account', activeAccountId);
        input.value = '';

        populateAccountSelector();
        renderAccountList();
        updateDashboard();
        renderTransactions();
    }
});

// Helper Functions
function openModal(modal) {
    modal.classList.remove('hidden');
    if (modal === transactionModal) {
        // Set default date to today if empty
        if (!document.getElementById('date').value) {
            document.getElementById('date').valueAsDate = new Date();
        }
    }
}

function closeModal(modal) {
    modal.classList.add('hidden');
}

function saveTransactions() {
    // Sort by date descending, then by transaction ID descending (newest first)
    transactions.sort((a, b) => {
        const dateDiff = new Date(b.date) - new Date(a.date);
        if (dateDiff === 0) {
            return b.id.localeCompare(a.id);
        }
        return dateDiff;
    });
    localStorage.setItem('expensebook_transactions', JSON.stringify(transactions));

    // Update last updated
    lastUpdated = new Date().toLocaleString();
    localStorage.setItem('expensebook_last_updated', lastUpdated);
}

function saveCategories() {
    localStorage.setItem('expensebook_categories', JSON.stringify(categories));
}



function editTransaction(id) {
    const tx = transactions.find(t => t.id === id);
    if (!tx) return;

    document.getElementById('txId').value = tx.id;

    // Set payment method, default to UPI if older transaction
    const method = tx.paymentMethod || 'UPI';
    if (method === 'UPI') {
        document.getElementById('methodUPI').checked = true;
        document.getElementById('methodCash').checked = false;
    } else {
        document.getElementById('methodCash').checked = true;
        document.getElementById('methodUPI').checked = false;
    }

    document.getElementById('amount').value = tx.amount;
    document.getElementById('category').value = tx.category;
    document.getElementById('date').value = tx.date;

    if (tx.type === 'income') {
        document.getElementById('typeIncome').checked = true;
    } else {
        document.getElementById('typeExpense').checked = true;
    }

    openModal(transactionModal);
}

function deleteTransaction(id) {
    transactionToDelete = id;
    openModal(deleteConfirmModal);
}

document.getElementById('confirmDeleteBtn').addEventListener('click', () => {
    if (transactionToDelete) {
        const idToDelete = transactionToDelete;
        transactionToDelete = null;
        closeModal(deleteConfirmModal);
        
        transactions = transactions.filter(t => t.id !== idToDelete);
        localStorage.setItem('expensebook_transactions', JSON.stringify(transactions));
        
        lastUpdated = new Date().toLocaleString();
        if (lastUpdatedEl) lastUpdatedEl.innerText = `Last updated on: ${lastUpdated}`;
        
        updateDashboard();
        renderTransactions();
    }
});

function deleteCategory(cat) {
    categories = categories.filter(c => c !== cat);
    saveCategories();
    renderCategoryList();
    populateCategoryDropdowns();
}

function saveNicknames() {
    localStorage.setItem('expensebook_nicknames', JSON.stringify(nicknames));
}

function renderNicknameList() {
    // Stub – not used in current UI
}

function deleteNickname(index) {
    nicknames.splice(index, 1);
    saveNicknames();
    renderNicknameList();
    renderTransactions();
}

function updateDashboard(filteredTransactions = null) {
    // Default to all transactions for the active account
    const source = filteredTransactions !== null
        ? filteredTransactions
        : transactions.filter(t => t.accountId === activeAccountId);

    const totals = source.reduce((acc, curr) => {
        if (curr.type === 'income') {
            acc.income += curr.amount;
            acc.balance += curr.amount;
        } else {
            acc.expense += curr.amount;
            acc.balance -= curr.amount;
        }
        return acc;
    }, { balance: 0, income: 0, expense: 0 });

    totalBalanceEl.innerText = formatCurrency(totals.balance);
    totalIncomeEl.innerText = formatCurrency(totals.income);
    totalExpenseEl.innerText = formatCurrency(totals.expense);

    if (lastUpdated) {
        lastUpdatedEl.innerText = `Last updated on: ${lastUpdated}`;
    }
}



function renderTransactions() {
    transactionListEl.innerHTML = '';

    const startFilter = filterStartDateEl.value ? new Date(filterStartDateEl.value) : null;
    const endFilter = filterEndDateEl.value ? new Date(filterEndDateEl.value) : null;
    const searchFilter = filterSearchEl.value.toLowerCase().trim();
    const typeFilter = filterTxTypeEl.value;
    const methodFilter = filterPaymentMethodEl.value;

    const activeTransactions = transactions.filter(t => t.accountId === activeAccountId);

    // Calculate absolute running balances from oldest to newest for active account
    const chronological = [...activeTransactions].reverse();
    let currentBal = 0;
    chronological.forEach(tx => {
        if (tx.type === 'income') {
            currentBal += tx.amount;
        } else {
            currentBal -= tx.amount;
        }
        tx.runningBalance = currentBal;
    });

    const filtered = activeTransactions.filter(t => {
        const txDate = new Date(t.date);

        const matchCat = selectedCategories.length === 0 || selectedCategories.includes(t.category);

        const displayTitle = t.title;
        const matchSearch = searchFilter === '' ||
            displayTitle.toLowerCase().includes(searchFilter) ||
            t.category.toLowerCase().includes(searchFilter);

        let matchStart = true;
        if (startFilter) {
            matchStart = txDate >= startFilter;
        }

        let matchEnd = true;
        if (endFilter) {
            matchEnd = txDate <= endFilter;
        }

        const safeTypeFilter = (typeFilter || '').trim().toLowerCase();
        const matchType = safeTypeFilter === 'all' || safeTypeFilter === 'all types' || safeTypeFilter === '' || t.type === typeFilter;

        // Default older transactions to UPI for filtering
        const txMethod = t.paymentMethod || 'UPI';
        const safeMethodFilter = (methodFilter || '').trim().toLowerCase();
        const matchMethod = safeMethodFilter === 'all' || safeMethodFilter === 'all methods' || safeMethodFilter === '' || txMethod === methodFilter;

        return matchCat && matchStart && matchEnd && matchSearch && matchType && matchMethod;
    });

    currentFilteredTransactions = filtered;

    // Update dashboard based on filtered results
    updateDashboard(filtered);
    renderChart(filtered);

    if (filtered.length === 0) {
        transactionListEl.innerHTML = `
            <div class="empty-state">
                <i class="fa-solid fa-receipt"></i>
                <p>No transactions found.</p>
            </div>
        `;
        return;
    }

    filtered.forEach(tx => {
        const isIncome = tx.type === 'income';
        const sign = isIncome ? '+' : '-';

        const dateObj = new Date(tx.date);
        const day = dateObj.getDate();
        const month = dateObj.toLocaleDateString('en-US', { month: 'short' });
        const year = dateObj.getFullYear();
        const formattedDate = `${day} ${month} ${year}`;

        const displayTitle = tx.title;
        const runningBalStr = tx.runningBalance !== undefined ? formatCurrency(tx.runningBalance) : '';
        const txMethod = tx.paymentMethod || 'UPI';
        const methodIcon = txMethod === 'Cash' ? '<i class="fa-solid fa-money-bill"></i>' : '<i class="fa-brands fa-google-pay"></i>';

        const item = document.createElement('div');
        item.className = 'transaction-item';
        item.innerHTML = `
            <div class="tx-row tx-header-row">
                <span class="tx-date">${formattedDate}</span>
                <span class="tx-amount ${tx.type}">${sign}${formatCurrency(tx.amount)}</span>
            </div>
            <div class="tx-row tx-body-row">
                <div class="tx-title-group">
                    <h4>${displayTitle}</h4>
                    <span class="tx-category-badge" title="Original: ${tx.title}">
                        <i class="fa-solid fa-tag" style="margin-right: 4px;"></i>${tx.category} &nbsp;|&nbsp; ${methodIcon} ${txMethod}
                    </span>
                </div>
                <div class="tx-balance-group">
                    <div class="tx-running-bal">Bal: ${runningBalStr}</div>
                </div>
            </div>
            <div class="tx-row tx-footer-row" style="justify-content: flex-end;">
                <div class="tx-actions">
                    <button class="edit-btn" onclick="editTransaction('${tx.id}')" title="Edit"><i class="fa-solid fa-pen"></i></button>
                    <button class="delete-btn" onclick="deleteTransaction('${tx.id}')" title="Delete"><i class="fa-solid fa-trash"></i></button>
                </div>
            </div>
        `;
        transactionListEl.appendChild(item);
    });
}

function renderCategoryList() {
    const list = document.getElementById('categoryList');
    list.innerHTML = '';
    categories.forEach(cat => {
        const li = document.createElement('li');
        li.className = 'category-item';
        li.innerHTML = `
            <span>${cat}</span>
            <button onclick="deleteCategory('${cat}')" title="Delete"><i class="fa-solid fa-trash"></i></button>
        `;
        list.appendChild(li);
    });
}

function saveAccounts() {
    localStorage.setItem('expensebook_accounts', JSON.stringify(accounts));
}

function renderAccountList() {
    const list = document.getElementById('accountList');
    list.innerHTML = '';
    accounts.forEach(acc => {
        const div = document.createElement('div');
        div.style.display = 'flex';
        div.style.justifyContent = 'space-between';
        div.style.alignItems = 'center';
        div.style.padding = '12px';
        div.style.border = '1px solid var(--border)';
        div.style.borderRadius = '12px';
        div.style.marginBottom = '8px';
        div.style.background = 'var(--surface)';

        div.innerHTML = `
            <span class="account-name-text" style="flex: 1; font-weight: 500;">${acc.name} ${acc.id === 'acc_default' ? '<span style="font-size: 0.75rem; color: var(--text-secondary); opacity: 0.8;">(Default)</span>' : ''}</span>
            <div class="account-actions" style="display: flex; gap: 8px; align-items: center;">
                <button class="icon-btn edit-btn" title="Rename"><i class="fa-solid fa-pen"></i></button>
                <button class="icon-btn delete-btn" title="Delete"><i class="fa-solid fa-trash"></i></button>
            </div>
        `;
        
        const editBtn = div.querySelector('.edit-btn');
        const deleteBtn = div.querySelector('.delete-btn');
        const nameSpan = div.querySelector('.account-name-text');
        const actionsDiv = div.querySelector('.account-actions');
        
        editBtn.addEventListener('click', () => {
            // Enter edit mode
            const input = document.createElement('input');
            input.type = 'text';
            input.value = acc.name;
            input.className = 'select-input';
            input.style.flex = '1';
            input.style.marginRight = '8px';
            input.style.padding = '6px 12px';
            input.style.borderRadius = '8px';
            input.style.background = 'var(--surface-hover)';
            input.style.fontSize = '0.9rem';
            
            // Replace name span with input
            div.replaceChild(input, nameSpan);
            input.focus();
            input.select();
            
            // Replace actions with save/cancel
            actionsDiv.innerHTML = `
                <button class="save-btn" title="Save" style="background:transparent; border:none; cursor:pointer; color:var(--income); font-size:1.1rem; padding:4px;"><i class="fa-solid fa-check"></i></button>
                <button class="cancel-btn" title="Cancel" style="background:transparent; border:none; cursor:pointer; color:var(--text-secondary); font-size:1.1rem; padding:4px;"><i class="fa-solid fa-xmark"></i></button>
            `;
            
            const saveBtn = actionsDiv.querySelector('.save-btn');
            const cancelBtn = actionsDiv.querySelector('.cancel-btn');
            
            const performSave = () => {
                const newName = input.value.trim();
                if (!newName || newName === acc.name) {
                    renderAccountList();
                    return;
                }
                
                // Update local cache, localStorage, and UI immediately
                acc.name = newName;
                localStorage.setItem('expensebook_accounts', JSON.stringify(accounts));
                renderAccountList();
                populateAccountSelector();
            };
            
            saveBtn.addEventListener('click', performSave);
            cancelBtn.addEventListener('click', () => renderAccountList());
            
            input.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') performSave();
                if (e.key === 'Escape') renderAccountList();
            });
        });
        
        deleteBtn.addEventListener('click', () => deleteAccount(acc.id));
        
        list.appendChild(div);
    });
}

function populateAccountSelector() {
    if (!accountSelector) return;
    accountSelector.innerHTML = '';
    accounts.forEach(acc => {
        accountSelector.add(new Option(acc.name, acc.id));
    });
    accountSelector.value = activeAccountId;

    // Custom dropdown rendering
    const accountDropdown = document.getElementById('accountDropdown');
    const activeAccountNameText = document.getElementById('activeAccountNameText');
    if (accountDropdown) {
        accountDropdown.innerHTML = '';
        accounts.forEach(acc => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'btn account-option';
            btn.setAttribute('data-value', acc.id);
            btn.innerHTML = `<i class="fa-solid fa-wallet" style="font-size: 0.85rem; color: var(--primary);"></i> ${acc.name}`;
            btn.addEventListener('click', () => {
                activeAccountId = acc.id;
                localStorage.setItem('expensebook_active_account', activeAccountId);
                if (activeAccountNameText) activeAccountNameText.innerText = acc.name;
                accountDropdown.classList.add('hidden');
                accountSelector.value = activeAccountId; // Keep hidden select synced
                updateDashboard();
                renderTransactions();
            });
            accountDropdown.appendChild(btn);
        });
    }

    const currentAcc = accounts.find(a => a.id === activeAccountId);
    if (currentAcc && activeAccountNameText) {
        activeAccountNameText.innerText = currentAcc.name;
    }
}

function deleteAccount(id) {
    // Check if they are trying to delete the only account
    if (accounts.length <= 1) {
        alert("You cannot delete the only remaining account. Create another account first.");
        return;
    }
    
    accountToDelete = id;
    openModal(deleteAccountConfirmModal);
}

document.getElementById('confirmDeleteAccountBtn').addEventListener('click', () => {
    if (accountToDelete) {
        const id = accountToDelete;
        accountToDelete = null;
        closeModal(deleteAccountConfirmModal);
        
        // Remove associated transactions locally
        transactions = transactions.filter(t => t.accountId !== id);
        localStorage.setItem('expensebook_transactions', JSON.stringify(transactions));
        
        // Remove from local accounts array
        accounts = accounts.filter(a => a.id !== id);
        localStorage.setItem('expensebook_accounts', JSON.stringify(accounts));
        
        // Update active account locally if it was the deleted one
        if (activeAccountId === id) {
            activeAccountId = accounts[0].id;
            localStorage.setItem('expensebook_active_account', activeAccountId);
        }
        
        // Refresh UI immediately
        populateAccountSelector();
        renderAccountList();
        updateDashboard();
        renderTransactions();
    }
});

function populateCategoryDropdowns() {
    const formSelect = document.getElementById('category');

    formSelect.innerHTML = '';
    categories.forEach(cat => {
        formSelect.add(new Option(cat, cat));
    });

    // Populate custom multi-select
    const multiSelectDropdown = document.getElementById('multiSelectDropdown');
    multiSelectDropdown.innerHTML = '';

    // Ensure selected categories only contain valid existing categories
    selectedCategories = selectedCategories.filter(c => categories.includes(c));

    categories.forEach(cat => {
        const isChecked = selectedCategories.includes(cat) ? 'checked' : '';
        const div = document.createElement('label');
        div.className = 'multi-select-option';
        div.innerHTML = `<input type="checkbox" value="${cat}" ${isChecked}> ${cat}`;

        div.querySelector('input').addEventListener('change', (e) => {
            if (e.target.checked) {
                if (!selectedCategories.includes(cat)) selectedCategories.push(cat);
            } else {
                selectedCategories = selectedCategories.filter(c => c !== cat);
            }
            updateMultiSelectHeader();
            renderTransactions();
        });

        multiSelectDropdown.appendChild(div);
    });

    updateMultiSelectHeader();
}

function updateMultiSelectHeader() {
    const header = document.getElementById('multiSelectHeader');
    if (selectedCategories.length === 0) {
        header.innerText = 'All Categories';
    } else if (selectedCategories.length === 1) {
        header.innerText = selectedCategories[0];
    } else {
        header.innerText = `${selectedCategories.length} Categories Selected`;
    }
}

function formatCurrency(amount) {
    return new Intl.NumberFormat('en-IN', {
        style: 'currency',
        currency: 'INR',
        minimumFractionDigits: 0,
        maximumFractionDigits: 2
    }).format(amount);
}

function getCategoryIcon(category) {
    const catMap = {
        'Food': '<i class="fa-solid fa-burger"></i>',
        'Personal': '<i class="fa-solid fa-user"></i>',
        'Transport': '<i class="fa-solid fa-car"></i>',
        'Utilities': '<i class="fa-solid fa-bolt"></i>',
        'Entertainment': '<i class="fa-solid fa-film"></i>',
        'Salary': '<i class="fa-solid fa-wallet"></i>'
    };
    return catMap[category] || '<i class="fa-solid fa-tag"></i>';
}

function renderChart(filteredTransactions) {
    const chartContainer = document.getElementById('chartContainer');
    const noDataMsg = document.getElementById('noChartDataMsg');
    const canvas = document.getElementById('expenseChart');

    // Aggregate by category for all currently filtered transactions
    const chartData = {};
    let totalAmount = 0;

    filteredTransactions.forEach(tx => {
        chartData[tx.category] = (chartData[tx.category] || 0) + tx.amount;
        totalAmount += tx.amount;
    });

    // If no data, show the empty state message and hide the canvas
    if (totalAmount === 0) {
        chartContainer.style.display = 'block';
        if (noDataMsg) noDataMsg.style.display = 'block';
        if (canvas) canvas.style.display = 'none';
        return;
    }

    chartContainer.style.display = 'block';
    if (noDataMsg) noDataMsg.style.display = 'none';
    if (canvas) canvas.style.display = 'block';

    const labels = Object.keys(chartData);
    const data = Object.values(chartData);

    const ctx = canvas.getContext('2d');

    // Premium dark mode colors
    const colors = [
        '#ef4444', '#3b82f6', '#10b981', '#f59e0b',
        '#8b5cf6', '#ec4899', '#14b8a6', '#f97316'
    ];

    if (expenseChartInstance) {
        expenseChartInstance.data.labels = labels;
        expenseChartInstance.data.datasets[0].data = data;
        expenseChartInstance.data.datasets[0].backgroundColor = colors.slice(0, labels.length);
        expenseChartInstance.update();
        return;
    }

    expenseChartInstance = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: labels,
            datasets: [{
                data: data,
                backgroundColor: colors.slice(0, labels.length),
                borderWidth: 2,
                borderColor: '#0b0f19' // Match --bg-color
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'right',
                    labels: {
                        color: '#f8fafc', // Match --text-primary
                        font: {
                            family: "'Outfit', sans-serif",
                            size: 13
                        }
                    }
                },
                tooltip: {
                    backgroundColor: 'rgba(30, 41, 59, 0.9)',
                    titleFont: { family: "'Outfit', sans-serif" },
                    bodyFont: { family: "'Outfit', sans-serif" },
                    callbacks: {
                        label: function (context) {
                            return ' ' + formatCurrency(context.raw);
                        }
                    }
                }
            },
            cutout: '70%'
        }
    });
}

async function exportToPDF() {
    if (currentFilteredTransactions.length === 0) {
        alert("No transactions to export.");
        return;
    }

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();

    // 1. Gather Filter Info
    const activeAccountName = accounts.find(a => a.id === activeAccountId)?.name || 'Unknown Account';
    const startFilter = filterStartDateEl.value ? new Date(filterStartDateEl.value) : null;
    const endFilter = filterEndDateEl.value ? new Date(filterEndDateEl.value) : null;
    const searchFilter = filterSearchEl.value.trim();
    const typeFilter = filterTxTypeEl.value;
    const methodFilter = filterPaymentMethodEl.value;

    let filterSummary = `Account: ${activeAccountName}`;
    if (startFilter || endFilter) {
        const s = startFilter ? startFilter.toLocaleDateString('en-GB') : 'Start';
        const e = endFilter ? endFilter.toLocaleDateString('en-GB') : 'Present';
        filterSummary += ` | Dates: ${s} to ${e}`;
    }
    if (selectedCategories.length > 0) filterSummary += ` | Categories: ${selectedCategories.join(', ')}`;
    if (typeFilter !== 'all') filterSummary += ` | Type: ${typeFilter.charAt(0).toUpperCase() + typeFilter.slice(1)}`;
    if (methodFilter !== 'all') filterSummary += ` | Method: ${methodFilter}`;
    if (searchFilter) filterSummary += ` | Search: "${searchFilter}"`;

    // 2. Calculate Opening Balance precisely based on non-date filters prior to start date
    const activeTransactions = transactions.filter(t => t.accountId === activeAccountId);
    let openingBalance = 0;
    
    if (startFilter) {
        activeTransactions.forEach(t => {
            const txDate = new Date(t.date);
            if (txDate < startFilter) {
                const matchCat = selectedCategories.length === 0 || selectedCategories.includes(t.category);
                const displayTitle = t.title;
                const matchSearch = searchFilter === '' ||
                    displayTitle.toLowerCase().includes(searchFilter.toLowerCase()) ||
                    t.category.toLowerCase().includes(searchFilter.toLowerCase());
                
                const safeTypeFilter = (typeFilter || '').trim().toLowerCase();
                const matchType = safeTypeFilter === 'all' || safeTypeFilter === 'all types' || safeTypeFilter === '' || t.type === typeFilter;
                
                const txMethod = t.paymentMethod || 'UPI';
                const safeMethodFilter = (methodFilter || '').trim().toLowerCase();
                const matchMethod = safeMethodFilter === 'all' || safeMethodFilter === 'all methods' || safeMethodFilter === '' || txMethod === methodFilter;
                
                if (matchCat && matchSearch && matchType && matchMethod) {
                    if (t.type === 'income') openingBalance += t.amount;
                    else openingBalance -= t.amount;
                }
            }
        });
    }

    // 3. Calculate Income and Expense for the filtered period
    let totalIncome = 0;
    let totalExpense = 0;
    currentFilteredTransactions.forEach(t => {
        if (t.type === 'income') totalIncome += t.amount;
        else totalExpense += t.amount;
    });

    const closingBalance = openingBalance + totalIncome - totalExpense;

    // 4. Render PDF Header
    doc.setFont("helvetica", "bold");
    doc.setFontSize(18);
    doc.setTextColor(15, 23, 42); // Dark slate
    doc.text("ExpenseBook Statement", 14, 22);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(100);
    doc.text(`Generated on: ${new Date().toLocaleString()}`, 14, 28);
    
    // Wrap filter summary text
    const splitFilters = doc.splitTextToSize(`Filters Applied: ${filterSummary}`, 180);
    doc.setFont("helvetica", "italic");
    doc.text(splitFilters, 14, 34);

    let startY = 34 + (splitFilters.length * 5) + 4;

    doc.setFont("helvetica", "bold");
    doc.setTextColor(15, 23, 42);
    doc.text(`Opening Balance: Rs. ${openingBalance.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`, 14, startY);
    doc.text(`Closing Balance: Rs. ${closingBalance.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`, 110, startY);
    
    startY += 6;
    doc.setFont("helvetica", "normal");
    doc.setTextColor(16, 185, 129); // Green
    doc.text(`Total Income: Rs. ${totalIncome.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`, 14, startY);
    doc.setTextColor(239, 68, 68); // Red
    doc.text(`Total Expense: Rs. ${totalExpense.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`, 110, startY);

    const tableColumn = ["Date", "Title", "Category", "Method", "Type", "Amount"];
    const tableRows = [];

    // Sort oldest first for the table reading
    const sortedTxs = [...currentFilteredTransactions].sort((a, b) => new Date(a.date) - new Date(b.date));

    sortedTxs.forEach(tx => {
        const rowData = [
            new Date(tx.date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }),
            tx.title,
            tx.category,
            tx.paymentMethod || 'UPI',
            tx.type.charAt(0).toUpperCase() + tx.type.slice(1),
            (tx.type === 'income' ? '+' : '-') + ' Rs. ' + tx.amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })
        ];
        tableRows.push(rowData);
    });

    doc.autoTable({
        head: [tableColumn],
        body: tableRows,
        startY: startY + 6,
        theme: 'striped',
        styles: { font: 'helvetica', fontSize: 10 },
        headStyles: { fillColor: [15, 23, 42], textColor: 255 },
        alternateRowStyles: { fillColor: [241, 245, 249] },
        columnStyles: {
            5: { halign: 'right', fontStyle: 'bold' }
        },
        didParseCell: function (data) {
            if (data.section === 'body' && data.column.index === 5) {
                if (data.cell.raw.includes('+')) {
                    data.cell.styles.textColor = [16, 185, 129]; // Green
                } else if (data.cell.raw.includes('-')) {
                    data.cell.styles.textColor = [239, 68, 68]; // Red
                }
            }
        }
    });

    const fileName = `ExpenseBook_Statement_${new Date().toISOString().split('T')[0]}.pdf`;

    if (window.Capacitor && window.Capacitor.isNativePlatform()) {
        try {
            const base64Data = doc.output('datauristring').split(',')[1];
            
            const Filesystem = window.Capacitor.Plugins.Filesystem;
            const Share = window.Capacitor.Plugins.Share;
            
            const writeResult = await Filesystem.writeFile({
                path: fileName,
                data: base64Data,
                directory: 'CACHE' // CACHE is best for temp share files
            });
            
            await Share.share({
                title: fileName,
                text: 'Here is my ExpenseBook statement.',
                url: writeResult.uri,
                dialogTitle: 'Save or Share PDF'
            });
        } catch (e) {
            console.error("Native export failed:", e);
            alert("Error exporting PDF on device. " + e.message);
        }
    } else {
        doc.save(fileName);
    }
}

// Unified Import Logic (Excel & PDF)
document.getElementById('importExcelBtn').addEventListener('click', () => {
    document.getElementById('excelFileInput').click();
});

document.getElementById('excelFileInput').addEventListener('change', async function (e) {
    const file = e.target.files[0];
    if (!file) return;

    if (file.name.toLowerCase().endsWith('.pdf')) {
        try {
            const parsedTxs = await parsePDFStatement(file);
            if (parsedTxs.length === 0) {
                alert("No transactions found in this PDF. Ensure it is a Canara Bank or ExpenseBook statement.");
            } else {
                processImportedTransactions(parsedTxs, file);
            }
        } catch (error) {
            console.error("PDF parse error:", error);
            alert("Error parsing PDF file: " + error.message);
        }
        e.target.value = '';
        return;
    }

    const reader = new FileReader();
    reader.onload = function (evt) {
        try {
            const data = new Uint8Array(evt.target.result);
            const workbook = XLSX.read(data, { type: 'array' });
            const firstSheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[firstSheetName];

            const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

            let headerRowIndex = -1;
            let colMap = { date: -1, title: -1, withdrawal: -1, deposit: -1, amount: -1 };

            for (let i = 0; i < Math.min(rows.length, 50); i++) {
                const row = rows[i];
                if (!row || !Array.isArray(row)) continue;

                let foundDate = false;
                let foundTitle = false;

                row.forEach((cell, index) => {
                    if (typeof cell !== 'string') return;
                    const lower = cell.toLowerCase().trim();
                    if (lower.includes('date')) { colMap.date = index; foundDate = true; }
                    else if (lower.includes('narration') || lower.includes('description') || lower.includes('particulars') || lower === 'title') { colMap.title = index; foundTitle = true; }
                    else if (lower.includes('withdrawal') || lower.includes('debit') || lower.includes('expense') || lower.includes('sent')) colMap.withdrawal = index;
                    else if (lower.includes('deposit') || lower.includes('credit') || lower.includes('income') || lower.includes('received')) colMap.deposit = index;
                    else if (lower.includes('amount')) colMap.amount = index;
                });

                if (foundDate && foundTitle) {
                    headerRowIndex = i;
                    break;
                }
            }

            if (headerRowIndex === -1) {
                alert("Could not find the header row. Please ensure your file has columns for 'Date' and 'Narration' or 'Title'.");
                return;
            }

            const parsedTxs = [];

            for (let i = headerRowIndex + 1; i < rows.length; i++) {
                const row = rows[i];
                if (!row || row.length === 0) continue;

                const dateStr = row[colMap.date];
                const title = row[colMap.title];

                if (!dateStr || !title) continue;

                let withdrawal = colMap.withdrawal !== -1 ? parseFloat(row[colMap.withdrawal]) : NaN;
                let deposit = colMap.deposit !== -1 ? parseFloat(row[colMap.deposit]) : NaN;

                if (isNaN(withdrawal)) withdrawal = 0;
                if (isNaN(deposit)) deposit = 0;

                if (withdrawal === 0 && deposit === 0 && colMap.amount !== -1) {
                    let amt = parseFloat(row[colMap.amount]);
                    if (!isNaN(amt)) {
                        if (amt < 0) { withdrawal = Math.abs(amt); }
                        else { deposit = amt; }
                    }
                }

                let parsedDate;
                if (typeof dateStr === 'number') {
                    let utcMs = Math.round((dateStr - 25569) * 86400 * 1000);
                    let tempDate = new Date(utcMs);
                    parsedDate = new Date(tempDate.getTime() + tempDate.getTimezoneOffset() * 60000);
                } else {
                    let str = String(dateStr).trim();
                    const parts = str.split(/[-/]/);
                    if (parts.length === 3) {
                        if (parts[0].length === 4) {
                            let year = parseInt(parts[0]);
                            let month = parseInt(parts[1]) - 1;
                            let day = parseInt(parts[2]);
                            parsedDate = new Date(year, month, day);
                        } else if (!isNaN(parts[1])) {
                            let day = parseInt(parts[0]);
                            let month = parseInt(parts[1]) - 1;
                            let year = parseInt(parts[2]);
                            if (year < 100) year += 2000;
                            parsedDate = new Date(year, month, day);
                        } else {
                            parsedDate = new Date(str);
                        }
                    } else {
                        parsedDate = new Date(str);
                    }
                }

                if (isNaN(parsedDate.getTime())) parsedDate = new Date();

                const yearStr = parsedDate.getFullYear();
                const monthStr = String(parsedDate.getMonth() + 1).padStart(2, '0');
                const dayStr = String(parsedDate.getDate()).padStart(2, '0');
                const isoDate = `${yearStr}-${monthStr}-${dayStr}`;

                let type = 'expense';
                let finalAmount = withdrawal || 0;
                if (deposit && deposit > 0) {
                    type = 'income';
                    finalAmount = deposit;
                }

                if (finalAmount <= 0) continue;

                parsedTxs.push({
                    date: isoDate,
                    title: String(title),
                    amount: finalAmount,
                    type: type,
                    paymentMethod: 'UPI'
                });
            }

            if (parsedTxs.length > 0) {
                processImportedTransactions(parsedTxs, file);
            } else {
                alert("No valid transactions found in the Excel file.");
            }
        } catch (error) {
            console.error(error);
            alert("Error parsing the Excel file. Please ensure it is a valid format.");
        }
    };
    reader.readAsArrayBuffer(file);
    e.target.value = ''; // reset
});

// Unified PDF parsing entry point
async function parsePDFStatement(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = async function(e) {
            try {
                const typedarray = new Uint8Array(e.target.result);
                if (!pdfjsLib.GlobalWorkerOptions.workerSrc) {
                    pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
                }
                const pdf = await pdfjsLib.getDocument({ data: typedarray }).promise;
                let fullText = "";
                
                for (let i = 1; i <= pdf.numPages; i++) {
                    const page = await pdf.getPage(i);
                    const textContent = await page.getTextContent();
                    let lastY = -1;
                    textContent.items.forEach(item => {
                        if (lastY !== -1 && Math.abs(item.transform[5] - lastY) > 5) {
                            fullText += "\n";
                        }
                        fullText += item.str + " ";
                        lastY = item.transform[5];
                    });
                    fullText += "\n\n--- PAGE BREAK ---\n\n";
                }
                
                if (fullText.includes("ExpenseBook Statement")) {
                    const txs = parseExpenseBookPDFText(fullText);
                    resolve(txs);
                } else {
                    const txs = parseCanaraBankPDFText(fullText);
                    resolve(txs);
                }
            } catch (err) {
                reject(err);
            }
        };
        reader.readAsArrayBuffer(file);
    });
}

function parseExpenseBookPDFText(fullText) {
    const parsedTxs = [];
    const lines = fullText.split('\n');
    const txRegex = /^\s*(\d{1,2}\s+[A-Za-z]{3}\s+\d{4})\s+(.*?)\s+(Income|Expense)\s+([+-]\s*(?:Rs\.|₹|INR)?\s*([\d,]+\.\d{2}))/i;
    
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;
        
        const match = line.match(txRegex);
        if (match) {
            const dateStr = match[1];
            const detailStr = match[2];
            const typeStr = match[3].toLowerCase();
            const rawAmountNum = match[5];
            
            const parsedDate = new Date(dateStr);
            if (isNaN(parsedDate.getTime())) continue;
            
            const yearStr = parsedDate.getFullYear();
            const monthStr = String(parsedDate.getMonth() + 1).padStart(2, '0');
            const dayStr = String(parsedDate.getDate()).padStart(2, '0');
            const isoDate = `${yearStr}-${monthStr}-${dayStr}`;
            
            const amount = parseFloat(rawAmountNum.replace(/,/g, ''));
            if (isNaN(amount) || amount <= 0) continue;
            
            const parts = detailStr.split(/\s{2,}/).map(p => p.trim()).filter(Boolean);
            let title = '';
            let category = 'Uncategorized';
            let paymentMethod = 'UPI';
            
            if (parts.length >= 3) {
                title = parts[0];
                category = parts[1];
                paymentMethod = parts[2];
            } else if (parts.length === 2) {
                title = parts[0];
                paymentMethod = parts[1];
                category = parts[0];
            } else if (parts.length === 1) {
                title = parts[0];
            }
            
            if (title === 'Opening Balance' && category === 'Opening Balance') {
                continue;
            }
            
            parsedTxs.push({
                date: isoDate,
                title: title || 'ExpenseBook Transaction',
                category: category,
                amount: amount,
                type: typeStr,
                paymentMethod: paymentMethod
            });
        }
    }
    return parsedTxs;
}

function parseCanaraBankPDFText(fullText) {
    let currentTx = null;
    const parsedTxs = [];
    const lines = fullText.split('\n');
    
    let lastRunningBalance = null;
    
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (line.toLowerCase().includes('opening balance')) {
            const amounts = line.match(/(?:Rs\.|₹|INR)?\s*[\d,]+\.\d{2}/gi);
            if (amounts && amounts.length > 0) {
                lastRunningBalance = parseFloat(amounts[amounts.length - 1].replace(/[^0-9.]/g, ''));
                break;
            }
        }
    }
    
    const finalizeTx = (tx) => {
        tx.narration = tx.narration.trim();
        let type = 'expense';
        
        if (lastRunningBalance !== null && tx.runningBalance !== null) {
            const diff = tx.runningBalance - lastRunningBalance;
            if (Math.abs(diff - tx.amount) < 0.02) {
                type = 'income';
            } else if (Math.abs(diff + tx.amount) < 0.02) {
                type = 'expense';
            } else {
                if (tx.narration.includes('/CR/') || tx.narration.includes('SBINT') || tx.narration.includes('CREDIT') || tx.narration.includes('DEPOSIT') || tx.narration.includes('Cr') || tx.narration.includes('/REF/')) {
                    type = 'income';
                }
            }
            lastRunningBalance = tx.runningBalance;
        } else {
            if (tx.narration.includes('/CR/') || tx.narration.includes('SBINT') || tx.narration.includes('CREDIT') || tx.narration.includes('DEPOSIT') || tx.narration.includes('Cr') || tx.narration.includes('/REF/')) {
                type = 'income';
            }
            if (tx.runningBalance !== null) {
                lastRunningBalance = tx.runningBalance;
            }
        }
        
        const dParts = tx.dateStr.split('-');
        if (dParts.length === 3) {
            const isoDate = `${dParts[2]}-${dParts[1]}-${dParts[0]}`;
            parsedTxs.push({ date: isoDate, title: tx.narration.substring(0, 80) || 'Bank Transaction', amount: tx.amount, type: type, paymentMethod: 'UPI' });
        }
    };

    for (let i = 0; i < lines.length; i++) {
        let line = lines[i].trim();
        if (!line || line.includes('PAGE BREAK') || line.includes('Closing Balance')) continue;
        
        const cleanLine = line.replace(/\s+/g, '');

        if (/^\d{2}-\d{2}-\d{4}$/.test(cleanLine)) {
            if (currentTx && currentTx.amount > 0) finalizeTx(currentTx);
            currentTx = { dateStr: cleanLine, narration: "", amount: 0, runningBalance: null };
            continue;
        }

        if (currentTx) {
            const amounts = line.match(/(?:Rs\.|₹|INR)?\s*[\d,]+\.\d{2}/gi);
            if (amounts && amounts.length >= 2 && !line.includes('Balance')) {
                const txAmtStr = amounts[amounts.length - 2].replace(/[^0-9.]/g, '');
                currentTx.amount = parseFloat(txAmtStr);
                
                const runningBalStr = amounts[amounts.length - 1].replace(/[^0-9.]/g, '');
                currentTx.runningBalance = parseFloat(runningBalStr);
                
                const txAmtRaw = amounts[amounts.length - 2];
                const lastAmtIndex = line.lastIndexOf(txAmtRaw);
                let narrationPart = line.substring(0, lastAmtIndex).trim();
                currentTx.narration += " " + narrationPart;
                
                finalizeTx(currentTx);
                currentTx = null;
            } else if (amounts && amounts.length === 1 && !line.includes('Balance')) {
                const amtStr = amounts[0].replace(/[^0-9.]/g, '');
                currentTx.amount = parseFloat(amtStr);
                const lastAmtIndex = line.lastIndexOf(amounts[0]);
                let narrationPart = line.substring(0, lastAmtIndex).trim();
                currentTx.narration += " " + narrationPart;
                
                finalizeTx(currentTx);
                currentTx = null;
            } else {
                currentTx.narration += " " + line;
            }
        }
    }
    if (currentTx && currentTx.amount > 0) finalizeTx(currentTx);
    return parsedTxs;
}

// Deduplication and Local Save Logic
function processImportedTransactions(parsedTxs, fileObj) {
    
    if (!categories.includes('Uncategorized')) {
        categories.push('Uncategorized');
        saveCategories();
        populateCategoryDropdowns();
    }

    // Add categories imported from PDF/Excel that don't exist yet
    let categoriesChanged = false;
    parsedTxs.forEach(tx => {
        if (tx.category && tx.category !== 'Opening Balance' && !categories.includes(tx.category)) {
            categories.push(tx.category);
            categoriesChanged = true;
        }
    });
    if (categoriesChanged) {
        saveCategories();
        populateCategoryDropdowns();
        renderCategoryList();
    }

    let importedCount = 0;
    let skippedCount = 0;
    parsedTxs.forEach(tx => {
        const isDuplicate = transactions.some(existing => {
            const sameAccount = existing.accountId === activeAccountId;
            const sameDate = existing.date === tx.date;
            const sameAmount = Math.abs(existing.amount - tx.amount) < 0.01;
            const existingTitle = existing.originalTitle || existing.title;
            const sameTitle = existingTitle.toLowerCase().trim() === tx.title.toLowerCase().trim();
            return sameAccount && sameDate && sameAmount && sameTitle;
        });
        
        if (isDuplicate) {
            skippedCount++;
        } else {
            const newId = Date.now().toString() + Math.random().toString(36).substr(2, 5);
            const newTx = {
                id: newId,
                accountId: activeAccountId,
                type: tx.type,
                paymentMethod: tx.paymentMethod || 'UPI',
                amount: tx.amount,
                title: tx.title,
                originalTitle: tx.title,
                category: tx.category || 'Uncategorized',
                date: tx.date
            };
            transactions.push(newTx);
            importedCount++;
        }
    });
    
    // Show summary modal and save to history immediately
    const summaryModal = document.getElementById('importSummaryModal');
    if (importedCount > 0) {
        document.getElementById('importSummaryMsg').innerText = `Successfully added ${importedCount} new transactions. Skipped ${skippedCount} duplicates.`;
        openModal(summaryModal);
        
        localStorage.setItem('expensebook_transactions', JSON.stringify(transactions));
        sortTransactions();
        lastUpdated = new Date().toLocaleString();
        if (lastUpdatedEl) lastUpdatedEl.innerText = `Last updated on: ${lastUpdated}`;
        
        updateDashboard();
        renderTransactions();
        uploadFileToHistory(fileObj);
    } else {
        document.getElementById('importSummaryMsg').innerText = `No new transactions added. Skipped ${skippedCount} duplicates.`;
        openModal(summaryModal);
        uploadFileToHistory(fileObj);
    }
}

// Local Database for files (IndexedDB) to keep storage free
function getFileStore() {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open("ExpenseBookOfflineFiles", 1);
        req.onupgradeneeded = (e) => {
            const db = e.target.result;
            if (!db.objectStoreNames.contains("files")) {
                db.createObjectStore("files", { keyPath: "id" });
            }
        };
        req.onsuccess = (e) => resolve(e.target.result);
        req.onerror = (e) => reject(e.target.error);
    });
}

function saveFileLocally(id, fileBlob) {
    return getFileStore().then(db => {
        return new Promise((resolve, reject) => {
            const tx = db.transaction("files", "readwrite");
            const store = tx.objectStore("files");
            store.put({ id: id, blob: fileBlob });
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
        });
    });
}

function getFileLocally(id) {
    return getFileStore().then(db => {
        return new Promise((resolve, reject) => {
            const tx = db.transaction("files", "readonly");
            const store = tx.objectStore("files");
            const req = store.get(id);
            req.onsuccess = () => resolve(req.result ? req.result.blob : null);
            req.onerror = () => reject(req.error);
        });
    });
}

function deleteFileLocally(id) {
    return getFileStore().then(db => {
        return new Promise((resolve, reject) => {
            const tx = db.transaction("files", "readwrite");
            const store = tx.objectStore("files");
            store.delete(id);
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
        });
    });
}

function uploadFileToHistory(file) {
    if (!file) return;
    const timestamp = Date.now();
    const docId = 'hist_' + timestamp;
    
    const historyDoc = {
        id: docId,
        fileName: file.name,
        timestamp: timestamp,
        url: null
    };
    
    saveFileLocally(docId, file)
        .then(() => {
            importHistory.unshift(historyDoc);
            localStorage.setItem('expensebook_import_history', JSON.stringify(importHistory));
            
            const historyModal = document.getElementById('importHistoryModal');
            if (historyModal && !historyModal.classList.contains('hidden')) {
                renderImportHistory();
            }
        })
        .catch(err => console.error("Error saving import history:", err));
}

function renderImportHistory() {
    const list = document.getElementById('importHistoryList');
    const noMsg = document.getElementById('noHistoryMsg');
    if (!list || !noMsg) return;
    
    list.innerHTML = '';
    
    if (importHistory.length === 0) {
        list.style.display = 'none';
        noMsg.style.display = 'block';
    } else {
        list.style.display = 'flex';
        noMsg.style.display = 'none';
        
        importHistory.forEach(item => {
            const li = document.createElement('li');
            li.className = 'category-item';
            const dateStr = new Date(item.timestamp).toLocaleString();
            li.innerHTML = `
                <div style="display:flex; flex-direction:column; gap:4px; max-width: 60%;">
                    <span style="font-weight:600; font-size:0.95rem; word-break: break-all;">${item.fileName}</span>
                    <span style="font-size:0.75rem; color:var(--text-secondary);">${dateStr}</span>
                </div>
                <div style="display: flex; gap: 0.5rem; align-items: center;">
                    <button class="icon-btn download-btn" title="View/Download"><i class="fa-solid fa-download"></i></button>
                    <button class="icon-btn delete-btn" onclick="deleteImportHistoryItem('${item.id}')" title="Delete"><i class="fa-solid fa-trash"></i></button>
                </div>
            `;
            
            // Add download click listener
            const downloadBtn = li.querySelector('.download-btn');
            downloadBtn.addEventListener('click', async () => {
                if (item.url) {
                    window.open(item.url, '_blank');
                } else {
                    try {
                        const blob = await getFileLocally(item.id);
                        if (blob) {
                            const localUrl = URL.createObjectURL(blob);
                            const a = document.createElement('a');
                            a.href = localUrl;
                            a.download = item.fileName;
                            document.body.appendChild(a);
                            a.click();
                            document.body.removeChild(a);
                            URL.revokeObjectURL(localUrl);
                        } else {
                            alert("This file is stored in the database but the local copy was not found on this device.");
                        }
                    } catch (err) {
                        console.error("Error downloading local file:", err);
                        alert("Error loading local file.");
                    }
                }
            });
            
            list.appendChild(li);
        });
    }
}

function deleteImportHistoryItem(id) {
    deleteFileLocally(id).catch(err => console.error("Error deleting local file:", err));
    
    importHistory = importHistory.filter(item => item.id !== id);
    localStorage.setItem('expensebook_import_history', JSON.stringify(importHistory));
    
    renderImportHistory();
}

// Start
init();
