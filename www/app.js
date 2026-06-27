const firebaseConfig = {
    apiKey: "AIzaSyDgvaj_gbVaBHNBwvimXH7pstAywHEExes",
    authDomain: "expensebook-lucky.firebaseapp.com",
    projectId: "expensebook-lucky",
    storageBucket: "expensebook-lucky.firebasestorage.app",
    messagingSenderId: "143835058116",
    appId: "1:143835058116:web:0a3e68dcc78c49b4061e91",
    measurementId: "G-REYPT7EC1H"
};

firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

let currentUser = null;
let unsubscribeAccounts = null;
let unsubscribeTransactions = null;
let unsubscribeHistory = null;

let importHistory = [];
let accounts = [];
let activeAccountId = localStorage.getItem('expensebook_active_account') || 'acc_default';

let transactions = [];
let categories = JSON.parse(localStorage.getItem('expensebook_categories')) || ['Food', 'Personal', 'Transport', 'Utilities', 'Entertainment', 'Salary'];
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
const categoriesModal = document.getElementById('categoriesModal');
const accountsModal = document.getElementById('accountsModal');
const deleteConfirmModal = document.getElementById('deleteConfirmModal');
const importHistoryModal = document.getElementById('importHistoryModal');
let transactionToDelete = null;

let lastAddedTx = null; // Remembers the last added transaction's details

// Theme Logic
const themeToggleBtn = document.getElementById('themeToggleBtn');
let currentTheme = localStorage.getItem('expensebook_theme') || 'dark';

function applyTheme(theme) {
    if (theme === 'light') {
        document.documentElement.setAttribute('data-theme', 'light');
        if(themeToggleBtn) themeToggleBtn.innerHTML = '<i class="fa-solid fa-sun"></i>';
    } else {
        document.documentElement.removeAttribute('data-theme');
        if(themeToggleBtn) themeToggleBtn.innerHTML = '<i class="fa-solid fa-moon"></i>';
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

// Phone Auth Variables
let confirmationResult = null;
let recaptchaVerifier = null;

// Init & Firebase Auth
function init() {
    populateCategoryDropdowns();
    renderCategoryList();
    
    // Initialize Recaptcha (Visible to avoid popup blockers/z-index issues)
    recaptchaVerifier = new firebase.auth.RecaptchaVerifier('recaptcha-container', {
        'size': 'normal',
        'callback': (response) => {
            // reCAPTCHA solved, enable Send OTP button
            const btn = document.getElementById('sendOtpBtn');
            btn.disabled = false;
            btn.style.opacity = '1';
        },
        'expired-callback': () => {
            // Response expired. Ask user to solve reCAPTCHA again.
            const btn = document.getElementById('sendOtpBtn');
            btn.disabled = true;
            btn.style.opacity = '0.7';
        }
    });
    recaptchaVerifier.render();

    auth.onAuthStateChanged(user => {
        if (user) {
            currentUser = user;
            document.getElementById('loginOverlay').style.display = 'none';
            document.getElementById('mainApp').style.display = 'block';
            
            // Reset Phone Auth UI just in case
            document.getElementById('phoneAuthContainer').style.display = 'flex';
            document.getElementById('otpAuthContainer').style.display = 'none';
            document.getElementById('phoneNumberInput').value = '';
            document.getElementById('otpInput').value = '';
            
            migrateLocalData();
            loadDataFromFirestore();
        } else {
            currentUser = null;
            document.getElementById('loginOverlay').style.display = 'flex';
            document.getElementById('mainApp').style.display = 'none';
            
            if (unsubscribeAccounts) unsubscribeAccounts();
            if (unsubscribeTransactions) unsubscribeTransactions();
            if (unsubscribeHistory) unsubscribeHistory();
        }
    });
}

// Phone Auth Listeners
document.getElementById('sendOtpBtn').addEventListener('click', () => {
    const countryCode = document.getElementById('countryCodeInput').value.trim();
    const phoneNum = document.getElementById('phoneNumberInput').value.trim();
    
    if (!phoneNum) {
        alert("Please enter a valid phone number.");
        return;
    }

    const fullPhoneNumber = countryCode + phoneNum;
    
    const sendBtn = document.getElementById('sendOtpBtn');
    sendBtn.innerText = "Sending...";
    sendBtn.disabled = true;

    auth.signInWithPhoneNumber(fullPhoneNumber, recaptchaVerifier)
        .then((result) => {
            confirmationResult = result;
            document.getElementById('phoneAuthContainer').style.display = 'none';
            document.getElementById('otpAuthContainer').style.display = 'flex';
        })
        .catch((error) => {
            console.error("SMS not sent", error);
            alert("Error sending OTP. Please try again. " + error.message);
            // Reset Recaptcha if it fails
            if (recaptchaVerifier) recaptchaVerifier.render().then(widgetId => grecaptcha.reset(widgetId));
        })
        .finally(() => {
            sendBtn.innerText = "Send OTP";
            sendBtn.disabled = false;
        });
});

document.getElementById('verifyOtpBtn').addEventListener('click', () => {
    const code = document.getElementById('otpInput').value.trim();
    if (code.length !== 6) {
        alert("Please enter the 6-digit OTP.");
        return;
    }
    
    const verifyBtn = document.getElementById('verifyOtpBtn');
    verifyBtn.innerText = "Verifying...";
    verifyBtn.disabled = true;

    confirmationResult.confirm(code).then((result) => {
        // User signed in successfully
        // onAuthStateChanged will handle UI updates
    }).catch((error) => {
        console.error("OTP verification failed", error);
        alert("Invalid OTP. Please try again.");
    }).finally(() => {
        verifyBtn.innerText = "Verify & Sign In";
        verifyBtn.disabled = false;
    });
});

document.getElementById('backToPhoneBtn').addEventListener('click', () => {
    document.getElementById('phoneAuthContainer').style.display = 'flex';
    document.getElementById('otpAuthContainer').style.display = 'none';
    document.getElementById('otpInput').value = '';
    // Reset recaptcha
    if (recaptchaVerifier) recaptchaVerifier.render().then(widgetId => grecaptcha.reset(widgetId));
});

document.getElementById('logoutBtn').addEventListener('click', () => {
    auth.signOut();
});

async function migrateLocalData() {
    if (!currentUser) return;
    let localAccs = JSON.parse(localStorage.getItem('expensebook_accounts'));
    let localTxs = JSON.parse(localStorage.getItem('expensebook_transactions'));
    
    if (localAccs || localTxs) {
        const batch = db.batch();
        const userRef = db.collection('users').doc(currentUser.uid);
        
        if (localAccs) {
            localAccs.forEach(acc => {
                batch.set(userRef.collection('accounts').doc(acc.id), acc);
            });
            localStorage.removeItem('expensebook_accounts');
        }
        if (localTxs) {
            localTxs.forEach(tx => {
                if (!tx.accountId) tx.accountId = 'acc_default';
                batch.set(userRef.collection('transactions').doc(tx.id), tx);
            });
            localStorage.removeItem('expensebook_transactions');
        }
        try { await batch.commit(); console.log("Migrated local data to Firestore"); } 
        catch(e) { console.error("Migration failed: ", e); }
    }
}

function loadDataFromFirestore() {
    const userRef = db.collection('users').doc(currentUser.uid);
    
    unsubscribeAccounts = userRef.collection('accounts').onSnapshot(snapshot => {
        accounts = [];
        snapshot.forEach(doc => accounts.push(doc.data()));
        if (accounts.length === 0) {
            const defAcc = { id: 'acc_default', name: 'Personal' };
            accounts.push(defAcc);
            userRef.collection('accounts').doc('acc_default').set(defAcc);
        }
        
        if (!accounts.find(a => a.id === activeAccountId)) {
            activeAccountId = accounts[0].id;
            localStorage.setItem('expensebook_active_account', activeAccountId);
        }
        
        populateAccountSelector();
        renderAccountList();
        updateDashboard();
        renderTransactions();
    });

    unsubscribeTransactions = userRef.collection('transactions').onSnapshot(snapshot => {
        transactions = [];
        snapshot.forEach(doc => transactions.push(doc.data()));
        
        transactions.sort((a, b) => {
            const dateDiff = new Date(b.date) - new Date(a.date);
            if (dateDiff === 0) return b.id.localeCompare(a.id);
            return dateDiff;
        });

        lastUpdated = new Date().toLocaleString();
        if (lastUpdatedEl) lastUpdatedEl.innerText = `Last updated on: ${lastUpdated}`;
        
        updateDashboard();
        renderTransactions();
    });

    unsubscribeHistory = userRef.collection('importHistory').orderBy('timestamp', 'desc').onSnapshot(snapshot => {
        importHistory = [];
        snapshot.forEach(doc => importHistory.push(doc.data()));
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
document.getElementById('manageAccountsBtn').addEventListener('click', () => openModal(accountsModal));
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
});accountSelector.addEventListener('change', (e) => {
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

    if (currentUser) {
        db.collection('users').doc(currentUser.uid).collection('transactions').doc(tx.id).set(tx)
            .then(() => {
                // Save for next time
                lastAddedTx = { type, paymentMethod, title, category };
                
                // Reset and close
                e.target.reset();
                document.getElementById('txId').value = '';
                document.getElementById('date').valueAsDate = new Date(); // Reset to today
                closeModal(transactionModal);
            })
            .catch(err => alert("Error saving transaction: " + err.message));
    }

    // Handled in Firestore callback above
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

    if (newName && currentUser) {
        const newId = 'acc_' + Date.now();
        const acc = { id: newId, name: newName };
        
        db.collection('users').doc(currentUser.uid).collection('accounts').doc(newId).set(acc)
            .then(() => {
                // Auto-switch to new account
                activeAccountId = newId;
                localStorage.setItem('expensebook_active_account', activeAccountId);
                input.value = '';
            })
            .catch(err => alert("Error adding account: " + err.message));
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
    if (transactionToDelete && currentUser) {
        db.collection('users').doc(currentUser.uid).collection('transactions').doc(transactionToDelete).delete()
            .then(() => {
                transactionToDelete = null;
                closeModal(deleteConfirmModal);
            })
            .catch(err => alert("Error deleting: " + err.message));
    }
});

function deleteCategory(cat) {
    categories = categories.filter(c => c !== cat);
    saveCategories();
    renderCategoryList();
    populateCategoryDropdowns();
}

function deleteNickname(index) {
    nicknames.splice(index, 1);
    saveNicknames();
    renderNicknameList();
    renderTransactions();
}

function updateDashboard(filteredTransactions = transactions) {
    const totals = filteredTransactions.reduce((acc, curr) => {
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
            <span>${acc.name} ${acc.id === 'acc_default' ? '(Default)' : ''}</span>
            <div>
                <button class="icon-btn edit-btn" onclick="renameAccount('${acc.id}', '${acc.name}')"><i class="fa-solid fa-pen"></i></button>
                <button class="icon-btn delete-btn" onclick="deleteAccount('${acc.id}')"><i class="fa-solid fa-trash"></i></button>
            </div>
        `;
        list.appendChild(div);
    });
}

async function renameAccount(id, currentName) {
    if (!currentUser) return;
    const newName = prompt("Enter new account name:", currentName);
    if (!newName || newName.trim() === "" || newName === currentName) return;
    
    try {
        await db.collection('users').doc(currentUser.uid).collection('accounts').doc(id).update({
            name: newName.trim()
        });
        // The onSnapshot listener will automatically re-render the list and selector
    } catch (err) {
        alert("Error renaming account: " + err.message);
    }
}

function populateAccountSelector() {
    if (!accountSelector) return;
    accountSelector.innerHTML = '';
    accounts.forEach(acc => {
        accountSelector.add(new Option(acc.name, acc.id));
    });
    accountSelector.value = activeAccountId;
}

function deleteAccount(id) {
    if (!currentUser) return;
    if (confirm("Are you sure you want to delete this account? All associated transactions will be deleted.")) {
        db.collection('users').doc(currentUser.uid).collection('accounts').doc(id).delete().then(() => {
            // Delete associated transactions
            const txsToDelete = transactions.filter(t => t.accountId === id);
            txsToDelete.forEach(tx => {
                db.collection('users').doc(currentUser.uid).collection('transactions').doc(tx.id).delete();
            });
            
            // update active account if it was the deleted one
            if (activeAccountId === id) {
                activeAccountId = accounts.length > 1 ? accounts.find(a => a.id !== id).id : 'acc_default';
                if(accounts.length <= 1) {
                    // Recreate default account if none left
                    db.collection('users').doc(currentUser.uid).collection('accounts').doc('acc_default').set({
                        id: 'acc_default',
                        name: 'Personal'
                    });
                }
            }
            renderTransactions();
        }).catch(err => alert("Error deleting account: " + err.message));
    }
}

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
            const parsedTxs = await parseCanaraBankPDF(file);
            if (parsedTxs.length === 0) {
                alert("No transactions found in this PDF. Ensure it is a Canara Bank format.");
            } else {
                processImportedTransactions(parsedTxs, file);
            }
        } catch (error) {
            console.error(error);
            alert("Error parsing PDF file.");
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

// PDF Parsing Logic
async function parseCanaraBankPDF(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = async function(e) {
            try {
                const typedarray = new Uint8Array(e.target.result);
                const pdf = await pdfjsLib.getDocument(typedarray).promise;
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
                
                let currentTx = null;
                const parsedTxs = [];
                const lines = fullText.split('\n');
                
                const finalizeTx = (tx) => {
                    tx.narration = tx.narration.trim();
                    let type = 'expense';
                    if (tx.narration.includes('/CR/') || tx.narration.includes('SBINT') || tx.narration.includes('CREDIT') || tx.narration.includes('DEPOSIT') || tx.narration.includes('Cr')) {
                        type = 'income';
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
                    
                    // Remove all spaces for date matching to combat kerning issues
                    const cleanLine = line.replace(/\s+/g, '');

                    if (/^\d{2}-\d{2}-\d{4}$/.test(cleanLine)) {
                        if (currentTx && currentTx.amount > 0) finalizeTx(currentTx);
                        currentTx = { dateStr: cleanLine, narration: "", amount: 0 };
                        continue;
                    }

                    if (currentTx) {
                        // Try to match amounts at the end of the line
                        // Often pdf.js concatenates columns like "100.00 5,000.00"
                        const amounts = line.match(/(?:Rs\.|₹|INR)?\s*[\d,]+\.\d{2}/gi);
                        if (amounts && amounts.length >= 2 && !line.includes('Balance')) {
                            // The second to last amount is the transaction amount. The last is the running balance.
                            const txAmtStr = amounts[amounts.length - 2].replace(/[^0-9.]/g, '');
                            currentTx.amount = parseFloat(txAmtStr);
                            
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
                resolve(parsedTxs);
            } catch (err) {
                reject(err);
            }
        };
        reader.readAsArrayBuffer(file);
    });
}

// Deduplication and Firebase Upload Logic
function processImportedTransactions(parsedTxs, fileObj) {
    if (!currentUser) return;
    
    if (!categories.includes('Uncategorized')) {
        categories.push('Uncategorized');
        saveCategories();
        populateCategoryDropdowns();
    }

    let importedCount = 0;
    let skippedCount = 0;
    const batch = db.batch();
    
    parsedTxs.forEach(tx => {
        const isDuplicate = transactions.some(existing => {
            const sameDate = existing.date === tx.date;
            const sameAmount = Math.abs(existing.amount - tx.amount) < 0.01;
            const existingTitle = existing.originalTitle || existing.title;
            const sameTitle = existingTitle.toLowerCase().trim() === tx.title.toLowerCase().trim();
            return sameDate && sameAmount && sameTitle;
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
                category: 'Uncategorized',
                date: tx.date
            };
            batch.set(db.collection('users').doc(currentUser.uid).collection('transactions').doc(newId), newTx);
            importedCount++;
        }
    });
    
    if (importedCount > 0) {
        batch.commit().then(() => {
            const summaryModal = document.getElementById('importSummaryModal');
            document.getElementById('importSummaryMsg').innerText = `Successfully added ${importedCount} new transactions. Skipped ${skippedCount} duplicates.`;
            openModal(summaryModal);
            uploadFileToHistory(fileObj);
        }).catch(err => alert("Error importing: " + err.message));
    } else {
        const summaryModal = document.getElementById('importSummaryModal');
        document.getElementById('importSummaryMsg').innerText = `No new transactions added. Skipped ${skippedCount} duplicates.`;
        openModal(summaryModal);
        uploadFileToHistory(fileObj);
    }
}

function uploadFileToHistory(file) {
    if (!currentUser || !file) return;
    const storageRef = firebase.storage().ref();
    const timestamp = Date.now();
    const fileRef = storageRef.child(`users/${currentUser.uid}/imports/${timestamp}_${file.name}`);
    
    console.log("Uploading file to history...");
    fileRef.put(file).then((snapshot) => {
        return snapshot.ref.getDownloadURL();
    }).then((url) => {
        const historyDoc = {
            fileName: file.name,
            timestamp: timestamp,
            url: url
        };
        db.collection('users').doc(currentUser.uid).collection('importHistory').add(historyDoc);
    }).catch(err => console.error("Error uploading file:", err));
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
                <div style="display:flex; flex-direction:column; gap:4px; max-width: 80%;">
                    <span style="font-weight:600; font-size:0.95rem; word-break: break-all;">${item.fileName}</span>
                    <span style="font-size:0.75rem; color:var(--text-secondary);">${dateStr}</span>
                </div>
                <a href="${item.url}" target="_blank" class="icon-btn" title="View/Download" style="text-decoration:none;"><i class="fa-solid fa-download"></i></a>
            `;
            list.appendChild(li);
        });
    }
}

// Start
init();
