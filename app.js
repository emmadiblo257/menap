// Menap Application Logic
// Built on vanilla JS + LangJS

let appSettings = {
    lang: 'fr',
    currency: 'BIF',
    theme: 'light',
    isInitialized: false,
    soundEnabled: true,
    profile: {
        firstName: '',
        lastName: '',
        email: '',
        photo: ''
    }
};

let budgets = [];
let activeBudget = null;
let currentView = 'dashboard'; // 'dashboard' or 'budget_detail'

// Date selection state
let viewDate = new Date(); // Default to today
let activeSelectionTab = 'years';
let selectedFoodItemForPurchase = null;
let selectedFoodItemForPurchasesList = null;
let selectedFoodItemForRefill = null;
window.activeCalculatorInput = null;

let lang = null;

// Web Audio API Sound Synthesizer (fully offline sound effects)
let audioCtx = null;
function playSound(type) {
    if (appSettings.soundEnabled === false) return;
    try {
        if (!audioCtx) {
            audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        }
        if (audioCtx.state === 'suspended') {
            audioCtx.resume();
        }
        const osc = audioCtx.createOscillator();
        const gainNode = audioCtx.createGain();
        osc.connect(gainNode);
        gainNode.connect(audioCtx.destination);

        const now = audioCtx.currentTime;

        if (type === 'success') {
            // High-pitched coin sound
            osc.type = 'sine';
            osc.frequency.setValueAtTime(587.33, now); // D5
            osc.frequency.setValueAtTime(880, now + 0.08); // A5
            gainNode.gain.setValueAtTime(0.08, now);
            gainNode.gain.exponentialRampToValueAtTime(0.0001, now + 0.25);
            osc.start(now);
            osc.stop(now + 0.25);
        } else if (type === 'warning') {
            // Alert chime
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(330, now); // E4
            osc.frequency.setValueAtTime(220, now + 0.12); // A3
            gainNode.gain.setValueAtTime(0.12, now);
            gainNode.gain.exponentialRampToValueAtTime(0.0001, now + 0.35);
            osc.start(now);
            osc.stop(now + 0.35);
        } else if (type === 'click') {
            // Short pop
            osc.type = 'sine';
            osc.frequency.setValueAtTime(600, now);
            gainNode.gain.setValueAtTime(0.03, now);
            gainNode.gain.exponentialRampToValueAtTime(0.0001, now + 0.04);
            osc.start(now);
            osc.stop(now + 0.04);
        }
    } catch (e) {
        console.warn("Sound play failed:", e);
    }
}

// Initialisation
async function init() {
    toggleLoading(true);
    loadSettings();
    loadBudgets();
    applyTheme();

    // Setup LangJS
    lang = new LangJS({
        availableLanguages: ['rw', 'rn', 'en', 'fr'],
        defaultLanguage: appSettings.lang,
        languagePath: './lang/',
        persistKey: 'menap_lang_pref',
        debug: true,
        onLanguageChange: (newLang) => {
            appSettings.lang = newLang;
            saveSettings();
            updateUIStrings();
            renderUI();
        }
    });

    try {
        await lang.init();
        updateUIStrings();
        updateProfileUI();
        
        // Draggable calculator
        const calcModal = document.getElementById('calculator-modal');
        const calcHeader = document.getElementById('calculator-drag-header');
        if (calcModal && calcHeader) {
            makeElementDraggable(calcModal, calcHeader);
        }
        
        if (!appSettings.isInitialized) {
            showOnboarding();
        } else {
            setupDateState();
            setupInteractions();
            renderUI();
            
            // Track active focused inputs for the smart calculator
            setupFocusTracker();
        }
    } catch (err) {
        console.error("Initialization failed:", err);
    } finally {
        toggleLoading(false);
    }
}

function loadSettings() {
    const saved = localStorage.getItem('menap_settings');
    if (saved) {
        appSettings = { ...appSettings, ...JSON.parse(saved) };
    }
}

function saveSettings() {
    localStorage.setItem('menap_settings', JSON.stringify(appSettings));
}

function loadBudgets() {
    const saved = localStorage.getItem('menap_budgets');
    if (saved) {
        budgets = JSON.parse(saved);
    } else {
        budgets = [];
    }
}

function saveBudgets() {
    localStorage.setItem('menap_budgets', JSON.stringify(budgets));
}

function applyTheme() {
    document.body.className = appSettings.theme === 'dark' ? 'dark-theme' : 'light-theme';
    const themeSelect = document.getElementById('theme-select');
    if (themeSelect) themeSelect.value = appSettings.theme;
}

// Removed font size helpers

function setupDateState() {
    // Current date defaults to today
    viewDate = new Date();
    updateHeaderDateLabels();
}

function updateHeaderDateLabels() {
    const yearLabel = document.getElementById('current-year');
    const monthLabel = document.getElementById('current-month');
    const dayLabel = document.getElementById('current-day');

    if (yearLabel) yearLabel.innerText = viewDate.getFullYear();
    
    // Pad month and day
    const monthStr = String(viewDate.getMonth() + 1).padStart(2, '0');
    const dayStr = String(viewDate.getDate()).padStart(2, '0');

    if (monthLabel) monthLabel.innerText = monthStr;
    if (dayLabel) dayLabel.innerText = dayStr;
}

let tempProfilePic = '';

function compressProfilePic(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = function(e) {
            const img = new Image();
            img.onload = function() {
                const canvas = document.createElement('canvas');
                canvas.width = 32;
                canvas.height = 32;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, 32, 32);
                const compressed = canvas.toDataURL('image/jpeg', 0.25);
                resolve(compressed);
            };
            img.onerror = reject;
            img.src = e.target.result;
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

// Base64 & shifting helpers for binary-gibberish and QR-data conversions
function uint8ToBase64(uint8) {
    let binary = '';
    const len = uint8.byteLength;
    for (let i = 0; i < len; i++) {
        binary += String.fromCharCode(uint8[i]);
    }
    return window.btoa(binary);
}

function base64ToUint8(base64) {
    const binary = window.atob(base64);
    const len = binary.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
        bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
}

const KEY_MAP = {
    firstName: 'fn',
    lastName: 'ln',
    email: 'em',
    lang: 'la',
    currency: 'cu',
    theme: 'th',
    soundEnabled: 'se',
    budgets: 'bu',
    id: 'id',
    name: 'na',
    startDate: 'sd',
    endDate: 'ed',
    durationType: 'dt',
    durationValue: 'dv',
    items: 'it',
    budgetedAmount: 'ba',
    isFinished: 'if',
    finishedDate: 'fd',
    purchases: 'pu',
    date: 'da',
    amount: 'am',
    qty: 'qt',
    note: 'no',
    refills: 're',
    food_suggestions: 'fs'
};

const REVERSE_KEY_MAP = {};
for (const key in KEY_MAP) {
    REVERSE_KEY_MAP[KEY_MAP[key]] = key;
}

function mapKeys(obj, map) {
    if (Array.isArray(obj)) {
        return obj.map(item => mapKeys(item, map));
    } else if (obj !== null && typeof obj === 'object') {
        const newObj = {};
        for (const key in obj) {
            if (obj.hasOwnProperty(key)) {
                const newKey = map[key] || key;
                newObj[newKey] = mapKeys(obj[key], map);
            }
        }
        return newObj;
    }
    return obj;
}

function shrinkData(obj) {
    return mapKeys(obj, KEY_MAP);
}

function expandData(obj) {
    return mapKeys(obj, REVERSE_KEY_MAP);
}

function encryptProfile(profileObj) {
    const json = JSON.stringify(profileObj);
    let encoded = '';
    for (let i = 0; i < json.length; i++) {
        encoded += String.fromCharCode(json.charCodeAt(i) + 5);
    }
    return btoa(unescape(encodeURIComponent(encoded)));
}

function decryptProfile(encryptedStr) {
    const decoded = decodeURIComponent(escape(atob(encryptedStr)));
    let decrypted = '';
    for (let i = 0; i < decoded.length; i++) {
        decrypted += String.fromCharCode(decoded.charCodeAt(i) - 5);
    }
    return JSON.parse(decrypted);
}

function updateProfileUI() {
    const p = appSettings.profile || { firstName: '', lastName: '', email: '', photo: '' };
    
    const drawerName = document.getElementById('drawer-profile-name');
    const drawerEmail = document.getElementById('drawer-profile-email');
    const drawerAvatar = document.getElementById('drawer-avatar');
    const drawerAvatarFallback = document.getElementById('drawer-avatar-fallback');

    if (p.firstName) {
        if (drawerName) drawerName.innerText = `${p.firstName} ${p.lastName}`;
        if (drawerEmail) drawerEmail.innerText = p.email;
        if (drawerAvatar && p.photo) {
            drawerAvatar.src = p.photo;
            drawerAvatar.style.display = 'block';
            if (drawerAvatarFallback) drawerAvatarFallback.style.display = 'none';
        } else {
            if (drawerAvatar) drawerAvatar.style.display = 'none';
            if (drawerAvatarFallback) drawerAvatarFallback.style.display = 'flex';
        }
    }

    const settingsName = document.getElementById('settings-profile-name');
    const settingsEmail = document.getElementById('settings-profile-email');
    const settingsPic = document.getElementById('settings-profile-pic');
    const settingsPicFallback = document.getElementById('settings-profile-pic-fallback');

    if (p.firstName) {
        if (settingsName) settingsName.innerText = `${p.firstName} ${p.lastName}`;
        if (settingsEmail) settingsEmail.innerText = p.email;
        if (settingsPic && p.photo) {
            settingsPic.src = p.photo;
            settingsPic.style.display = 'block';
            if (settingsPicFallback) settingsPicFallback.style.display = 'none';
        } else {
            if (settingsPic) settingsPic.style.display = 'none';
            if (settingsPicFallback) settingsPicFallback.style.display = 'flex';
        }
    }
}

function generateProfileQRCode() {
    const p = appSettings.profile;
    if (!p || !p.firstName) {
        alert("Profil incomplet.");
        return;
    }
    
    // Simple QR Code payload without photo to ensure high scannability and avoid density issues
    const qrData = {
        firstName: p.firstName,
        lastName: p.lastName,
        email: p.email,
        lang: appSettings.lang,
        currency: appSettings.currency,
        theme: appSettings.theme,
        soundEnabled: appSettings.soundEnabled,
        budgets: budgets,
        food_suggestions: JSON.parse(localStorage.getItem('menap_food_suggestions') || '[]').slice(0, 15)
    };

    const shrunken = shrinkData(qrData);
    const jsonStr = JSON.stringify(shrunken);
    const encryptedBytes = encryptData(jsonStr);
    const encryptedStr = uint8ToBase64(encryptedBytes);
    
    const container = document.getElementById('settings-qr-container');
    const qrcodeDiv = document.getElementById('qrcode');
    
    if (container && qrcodeDiv) {
        qrcodeDiv.innerHTML = '';
        container.style.display = 'flex';
        
        try {
            new QRCode(qrcodeDiv, {
                text: encryptedStr,
                width: 256,
                height: 256,
                colorDark : "#0f766e",
                colorLight : "#ffffff",
                correctLevel : QRCode.CorrectLevel.M
            });
            playSound('success');
        } catch (error) {
            console.error("QR Code generation error:", error);
            alert("Erreur lors de la génération du QR Code.");
        }
    }
}

function downloadProfileQRCode() {
    const qrcodeDiv = document.getElementById('qrcode');
    if (!qrcodeDiv) return;
    const img = qrcodeDiv.querySelector('img');
    if (img && img.src) {
        const a = document.createElement('a');
        a.href = img.src;
        a.download = `menap_auth_qrcode.png`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        playSound('success');
    } else {
        const canvas = qrcodeDiv.querySelector('canvas');
        if (canvas) {
            const a = document.createElement('a');
            a.href = canvas.toDataURL('image/png');
            a.download = `menap_auth_qrcode.png`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            playSound('success');
        } else {
            alert("Veuillez générer le QR Code.");
        }
    }
}

function generateLogoutQRCode() {
    const p = appSettings.profile;
    
    const qrData = {
        firstName: p ? p.firstName : '',
        lastName: p ? p.lastName : '',
        email: p ? p.email : '',
        lang: appSettings.lang,
        currency: appSettings.currency,
        theme: appSettings.theme,
        soundEnabled: appSettings.soundEnabled,
        budgets: budgets,
        food_suggestions: JSON.parse(localStorage.getItem('menap_food_suggestions') || '[]').slice(0, 15)
    };

    const shrunken = shrinkData(qrData);
    const jsonStr = JSON.stringify(shrunken);
    const encryptedBytes = encryptData(jsonStr);
    const encryptedStr = uint8ToBase64(encryptedBytes);
    
    const displayDiv = document.getElementById('logout-qr-display');
    const qrcodeDiv = document.getElementById('logout-qrcode');
    
    if (displayDiv && qrcodeDiv) {
        qrcodeDiv.innerHTML = '';
        displayDiv.style.display = 'flex';
        
        try {
            new QRCode(qrcodeDiv, {
                text: encryptedStr,
                width: 256,
                height: 256,
                colorDark : "#0f766e",
                colorLight : "#ffffff",
                correctLevel : QRCode.CorrectLevel.M
            });
            playSound('success');
        } catch (error) {
            console.error("Logout QR Code generation error:", error);
            alert("Erreur lors de la génération du QR Code.");
        }
    }
}

function downloadLogoutQRCode() {
    const qrcodeDiv = document.getElementById('logout-qrcode');
    if (!qrcodeDiv) return;
    const img = qrcodeDiv.querySelector('img');
    if (img && img.src) {
        const a = document.createElement('a');
        a.href = img.src;
        a.download = `menap_auth_qrcode.png`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        playSound('success');
    } else {
        const canvas = qrcodeDiv.querySelector('canvas');
        if (canvas) {
            const a = document.createElement('a');
            a.href = canvas.toDataURL('image/png');
            a.download = `menap_auth_qrcode.png`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            playSound('success');
        } else {
            alert("Veuillez d'abord générer le QR Code.");
        }
    }
}

// Onboarding wizard
function showOnboarding() {
    const onboarding = document.getElementById('onboarding-screen');
    if (onboarding) {
        onboarding.classList.remove('hidden');
        
        // Setup initial selects
        document.getElementById('setup-lang-select').value = appSettings.lang;
        document.getElementById('setup-currency-select').value = appSettings.currency;
        
        // Tab switching
        const tabCreate = document.getElementById('tab-onboard-create');
        const tabQR = document.getElementById('tab-onboard-qr');
        const sectionCreate = document.getElementById('onboard-create-section');
        const sectionQR = document.getElementById('onboard-qr-section');

        if (tabCreate && tabQR) {
            tabCreate.onclick = () => {
                playSound('click');
                tabCreate.classList.add('active');
                tabQR.classList.remove('active');
                sectionCreate.classList.remove('hidden');
                sectionQR.classList.add('hidden');
            };
            tabQR.onclick = () => {
                playSound('click');
                tabQR.classList.add('active');
                tabCreate.classList.remove('active');
                sectionQR.classList.remove('hidden');
                sectionCreate.classList.add('hidden');
            };
        }

        // Photo loading
        const picInput = document.getElementById('profile-pic-input');
        const picPreview = document.getElementById('profile-pic-preview');
        if (picInput && picPreview) {
            picInput.onchange = async (e) => {
                if (e.target.files.length > 0) {
                    try {
                        toggleLoading(true);
                        tempProfilePic = await compressProfilePic(e.target.files[0]);
                        picPreview.innerHTML = `<img src="${tempProfilePic}" style="width: 100%; height: 100%; object-fit: cover;">`;
                        playSound('success');
                    } catch (err) {
                        alert("Erreur de photo.");
                    } finally {
                        toggleLoading(false);
                    }
                }
            };
        }

        // QR / DEM image/file import in onboarding
        const qrInput = document.getElementById('onboard-qr-input');
        if (qrInput) {
            qrInput.onchange = (e) => {
                if (e.target.files.length > 0) {
                    handleImportFile(e.target.files[0]);
                }
            };
        }

        document.getElementById('setup-start-btn').onclick = () => {
            const chosenLang = document.getElementById('setup-lang-select').value;
            const chosenCurr = document.getElementById('setup-currency-select').value;
            const firstName = document.getElementById('profile-first-name').value.trim();
            const lastName = document.getElementById('profile-last-name').value.trim();
            const email = document.getElementById('profile-email').value.trim();

            if (!firstName || !lastName || !email) {
                alert("Veuillez remplir le profil.");
                return;
            }
            
            appSettings.lang = chosenLang;
            appSettings.currency = chosenCurr;
            appSettings.isInitialized = true;
            appSettings.profile = {
                firstName,
                lastName,
                email,
                photo: tempProfilePic
            };
            
            saveSettings();
            
            toggleLoading(true);
            lang.setLanguage(chosenLang).then(() => {
                onboarding.classList.add('hidden');
                setupDateState();
                setupInteractions();
                renderUI();
                updateProfileUI();
                toggleLoading(false);
            }).catch(() => {
                toggleLoading(false);
            });
        };
    }
}

// Sync UI inputs with loaded settings
function updateUIStrings() {
    const themeSelect = document.getElementById('theme-select');
    if (themeSelect) themeSelect.value = appSettings.theme;

    const langSelect = document.getElementById('lang-select');
    if (langSelect) langSelect.value = appSettings.lang;

    const currencySelect = document.getElementById('currency-select');
    if (currencySelect) currencySelect.value = appSettings.currency;
}

function formatCurrency(val) {
    const curr = appSettings.currency || 'RWF';
    if (curr === 'RWF') return val.toLocaleString() + ' FRw';
    if (curr === 'BIF') return val.toLocaleString() + ' FBu';
    if (curr === 'USD') return '$' + val.toLocaleString();
    if (curr === 'EUR') return val.toLocaleString() + ' €';
    return val.toLocaleString() + ' ' + curr;
}

function formatDateString(dateStr) {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    
    // Return formatted string based on language
    const options = { year: 'numeric', month: '2-digit', day: '2-digit' };
    return d.toLocaleDateString(appSettings.lang, options);
}

// Calculate the end date of a budget based on start date and duration
function getBudgetEndDate(startDateStr, durationType, durationVal) {
    const start = new Date(startDateStr);
    const end = new Date(start);
    const val = parseInt(durationVal) || 1;

    switch (durationType) {
        case 'day':
            end.setDate(start.getDate() + val);
            break;
        case 'week':
            end.setDate(start.getDate() + val * 7);
            break;
        case 'month':
            end.setMonth(start.getMonth() + val);
            break;
        case 'year':
            end.setFullYear(start.getFullYear() + val);
            break;
    }
    // End date is exclusive or inclusive depending on interpretation. 
    // We treat duration as ending exactly X units later.
    return end;
}

// Compute metrics for a budget relative to a reference date
function getBudgetMetrics(budget, refDate) {
    const start = new Date(budget.startDate);
    const end = getBudgetEndDate(budget.startDate, budget.durationType, budget.durationValue);
    
    // Strip time portions for day-based comparison
    start.setHours(0,0,0,0);
    end.setHours(0,0,0,0);
    
    const rDate = new Date(refDate);
    rDate.setHours(0,0,0,0);

    const totalTime = end.getTime() - start.getTime();
    const elapsedMs = rDate.getTime() - start.getTime();

    let timeProgress = 0;
    let daysElapsed = 0;
    const totalDays = Math.round(totalTime / (1000 * 60 * 60 * 24));

    if (elapsedMs > 0) {
        if (rDate >= end) {
            timeProgress = 100;
            daysElapsed = totalDays;
        } else {
            daysElapsed = Math.round(elapsedMs / (1000 * 60 * 60 * 24));
            timeProgress = (elapsedMs / totalTime) * 100;
        }
    }

    // Calculations for spent amount
    let totalBudgeted = 0;
    let totalSpent = 0;
    let itemsExhaustedCount = 0;
    const exhaustedItemsList = [];

    budget.items && budget.items.forEach(item => {
        totalBudgeted += parseFloat(item.budgetedAmount) || 0;
        
        let itemSpent = 0;
        item.purchases && item.purchases.forEach(p => {
            const pDate = new Date(p.date);
            pDate.setHours(0,0,0,0);
            
            // Count purchases made on or before the reference date
            if (pDate <= rDate) {
                itemSpent += parseFloat(p.amount) || 0;
            }
        });
        
        totalSpent += itemSpent;

        // Check if item finished early as of reference date
        if (item.isFinished && item.finishedDate) {
            const fDate = new Date(item.finishedDate);
            fDate.setHours(0,0,0,0);
            
            if (fDate <= rDate && fDate < end) {
                itemsExhaustedCount++;
                exhaustedItemsList.push({
                    id: item.id,
                    name: item.name,
                    date: item.finishedDate
                });
            }
        }
    });

    let spentProgress = 0;
    if (totalBudgeted > 0) {
        spentProgress = (totalSpent / totalBudgeted) * 100;
    }

    // Status: active, ended, not_started
    let status = 'active';
    if (rDate < start) {
        status = 'not_started';
    } else if (rDate >= end) {
        status = 'ended';
    }

    const remaining = totalBudgeted - totalSpent;

    return {
        startDate: start,
        endDate: end,
        totalDays,
        daysElapsed,
        timeProgress,
        totalBudgeted,
        totalSpent,
        spentProgress,
        remaining,
        itemsExhaustedCount,
        exhaustedItemsList,
        status
    };
}

// Rendering UI Views
function renderUI() {
    toggleLoading(false);
    if (currentView === 'dashboard') {
        renderDashboard();
    } else if (currentView === 'budget_detail') {
        renderBudgetDetail();
    }
}

function renderDashboard() {
    const mainContent = document.getElementById('main-content');
    if (!mainContent) return;

    // Filter budgets that overlap with the selected year and month
    const activeYear = viewDate.getFullYear();
    const activeMonth = viewDate.getMonth(); // 0-11

    const monthlyBudgets = budgets.filter(b => {
        const start = new Date(b.startDate);
        const end = getBudgetEndDate(b.startDate, b.durationType, b.durationValue);
        
        // Year overlaps
        const startYear = start.getFullYear();
        const endYear = end.getFullYear();
        
        if (activeYear < startYear || activeYear > endYear) return false;
        
        // Month overlaps
        // Create boundaries for selected month
        const monthStart = new Date(activeYear, activeMonth, 1);
        const monthEnd = new Date(activeYear, activeMonth + 1, 0, 23, 59, 59);

        return start <= monthEnd && end >= monthStart;
    });

    // Check if viewDate corresponds to today's date in local time
    const isToday = viewDate.toDateString() === new Date().toDateString();

    // Compute aggregate metrics
    let aggBudgeted = 0;
    let aggSpent = 0;
    let aggRemaining = 0;
    let aggExhaustedCount = 0;
    const allExhaustedItems = [];

    monthlyBudgets.forEach(b => {
        const m = getBudgetMetrics(b, viewDate);
        aggBudgeted += m.totalBudgeted;
        aggSpent += m.totalSpent;
        aggRemaining += m.remaining;
        aggExhaustedCount += m.itemsExhaustedCount;
        m.exhaustedItemsList.forEach(item => {
            allExhaustedItems.push({
                budgetId: b.id,
                itemId: item.id,
                budgetName: b.name,
                itemName: item.name,
                date: item.date
            });
        });
    });

    let html = `
        <div class="dashboard-view">
            <div class="viewing-date-banner">
                <span><i class="fas fa-calendar-alt"></i> <span translate="dashboard.viewing_status">Viewing status for:</span></span>
                <strong>${viewDate.getFullYear()}-${String(viewDate.getMonth()+1).padStart(2,'0')}-${String(viewDate.getDate()).padStart(2,'0')}</strong>
            </div>

            <!-- Summary metrics -->
            <div class="summary-cards">
                <div class="metric-card success-card">
                    <div class="metric-header">
                        <span translate="item.budgeted">Budgeted</span>
                        <i class="fas fa-money-bill-wave"></i>
                    </div>
                    <div class="metric-value">${formatCurrency(aggBudgeted)}</div>
                    <div class="metric-label" translate="nav.dashboard">Dashboard</div>
                </div>

                <div class="metric-card">
                    <div class="metric-header">
                        <span translate="item.spent">Spent</span>
                        <i class="fas fa-shopping-cart"></i>
                    </div>
                    <div class="metric-value">${formatCurrency(aggSpent)}</div>
                    <div class="metric-label">${lang.get('dashboard.spent_vs_budget', { spent: '', budget: '' }).replace(/^[^\d]*/, '')}</div>
                </div>

                <div class="metric-card">
                    <div class="metric-header">
                        <span translate="dashboard.remaining">Remaining</span>
                        <i class="fas fa-wallet"></i>
                    </div>
                    <div class="metric-value" style="color: ${aggRemaining < 0 ? 'var(--danger-color)' : 'var(--text-color)'}">${formatCurrency(aggRemaining)}</div>
                    <div class="metric-label" translate="dashboard.remaining">Remaining</div>
                </div>

                <div class="metric-card ${aggExhaustedCount > 0 ? 'alert-card' : ''}">
                    <div class="metric-header">
                        <span translate="dashboard.exhausted_early">Exhausted</span>
                        <i class="fas fa-exclamation-triangle"></i>
                    </div>
                    <div class="metric-value" style="color: ${aggExhaustedCount > 0 ? 'var(--danger-color)' : 'var(--text-color)'}">${aggExhaustedCount}</div>
                    <div class="metric-label" translate="dashboard.exhausted_early">Exhausted Early</div>
                </div>
            </div>
    `;

    // Warning Banner if any items ran out early
    if (allExhaustedItems.length > 0) {
        html += `
            <div class="warning-banner">
                <i class="fas fa-exclamation-triangle"></i>
                <div>
                    <div class="warning-banner-title">${lang.get('dashboard.items_exhausted_warning', { count: allExhaustedItems.length })}</div>
                    <ul class="warning-banner-list" style="list-style-type: none; margin-left: 0;">
        `;
        allExhaustedItems.forEach(item => {
            html += `
                <li style="display: flex; justify-content: space-between; align-items: center; gap: 10px; margin-bottom: 8px; flex-wrap: wrap;">
                    <span><strong>${item.itemName}</strong> (${item.budgetName}) - ${lang.get('item.exhausted_date', { date: formatDateString(item.date) })}</span>
                    <button class="backup-btn" style="padding: 4px 8px; font-size: 11px; width: auto; margin: 0; display: inline-flex;" onclick="openRefillModalFromDashboard('${item.itemId}', '${item.budgetId}')">
                        <i class="fas fa-redo"></i> <span translate="item.refill_btn">Refill</span>
                    </button>
                </li>
            `;
        });
        html += `
                    </ul>
                </div>
            </div>
        `;
    }

    // Budgets List
    html += `
        <div class="section-title">
            <span translate="dashboard.active_budgets">Active Budgets</span>
        </div>
        <div class="budgets-list-container">
    `;

    if (monthlyBudgets.length === 0) {
        html += `
            <div class="empty-state">
                <i class="fas fa-folder-open empty-state-icon"></i>
                <p translate="dashboard.no_budgets">No active budgets for the selected date. Click below to plan one!</p>
                <button id="dashboard-create-btn" class="primary-btn" style="max-width: 250px;" translate="dashboard.create_btn">Create New Budget</button>
            </div>
        `;
    } else {
        monthlyBudgets.forEach(b => {
            const metrics = getBudgetMetrics(b, viewDate);
            
            // Format status badge
            let statusBadgeClass = 'active';
            let statusTextKey = 'item.active';
            if (metrics.status === 'ended') {
                statusBadgeClass = 'danger';
                statusTextKey = 'selection.close';
            } else if (metrics.status === 'not_started') {
                statusBadgeClass = 'warning';
                statusTextKey = 'item.active';
            }

            // Duration and progress labels
            const timeLabel = lang.get('dashboard.days_elapsed', { elapsed: metrics.daysElapsed, total: metrics.totalDays });
            const spentLabel = lang.get('dashboard.spent_vs_budget', { spent: formatCurrency(metrics.totalSpent), budget: formatCurrency(metrics.totalBudgeted) });

            html += `
                <div class="budget-card" onclick="viewBudgetDetail('${b.id}')">
                    <div class="budget-card-header">
                        <div>
                            <div class="budget-card-title">${b.name}</div>
                            <div class="budget-card-dates">${formatDateString(b.startDate)} - ${formatDateString(metrics.endDate.toISOString().split('T')[0])}</div>
                        </div>
                        <span class="badge ${statusBadgeClass}">
                            ${metrics.status === 'active' ? 'Active' : (metrics.status === 'ended' ? 'Ended' : 'Pending')}
                        </span>
                    </div>

                    ${isToday ? `
                    <!-- Time Progress -->
                    <div class="progress-container">
                        <div class="progress-label-row">
                            <span translate="dashboard.progression">Time Progress</span>
                            <span>${Math.round(metrics.timeProgress)}%</span>
                        </div>
                        <div class="progress-track">
                            <div class="progress-fill primary" style="width: ${metrics.timeProgress}%"></div>
                        </div>
                        <div style="font-size: 11px; color: var(--text-muted); margin-top: 2px;">${timeLabel}</div>
                    </div>

                    <!-- Spending Progress -->
                    <div class="progress-container" style="margin-top: 12px;">
                        <div class="progress-label-row">
                            <span translate="dashboard.amount_spent">Spending Progress</span>
                            <span>${Math.round(metrics.spentProgress)}%</span>
                        </div>
                        <div class="progress-track">
                            <div class="progress-fill ${metrics.spentProgress > 100 ? 'danger' : 'success'}" style="width: ${Math.min(metrics.spentProgress, 100)}%"></div>
                        </div>
                        <div style="font-size: 11px; color: var(--text-muted); margin-top: 2px;">${spentLabel}</div>
                    </div>
                    ` : ''}

                    ${metrics.itemsExhaustedCount > 0 ? `
                        <div style="font-size: 12px; color: var(--danger-color); font-weight: 700; margin-top: 10px; display: flex; align-items: center; gap: 6px;">
                            <i class="fas fa-exclamation-circle"></i>
                            <span>${lang.get('item.exhausted') || 'Exhausted!'} (${metrics.itemsExhaustedCount})</span>
                        </div>
                    ` : ''}
                </div>
            `;
        });

        // Floating Action Button
        html += `
            <div id="fab-add-budget" class="fab" title="${lang.get('dashboard.create_btn')}">
                <i class="fas fa-plus"></i>
            </div>
        `;
    }

    html += `
        </div>
    </div>
    `;

    mainContent.innerHTML = html;

    // Attach listeners
    const createBtn = document.getElementById('dashboard-create-btn');
    if (createBtn) createBtn.onclick = () => openBudgetModal();

    const fab = document.getElementById('fab-add-budget');
    if (fab) fab.onclick = () => openBudgetModal();

    lang.translatePage();
}

function renderBudgetDetail() {
    const mainContent = document.getElementById('main-content');
    if (!mainContent || !activeBudget) return;

    const metrics = getBudgetMetrics(activeBudget, viewDate);

    // Days indicator text
    let daysLabel = '';
    const today = new Date(viewDate);
    today.setHours(0,0,0,0);
    const start = new Date(activeBudget.startDate);
    start.setHours(0,0,0,0);
    const end = new Date(metrics.endDate);
    end.setHours(0,0,0,0);

    if (today < start) {
        const diff = Math.round((start - today) / (1000 * 60 * 60 * 24));
        daysLabel = lang.get('budget.not_started', { count: diff });
    } else if (today > end) {
        const diff = Math.round((today - end) / (1000 * 60 * 60 * 24));
        daysLabel = lang.get('budget.days_over', { count: diff });
    } else {
        const diff = Math.round((end - today) / (1000 * 60 * 60 * 24));
        daysLabel = lang.get('budget.days_left', { count: diff });
    }

    let html = `
        <div class="budget-detail-view">
            <div class="back-btn-container">
                <button class="back-btn" onclick="goBackToDashboard()"><i class="fas fa-arrow-left"></i> <span translate="nav.dashboard">Dashboard</span></button>
            </div>

            <!-- Details Card -->
            <div class="budget-detail-header-card">
                <div class="budget-detail-title-row">
                    <span class="budget-detail-title">${activeBudget.name}</span>
                    <span class="budget-duration-badge">${activeBudget.durationValue} ${lang.get('budget.duration_' + activeBudget.durationType)}</span>
                </div>
                <div style="font-size: 13px; color: var(--text-muted); margin-bottom: 15px;">
                    <i class="far fa-calendar-alt"></i> ${formatDateString(activeBudget.startDate)} - ${formatDateString(activeBudget.endDate)}
                </div>

                <!-- Time progress inside detail -->
                <div class="progress-container">
                    <div class="progress-label-row">
                        <span translate="dashboard.progression">Time Progress</span>
                        <span>${Math.round(metrics.timeProgress)}%</span>
                    </div>
                    <div class="progress-track">
                        <div class="progress-fill primary" style="width: ${metrics.timeProgress}%"></div>
                    </div>
                    <div style="font-size: 11px; color: var(--text-muted); margin-top: 4px; display: flex; justify-content: space-between;">
                        <span>${lang.get('dashboard.days_elapsed', { elapsed: metrics.daysElapsed, total: metrics.totalDays })}</span>
                        <strong>${daysLabel}</strong>
                    </div>
                </div>

                <!-- Stats Grid -->
                <div class="budget-stats-grid">
                    <div class="budget-stat-item">
                        <span class="budget-stat-label" translate="item.budgeted">Budgeted</span>
                        <span class="budget-stat-val" style="color: var(--primary-color);">${formatCurrency(metrics.totalBudgeted)}</span>
                    </div>
                    <div class="budget-stat-item">
                        <span class="budget-stat-label" translate="item.spent">Spent</span>
                        <span class="budget-stat-val">${formatCurrency(metrics.totalSpent)}</span>
                    </div>
                    <div class="budget-stat-item">
                        <span class="budget-stat-label" translate="dashboard.remaining">Remaining</span>
                        <span class="budget-stat-val" style="color: ${metrics.remaining < 0 ? 'var(--danger-color)' : 'var(--text-color)'}">${formatCurrency(metrics.remaining)}</span>
                    </div>
                </div>
            </div>

            <!-- Food Items -->
            <div class="section-title">
                <span translate="budget.items">Food Items</span>
                <button class="backup-btn" style="padding: 6px 12px; font-size: 12px; width: auto;" onclick="openItemModal()"><i class="fas fa-plus"></i> <span translate="budget.add_item">Add Food</span></button>
            </div>
            <div class="food-items-container">
    `;

    if (!activeBudget.items || activeBudget.items.length === 0) {
        html += `
            <div class="empty-state">
                <i class="fas fa-carrot empty-state-icon"></i>
                <p translate="budget.no_items">No food items added to this budget yet.</p>
                <button class="primary-btn" style="max-width: 200px;" onclick="openItemModal()" translate="budget.add_item">Add Food</button>
            </div>
        `;
    } else {
        activeBudget.items.forEach(item => {
            // Calculate spent for this item as of active date
            let itemSpent = 0;
            item.purchases && item.purchases.forEach(p => {
                const pDate = new Date(p.date);
                pDate.setHours(0,0,0,0);
                if (pDate <= today) {
                    itemSpent += parseFloat(p.amount) || 0;
                }
            });

            const budgeted = parseFloat(item.budgetedAmount) || 0;
            let percent = 0;
            if (budgeted > 0) {
                percent = (itemSpent / budgeted) * 100;
            }

            // Check if exhausted
            const isExhaustedNow = item.isFinished && item.finishedDate && (new Date(item.finishedDate).setHours(0,0,0,0) <= today.getTime());

            html += `
                <div class="food-item-card ${isExhaustedNow ? 'exhausted' : ''}">
                    <div class="food-item-header">
                        <div>
                            <span class="food-item-name">${item.name}</span>
                            ${isExhaustedNow ? `
                                <span class="badge danger" style="margin-left: 8px;" translate="item.exhausted">Exhausted Early!</span>
                            ` : `
                                <span class="badge active" style="margin-left: 8px;" translate="item.active">Available</span>
                            `}
                        </div>
                        <div class="food-item-actions">
                            ${isExhaustedNow ? `
                            <button class="item-action-btn" style="color: var(--accent-color); border-color: var(--accent-color);" title="${lang.get('item.refill_btn')}" onclick="openRefillModal('${item.id}')">
                                <i class="fas fa-redo"></i>
                            </button>
                            ` : ''}
                            <button class="item-action-btn" title="${lang.get('item.add_purchase')}" onclick="openPurchaseModal('${item.id}')">
                                <i class="fas fa-plus"></i>
                            </button>
                            <button class="item-action-btn" title="${lang.get('item.purchases_title')}" onclick="viewPurchasesList('${item.id}')">
                                <i class="fas fa-receipt"></i>
                            </button>
                            <button class="item-action-btn" style="${isExhaustedNow ? 'color: var(--danger-color);' : ''}" title="${lang.get('item.mark_exhausted')}" onclick="toggleItemFinished('${item.id}')">
                                <i class="fas fa-check-circle"></i>
                            </button>
                            <button class="item-action-btn delete-btn" title="${lang.get('item.delete')}" onclick="deleteFoodItem('${item.id}')">
                                <i class="fas fa-trash"></i>
                            </button>
                        </div>
                    </div>

                    <!-- Progress bar -->
                    <div class="progress-container" style="margin-bottom: 0;">
                        <div class="progress-label-row" style="font-size: 11px;">
                            <span>${formatCurrency(itemSpent)} / ${formatCurrency(budgeted)}</span>
                            <span>${Math.round(percent)}%</span>
                        </div>
                        <div class="progress-track" style="height: 6px;">
                            <div class="progress-fill ${percent > 100 ? 'danger' : 'success'}" style="width: ${Math.min(percent, 100)}%"></div>
                        </div>
                    </div>
                    
                    ${isExhaustedNow ? `
                        <div class="exhaust-date-label">${lang.get('item.exhausted_date', { date: formatDateString(item.finishedDate) })}</div>
                    ` : ''}
                </div>
            `;
        });
    }

    // Danger Zone / Delete Budget
    html += `
            </div>
            
            <button class="danger-btn-alt" onclick="deleteActiveBudget()"><i class="fas fa-trash"></i> <span translate="budget.delete">Delete Budget</span></button>
        </div>
    `;

    mainContent.innerHTML = html;
    lang.translatePage();
}

function goBackToDashboard() {
    currentView = 'dashboard';
    activeBudget = null;
    renderUI();
}

function viewBudgetDetail(budgetId) {
    const b = budgets.find(x => x.id === budgetId);
    if (b) {
        activeBudget = b;
        currentView = 'budget_detail';
        renderUI();
    }
}

// Dialog Actions
function openBudgetModal() {
    const modal = document.getElementById('budget-modal');
    if (!modal) return;

    // Reset inputs
    document.getElementById('budget-name').value = '';
    // Default to selected date
    const dateInput = document.getElementById('budget-start-date');
    const viewDateStr = viewDate.toISOString().split('T')[0];
    dateInput.value = viewDateStr;

    modal.classList.add('show');
}

function openItemModal() {
    const modal = document.getElementById('item-modal');
    if (!modal) return;
    document.getElementById('item-name').value = '';
    document.getElementById('item-budgeted').value = '';
    
    // Load and render suggestions from previous foods
    const sugContainer = document.getElementById('item-suggestions');
    if (sugContainer) {
        sugContainer.innerHTML = '';
        const suggestions = JSON.parse(localStorage.getItem('menap_food_suggestions') || '[]');
        suggestions.slice(0, 8).forEach(s => {
            const span = document.createElement('span');
            span.className = 'suggestion-tag';
            span.innerText = s;
            span.onclick = () => {
                document.getElementById('item-name').value = s;
                document.getElementById('item-budgeted').focus();
            };
            sugContainer.appendChild(span);
        });
    }

    modal.classList.add('show');
}

function openPurchaseModal(itemId) {
    selectedFoodItemForPurchase = itemId;
    const modal = document.getElementById('purchase-modal');
    if (!modal) return;
    
    // Reset inputs
    const viewDateStr = viewDate.toISOString().split('T')[0];
    document.getElementById('purchase-date').value = viewDateStr;
    document.getElementById('purchase-amount').value = '';
    document.getElementById('purchase-qty').value = '';
    document.getElementById('purchase-note').value = '';
    
    modal.classList.add('show');
}

// Data Manipulations
function createOrUpdateBudget() {
    const nameInput = document.getElementById('budget-name');
    const startInput = document.getElementById('budget-start-date');
    const durationType = document.getElementById('budget-duration-type').value;
    const durationVal = parseInt(document.getElementById('budget-duration-val').value) || 1;

    const name = nameInput.value.trim();
    const startDate = startInput.value;

    if (!name || !startDate) {
        alert(appSettings.lang === 'fr' ? 'Veuillez remplir tous les champs.' : 'Tafadhali jaza nafasi zote.');
        return;
    }

    // Calculate end date
    const end = getBudgetEndDate(startDate, durationType, durationVal);
    const endDate = end.toISOString().split('T')[0];

    const newBudget = {
        id: 'b-' + Date.now(),
        name,
        startDate,
        endDate,
        durationType,
        durationValue: durationVal,
        items: []
    };

    budgets.push(newBudget);
    saveBudgets();
    playSound('success');
    
    // Automatically update active view date to new budget start date
    // so it shows up in real time without refreshing
    viewDate = new Date(startDate);
    updateHeaderDateLabels();
    
    // Close modal
    document.getElementById('budget-modal').classList.remove('show');
    
    // Reload dashboard
    renderUI();
}

function addFoodItem() {
    if (!activeBudget) return;
    const nameInput = document.getElementById('item-name');
    const budgetedInput = document.getElementById('item-budgeted');

    const name = nameInput.value.trim();
    const budgetedAmount = parseFloat(budgetedInput.value) || 0;

    if (!name || budgetedAmount <= 0) {
        alert(appSettings.lang === 'fr' ? 'Veuillez saisir un nom et un montant valides.' : 'Jaza izina n\'amafaranga yabyo.');
        return;
    }

    // Store unique food name for suggestions
    let suggestions = JSON.parse(localStorage.getItem('menap_food_suggestions') || '[]');
    if (!suggestions.includes(name)) {
        suggestions.push(name);
        localStorage.setItem('menap_food_suggestions', JSON.stringify(suggestions));
    }

    const newItem = {
        id: 'i-' + Date.now(),
        name,
        budgetedAmount,
        isFinished: false,
        finishedDate: null,
        purchases: []
    };

    // Find budget in array and push
    const idx = budgets.findIndex(x => x.id === activeBudget.id);
    if (idx !== -1) {
        budgets[idx].items.push(newItem);
        activeBudget = budgets[idx]; // Update reference
        saveBudgets();
        playSound('success');
    }

    document.getElementById('item-modal').classList.remove('show');
    renderUI();
}

function deleteFoodItem(itemId) {
    if (!activeBudget) return;
    
    const confirmMsg = appSettings.lang === 'fr' ? 'Supprimer cet aliment ?' : 'Gusiba iki kiribwa ?';
    if (!confirm(confirmMsg)) return;
    playSound('click');

    const bIdx = budgets.findIndex(x => x.id === activeBudget.id);
    if (bIdx !== -1) {
        budgets[bIdx].items = budgets[bIdx].items.filter(item => item.id !== itemId);
        activeBudget = budgets[bIdx];
        saveBudgets();
        renderUI();
    }
}

function toggleItemFinished(itemId) {
    if (!activeBudget) return;

    const bIdx = budgets.findIndex(x => x.id === activeBudget.id);
    if (bIdx !== -1) {
        const itemIdx = budgets[bIdx].items.findIndex(item => item.id === itemId);
        if (itemIdx !== -1) {
            const item = budgets[bIdx].items[itemIdx];
            
            // Toggle
            if (item.isFinished) {
                item.isFinished = false;
                item.finishedDate = null;
                playSound('success');
            } else {
                item.isFinished = true;
                item.finishedDate = viewDate.toISOString().split('T')[0];
                playSound('warning');
            }

            activeBudget = budgets[bIdx];
            saveBudgets();
            renderUI();
        }
    }
}

function addPurchase() {
    if (!activeBudget || !selectedFoodItemForPurchase) return;
    
    const date = document.getElementById('purchase-date').value;
    const amount = parseFloat(document.getElementById('purchase-amount').value) || 0;
    const qty = document.getElementById('purchase-qty').value.trim();
    const note = document.getElementById('purchase-note').value.trim();

    if (!date || amount <= 0) {
        alert(appSettings.lang === 'fr' ? 'Montant invalide.' : 'Ingano y\'amafaranga ntiyemewe.');
        return;
    }

    const newPurchase = {
        id: 'p-' + Date.now(),
        date,
        amount,
        qty,
        note
    };

    const bIdx = budgets.findIndex(x => x.id === activeBudget.id);
    if (bIdx !== -1) {
        const itemIdx = budgets[bIdx].items.findIndex(item => item.id === selectedFoodItemForPurchase);
        if (itemIdx !== -1) {
            budgets[bIdx].items[itemIdx].purchases.push(newPurchase);
            activeBudget = budgets[bIdx];
            saveBudgets();
            playSound('success');
        }
    }

    document.getElementById('purchase-modal').classList.remove('show');
    selectedFoodItemForPurchase = null;
    renderUI();
}

// Ravitaillement / Refill Stock reactivation logic
function openRefillModal(itemId) {
    playSound('click');
    selectedFoodItemForRefill = itemId;
    const modal = document.getElementById('refill-modal');
    if (!modal) return;
    document.getElementById('refill-amount').value = '';
    document.getElementById('refill-qty').value = '';
    document.getElementById('refill-note').value = 'Ravitaillement';
    modal.classList.add('show');
    
    setTimeout(() => {
        // Track the refill input focused
        window.activeCalculatorInput = 'refill-amount';
    }, 100);
}

function saveRefill() {
    if (!activeBudget || !selectedFoodItemForRefill) return;
    
    const amount = parseFloat(document.getElementById('refill-amount').value) || 0;
    const qty = document.getElementById('refill-qty').value.trim();
    const note = document.getElementById('refill-note').value.trim();

    if (amount <= 0) {
        alert(appSettings.lang === 'fr' ? 'Montant invalide.' : 'Ingano y\'amafaranga ntiyemewe.');
        return;
    }

    const bIdx = budgets.findIndex(x => x.id === activeBudget.id);
    if (bIdx !== -1) {
        const itemIdx = budgets[bIdx].items.findIndex(item => item.id === selectedFoodItemForRefill);
        if (itemIdx !== -1) {
            const item = budgets[bIdx].items[itemIdx];
            
            // Record refill added amount
            item.refills = item.refills || [];
            item.refills.push(amount);
            item.budgetedAmount += amount;
            
            // Clear exhausted status
            item.isFinished = false;
            item.finishedDate = null;
            
            // Record a purchase for this ravitaillement
            const newPurchase = {
                id: 'p-' + Date.now(),
                date: viewDate.toISOString().split('T')[0],
                amount,
                qty,
                note: note || 'Ravitaillement'
            };
            item.purchases.push(newPurchase);
            
            activeBudget = budgets[bIdx];
            saveBudgets();
            playSound('success');
        }
    }

    document.getElementById('refill-modal').classList.remove('show');
    selectedFoodItemForRefill = null;
    renderUI();
}

function openRefillModalFromDashboard(itemId, budgetId) {
    const b = budgets.find(x => x.id === budgetId);
    if (b) {
        activeBudget = b;
        openRefillModal(itemId);
    }
}
window.openRefillModalFromDashboard = openRefillModalFromDashboard;

// Budget Advisor: Suggests quantity based on past early exhaustion + refill amounts
function showBudgetAdvice(nameText) {
    const tipDiv = document.getElementById('item-advisor-tip');
    if (!tipDiv || !activeBudget) return;

    const q = nameText.trim().toLowerCase();
    if (q.length < 2) {
        tipDiv.classList.add('hidden');
        return;
    }

    let foundAdvice = null;

    // Filter past budgets of same duration (exclude active one)
    const matchingBudgets = budgets.filter(b => 
        b.id !== activeBudget.id && 
        b.durationType === activeBudget.durationType && 
        b.durationValue === activeBudget.durationValue
    );

    for (const b of matchingBudgets) {
        const item = b.items && b.items.find(i => i.name.toLowerCase() === q);
        if (item) {
            const refillsSum = item.refills ? item.refills.reduce((a, b) => a + b, 0) : 0;
            const end = getBudgetEndDate(b.startDate, b.durationType, b.durationValue);
            const isFinishedEarly = item.isFinished && item.finishedDate && (new Date(item.finishedDate) < end);
            
            if (isFinishedEarly || refillsSum > 0) {
                const original = item.budgetedAmount - refillsSum;
                const suggested = item.budgetedAmount;
                foundAdvice = {
                    name: item.name,
                    original,
                    refills: refillsSum,
                    suggested
                };
                break; // Get most recent matching past advice
            }
        }
    }

    if (foundAdvice) {
        tipDiv.classList.remove('hidden');
        
        const template = lang.get('item.advice_desc') || "Tip: '{name}' ran out early in your last budget. We suggest budgeting {suggested} (original {original} + refill {refills}) for this interval.";
        
        tipDiv.innerHTML = `
            <i class="fas fa-lightbulb" style="color: var(--accent-color); font-size: 16px; margin-top: 2px;"></i>
            <div>
                <div style="font-weight: 700; margin-bottom: 2px;">${lang.get('item.advice_title') || 'Budget Advice'}</div>
                <div>${template
                    .replace('{name}', foundAdvice.name)
                    .replace('{suggested}', formatCurrency(foundAdvice.suggested))
                    .replace('{original}', formatCurrency(foundAdvice.original))
                    .replace('{refills}', formatCurrency(foundAdvice.refills))}</div>
            </div>
        `;
    } else {
        tipDiv.classList.add('hidden');
    }
}

function deleteActiveBudget() {
    if (!activeBudget) return;
    
    const confirmMsg = lang.get('budget.delete_confirm') || 'Are you sure you want to delete this budget?';
    if (!confirm(confirmMsg)) return;

    budgets = budgets.filter(x => x.id !== activeBudget.id);
    saveBudgets();
    goBackToDashboard();
}

function viewPurchasesList(itemId) {
    selectedFoodItemForPurchasesList = itemId;
    const modal = document.getElementById('purchases-list-modal');
    const container = document.getElementById('purchases-modal-list');
    
    if (!modal || !container || !activeBudget) return;
    
    const item = activeBudget.items.find(x => x.id === itemId);
    if (!item) return;

    container.innerHTML = '';
    
    if (!item.purchases || item.purchases.length === 0) {
        container.innerHTML = `<div class="empty-state"><i class="fas fa-receipt empty-state-icon"></i><p translate="item.no_purchases">No purchases recorded.</p></div>`;
    } else {
        // Sort purchases by date descending
        const sorted = [...item.purchases].sort((a,b) => new Date(b.date) - new Date(a.date));
        
        sorted.forEach(p => {
            const div = document.createElement('div');
            div.className = 'purchase-row';
            div.innerHTML = `
                <div class="purchase-left">
                    <span class="purchase-ref">${formatDateString(p.date)}</span>
                    <span class="purchase-sub">${p.qty || ''} ${p.note ? '• ' + p.note : ''}</span>
                </div>
                <div class="purchase-right">
                    <span class="purchase-amt">${formatCurrency(p.amount)}</span>
                    <button class="purchase-del-btn" title="Delete" onclick="deletePurchase('${p.id}')">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            `;
            container.appendChild(div);
        });
    }

    modal.classList.add('show');
    lang.translatePage();
}

// Global functions for inline actions (defined in window scope for easy HTML onclick)
window.deletePurchase = function(purchaseId) {
    if (!activeBudget || !selectedFoodItemForPurchasesList) return;

    const confirmMsg = lang.get('purchase.delete_confirm') || 'Delete this purchase?';
    if (!confirm(confirmMsg)) return;

    const bIdx = budgets.findIndex(x => x.id === activeBudget.id);
    if (bIdx !== -1) {
        const itemIdx = budgets[bIdx].items.findIndex(item => item.id === selectedFoodItemForPurchasesList);
        if (itemIdx !== -1) {
            budgets[bIdx].items[itemIdx].purchases = budgets[bIdx].items[itemIdx].purchases.filter(p => p.id !== purchaseId);
            activeBudget = budgets[bIdx];
            saveBudgets();
            
            // Refresh list modal
            viewPurchasesList(selectedFoodItemForPurchasesList);
            // Refresh underlying detail view
            renderUI();
        }
    }
};

window.toggleItemFinished = toggleItemFinished;
window.deleteFoodItem = deleteFoodItem;
window.openPurchaseModal = openPurchaseModal;
window.viewPurchasesList = viewPurchasesList;
window.viewBudgetDetail = viewBudgetDetail;
window.goBackToDashboard = goBackToDashboard;
window.openItemModal = openItemModal;
window.deleteActiveBudget = deleteActiveBudget;

// Selection Modal logic
function openSelectionModal(tabName) {
    const modal = document.getElementById('selection-modal');
    if (!modal) return;
    
    activeSelectionTab = tabName;
    buildSelectionGrids();
    showSelectionTab(tabName);
    
    modal.classList.add('show');
}

function showSelectionTab(tabName) {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelector(`[data-tab="${tabName}"]`)?.classList.add('active');
    
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active-content'));
    // Map tabName to container ID
    // tabName is 'years', 'months', 'days' -> ID is 'year-grid-container' etc.
    let containerId = 'year-grid-container';
    if (tabName === 'months') containerId = 'month-grid-container';
    if (tabName === 'days') containerId = 'day-grid-container';
    
    document.getElementById(containerId)?.classList.add('active-content');
}

function buildSelectionGrids() {
    buildYearGrid();
    buildMonthGrid();
    buildDayGrid();
}

function buildYearGrid() {
    const grid = document.getElementById('year-grid');
    if (!grid) return;
    grid.innerHTML = '';

    // Extract unique years from budgets' startDate
    const years = [];
    budgets.forEach(b => {
        const start = new Date(b.startDate);
        if (!isNaN(start.getTime())) {
            const y = start.getFullYear();
            if (!years.includes(y)) years.push(y);
        }
    });

    years.sort((a, b) => a - b);

    // If no budgets exist, default to current year
    if (years.length === 0) {
        years.push(new Date().getFullYear());
    }

    years.forEach(y => {
        const item = document.createElement('div');
        item.className = 'year-item';
        item.innerText = y;
        if (y === viewDate.getFullYear()) {
            item.style.backgroundColor = 'var(--primary-color)';
            item.style.color = 'white';
        }
        item.onclick = () => {
            viewDate.setFullYear(y);
            updateHeaderDateLabels();
            buildMonthGrid(); // Update month grid options
            showSelectionTab('months');
        };
        grid.appendChild(item);
    });
}

function buildMonthGrid() {
    const grid = document.getElementById('month-grid');
    if (!grid) return;
    grid.innerHTML = '';

    const activeYear = viewDate.getFullYear();
    const months = [];

    // Extract unique months for budgets starting in the selected year
    budgets.forEach(b => {
        const start = new Date(b.startDate);
        if (!isNaN(start.getTime()) && start.getFullYear() === activeYear) {
            const m = start.getMonth(); // 0-11
            if (!months.includes(m)) months.push(m);
        }
    });

    months.sort((a, b) => a - b);

    // If no budgets exist for selected year, default to current month
    if (months.length === 0) {
        months.push(new Date().getMonth());
    }

    months.forEach(m => {
        const item = document.createElement('div');
        item.className = 'month-item';
        item.innerText = String(m + 1).padStart(2, '0');
        if (m === viewDate.getMonth()) {
            item.style.backgroundColor = 'var(--primary-color)';
            item.style.color = 'white';
        }
        item.onclick = () => {
            viewDate.setMonth(m);
            updateHeaderDateLabels();
            buildDayGrid(); // Update day grid options
            showSelectionTab('days');
        };
        grid.appendChild(item);
    });
}

function buildDayGrid() {
    const grid = document.getElementById('day-grid');
    if (!grid) return;
    grid.innerHTML = '';

    const activeYear = viewDate.getFullYear();
    const activeMonth = viewDate.getMonth();
    const days = [];

    // Extract unique start days for budgets starting in selected year and month
    budgets.forEach(b => {
        const start = new Date(b.startDate);
        if (!isNaN(start.getTime()) && start.getFullYear() === activeYear && start.getMonth() === activeMonth) {
            const d = start.getDate();
            if (!days.includes(d)) days.push(d);
        }
    });

    days.sort((a, b) => a - b);

    // If no budgets exist for selected year and month, default to current day
    if (days.length === 0) {
        days.push(new Date().getDate());
    }

    days.forEach(d => {
        const item = document.createElement('div');
        item.className = 'day-item';
        item.innerText = String(d).padStart(2, '0');
        if (d === viewDate.getDate()) {
            item.style.backgroundColor = 'var(--primary-color)';
            item.style.color = 'white';
        }
        item.onclick = () => {
            viewDate.setDate(d);
            updateHeaderDateLabels();
            closeSelectionModal();
            renderUI();
        };
        grid.appendChild(item);
    });
}

function closeSelectionModal() {
    document.getElementById('selection-modal')?.classList.remove('show');
}

// Search Feature
function handleSearch(query) {
    const resultsContainer = document.getElementById('search-results');
    if (!resultsContainer) return;

    const q = query.trim().toLowerCase();
    if (q.length < 2) {
        resultsContainer.innerHTML = '';
        return;
    }

    resultsContainer.innerHTML = '';
    let matches = [];

    // Search through budgets, items, and purchases
    budgets.forEach(b => {
        // Budget match
        if (b.name.toLowerCase().includes(q)) {
            matches.push({
                type: 'budget',
                title: b.name,
                subtitle: `${formatDateString(b.startDate)} - ${formatDateString(b.endDate)}`,
                action: () => {
                    viewBudgetDetail(b.id);
                    document.getElementById('search-modal')?.classList.remove('show');
                }
            });
        }

        b.items && b.items.forEach(item => {
            // Food item match
            if (item.name.toLowerCase().includes(q)) {
                matches.push({
                    type: 'item',
                    title: `${item.name} (${b.name})`,
                    subtitle: `Budgeted: ${formatCurrency(item.budgetedAmount)}`,
                    action: () => {
                        viewBudgetDetail(b.id);
                        document.getElementById('search-modal')?.classList.remove('show');
                    }
                });
            }

            item.purchases && item.purchases.forEach(p => {
                // Purchase match
                if (p.note && p.note.toLowerCase().includes(q)) {
                    matches.push({
                        type: 'purchase',
                        title: `${item.name} purchase - ${p.note} (${b.name})`,
                        subtitle: `${formatDateString(p.date)}: ${formatCurrency(p.amount)}`,
                        action: () => {
                            viewBudgetDetail(b.id);
                            document.getElementById('search-modal')?.classList.remove('show');
                        }
                    });
                }
            });
        });
    });

    if (matches.length === 0) {
        resultsContainer.innerHTML = `<div class="empty-state"><i class="fas fa-search empty-state-icon"></i><p translate="search.empty">No items found matching your query.</p></div>`;
        lang.translatePage();
    } else {
        matches.forEach(m => {
            const div = document.createElement('div');
            div.className = 'search-result-item';
            div.innerHTML = `
                <div class="result-ref">${m.title}</div>
                <div class="result-text">${m.subtitle}</div>
            `;
            div.onclick = m.action;
            resultsContainer.appendChild(div);
        });
    }
}

// Backup & Restore (.dem / .sem) - Encrypted with simple byte shifting
function encryptData(str) {
    const encoder = new TextEncoder();
    const bytes = encoder.encode(str);
    const encryptedBytes = new Uint8Array(bytes.length);
    for (let i = 0; i < bytes.length; i++) {
        encryptedBytes[i] = (bytes[i] + 5) % 256;
    }
    return encryptedBytes;
}

function decryptData(uint8Array) {
    const decryptedBytes = new Uint8Array(uint8Array.length);
    for (let i = 0; i < uint8Array.length; i++) {
        decryptedBytes[i] = (uint8Array[i] - 5 + 256) % 256;
    }
    const decoder = new TextDecoder();
    return decoder.decode(decryptedBytes);
}

function exportDataToDEM() {
    const data = {
        menap_settings: localStorage.getItem('menap_settings'),
        menap_budgets: localStorage.getItem('menap_budgets'),
        menap_lang_pref: localStorage.getItem('menap_lang_pref'),
        menap_food_suggestions: localStorage.getItem('menap_food_suggestions')
    };
    
    const jsonStr = JSON.stringify(data);
    const encryptedBytes = encryptData(jsonStr);
    const blob = new Blob([encryptedBytes], { type: 'application/octet-stream' });
    
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `menap_backup_${new Date().toISOString().split('T')[0]}.dem`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
}

function restoreFromQRData(decryptedData) {
    try {
        if (decryptedData && (decryptedData.firstName || decryptedData.fn)) {
            const data = decryptedData.fn ? expandData(decryptedData) : decryptedData;
            
            // Reconstruct appSettings
            appSettings.profile = {
                firstName: data.firstName || '',
                lastName: data.lastName || '',
                email: data.email || '',
                photo: data.photo || '' // Typically empty in QR, but preserve if present
            };
            appSettings.lang = data.lang || appSettings.lang || 'fr';
            appSettings.currency = data.currency || appSettings.currency || 'BIF';
            appSettings.theme = data.theme || appSettings.theme || 'light';
            appSettings.soundEnabled = data.soundEnabled !== false;
            appSettings.isInitialized = true;
            saveSettings();
            
            // Restore budgets
            if (data.budgets) {
                budgets = data.budgets;
                saveBudgets();
            }
            
            // Restore suggestions
            if (data.food_suggestions) {
                localStorage.setItem('menap_food_suggestions', JSON.stringify(data.food_suggestions));
            }
            
            return true;
        }
    } catch (e) {
        console.error("Failed to restore from QR data:", e);
    }
    return false;
}

function importDataFromQRCodeImage(file) {
    toggleLoading(true);
    const reader = new FileReader();
    reader.onload = function(evt) {
        const img = new Image();
        img.onload = function() {
            const canvas = document.createElement('canvas');
            canvas.width = img.width;
            canvas.height = img.height;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0);
            const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const code = jsQR(imageData.data, imageData.width, imageData.height);
            
            if (code) {
                try {
                    let decrypted = null;
                    
                    // 1. Try new shrunken binary QR format
                    try {
                        const bytes = base64ToUint8(code.data);
                        const jsonStr = decryptData(bytes);
                        const shrunken = JSON.parse(jsonStr);
                        decrypted = expandData(shrunken);
                    } catch (e) {
                        // 2. Try old Base64 profile shift format (backwards compatibility)
                        try {
                            decrypted = decryptProfile(code.data);
                        } catch (e2) {
                            console.error("QR Code Base64 decryption failed:", e2);
                        }
                    }
                    
                    if (decrypted && (decrypted.firstName || decrypted.fn)) {
                        const success = restoreFromQRData(decrypted);
                        if (success) {
                            playSound('success');
                            alert(lang.get('settings.import_success') || 'Données restaurées avec succès ! Rechargement...');
                            window.location.reload();
                        } else {
                            throw new Error("Restoration logic returned false");
                        }
                    } else {
                        throw new Error("Invalid profile keys");
                    }
                } catch (err) {
                    alert("QR Code invalide ou illisible.");
                    toggleLoading(false);
                }
            } else {
                alert("Aucun QR Code trouvé dans l'image.");
                toggleLoading(false);
            }
        };
        img.onerror = () => {
            alert("Impossible de charger l'image.");
            toggleLoading(false);
        };
        img.src = evt.target.result;
    };
    reader.readAsDataURL(file);
}

function handleImportFile(file) {
    if (!file) return;
    if (file.type.startsWith('image/') || /\.(png|jpe?g|gif)$/i.test(file.name)) {
        importDataFromQRCodeImage(file);
    } else {
        importDataFromDEM(file);
    }
}

function importDataFromDEM(file) {
    if (!file) return;
    toggleLoading(true);

    const reader = new FileReader();
    reader.onload = function(e) {
        const arrayBuffer = e.target.result;
        const bytes = new Uint8Array(arrayBuffer);
        
        let parsed = null;
        
        // 1. Try raw binary decryption
        try {
            const jsonStr = decryptData(bytes);
            parsed = JSON.parse(jsonStr);
        } catch (err) {
            // 2. Try old Base64 string decryption (backwards compatibility)
            try {
                const decoder = new TextDecoder();
                const text = decoder.decode(bytes).trim();
                const decoded = decodeURIComponent(escape(atob(text)));
                let decrypted = '';
                for (let i = 0; i < decoded.length; i++) {
                    decrypted += String.fromCharCode(decoded.charCodeAt(i) - 5);
                }
                parsed = JSON.parse(decrypted);
            } catch (oldErr) {
                console.error("Decryption failed:", oldErr);
            }
        }
        
        try {
            if (parsed && (parsed.menap_settings || parsed.menap_budgets)) {
                // Regular backup format
                if (parsed.menap_settings) localStorage.setItem('menap_settings', parsed.menap_settings);
                if (parsed.menap_budgets) localStorage.setItem('menap_budgets', parsed.menap_budgets);
                if (parsed.menap_lang_pref) localStorage.setItem('menap_lang_pref', parsed.menap_lang_pref);
                if (parsed.menap_food_suggestions) localStorage.setItem('menap_food_suggestions', parsed.menap_food_suggestions);
                
                playSound('success');
                alert(lang.get('settings.import_success') || 'Data restored successfully! Reloading...');
                window.location.reload();
            } else if (parsed && (parsed.firstName || parsed.fn)) {
                // User uploaded a QR-style JSON file as .dem! Restore it cleanly!
                const success = restoreFromQRData(parsed);
                if (success) {
                    playSound('success');
                    alert(lang.get('settings.import_success') || 'Data restored successfully! Reloading...');
                    window.location.reload();
                } else {
                    throw new Error("Unified QR data restore failed");
                }
            } else {
                throw new Error("Invalid structure");
            }
        } catch (err) {
            alert(lang.get('settings.import_error') || 'Failed to restore data. Invalid file.');
            toggleLoading(false);
        }
    };
    reader.readAsArrayBuffer(file);
}

// Fetch Loading overlay trigger with simulated network delay
async function changeLanguage(newLang) {
    toggleLoading(true);
    setTimeout(async () => {
        try {
            await lang.setLanguage(newLang);
        } catch (e) {
            console.error(e);
        } finally {
            toggleLoading(false);
        }
    }, 400); // 400ms loading overlay visual fetch representation
}

// Draggable floating calculator implementation
function makeElementDraggable(el, headerEl) {
    let pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;
    
    headerEl.onmousedown = dragMouseDown;
    headerEl.ontouchstart = dragTouchStart;

    function dragMouseDown(e) {
        e.preventDefault();
        pos3 = e.clientX;
        pos4 = e.clientY;
        document.onmouseup = closeDragElement;
        document.onmousemove = elementDrag;
    }

    function dragTouchStart(e) {
        if (e.touches.length === 1) {
            pos3 = e.touches[0].clientX;
            pos4 = e.touches[0].clientY;
            document.ontouchend = closeDragElement;
            document.ontouchmove = elementTouchDrag;
        }
    }

    function elementDrag(e) {
        e.preventDefault();
        pos1 = pos3 - e.clientX;
        pos2 = pos4 - e.clientY;
        pos3 = e.clientX;
        pos4 = e.clientY;
        
        let newTop = el.offsetTop - pos2;
        let newLeft = el.offsetLeft - pos1;
        
        newTop = Math.max(0, Math.min(window.innerHeight - el.offsetHeight, newTop));
        newLeft = Math.max(0, Math.min(window.innerWidth - el.offsetWidth, newLeft));

        el.style.top = newTop + "px";
        el.style.left = newLeft + "px";
    }

    function elementTouchDrag(e) {
        if (e.touches.length === 1) {
            pos1 = pos3 - e.touches[0].clientX;
            pos2 = pos4 - e.touches[0].clientY;
            pos3 = e.touches[0].clientX;
            pos4 = e.touches[0].clientY;

            let newTop = el.offsetTop - pos2;
            let newLeft = el.offsetLeft - pos1;

            newTop = Math.max(0, Math.min(window.innerHeight - el.offsetHeight, newTop));
            newLeft = Math.max(0, Math.min(window.innerWidth - el.offsetWidth, newLeft));

            el.style.top = newTop + "px";
            el.style.left = newLeft + "px";
        }
    }

    function closeDragElement() {
        document.onmouseup = null;
        document.onmousemove = null;
        document.ontouchend = null;
        document.ontouchmove = null;
    }
}

function pressCalc(val) {
    playSound('click');
    const display = document.getElementById('calc-display');
    const preview = document.getElementById('calc-preview');
    if (!display) return;
    
    if (val === 'C') {
        display.value = '0';
        if (preview) preview.innerText = '';
    } else if (val === 'Backspace') {
        if (display.value.length > 1) {
            display.value = display.value.slice(0, -1);
        } else {
            display.value = '0';
        }
        updateCalcPreview();
    } else if (val === '=') {
        try {
            const sanitize = display.value.replace(/[^0-9+\-*/().]/g, '');
            const result = new Function("return " + sanitize)();
            if (isNaN(result) || !isFinite(result)) {
                display.value = 'Error';
            } else {
                display.value = parseFloat(result.toFixed(2)).toString();
            }
            if (preview) preview.innerText = '';
        } catch (e) {
            display.value = 'Error';
            if (preview) preview.innerText = '';
        }
    } else {
        if (display.value === '0' || display.value === 'Error') {
            display.value = val;
        } else {
            display.value += val;
        }
        updateCalcPreview();
    }
}

function updateCalcPreview() {
    const display = document.getElementById('calc-display');
    const preview = document.getElementById('calc-preview');
    if (!display || !preview) return;

    const val = display.value.trim();
    if (!val || val === '0' || val === 'Error') {
        preview.innerText = '';
        return;
    }

    try {
        const sanitize = val.replace(/[^0-9+\-*/().]/g, '');
        let evalStr = sanitize;
        if (/[+\-*/(]$/.test(sanitize)) {
            evalStr = sanitize.slice(0, -1);
        }
        
        if (!evalStr) {
            preview.innerText = '';
            return;
        }

        const result = new Function("return " + evalStr)();
        if (isNaN(result) || !isFinite(result)) {
            preview.innerText = '';
        } else {
            preview.innerText = '= ' + parseFloat(result.toFixed(2)).toString();
        }
    } catch (e) {
        preview.innerText = '';
    }
}

function insertCalcValue() {
    playSound('success');
    const display = document.getElementById('calc-display');
    if (!display || !window.activeCalculatorInput) return;
    
    const targetInput = document.getElementById(window.activeCalculatorInput);
    if (targetInput) {
        const rawVal = parseFloat(display.value) || 0;
        targetInput.value = rawVal;
        targetInput.focus();
        targetInput.dispatchEvent(new Event('input'));
    }
    
    const calcModal = document.getElementById('calculator-modal');
    if (calcModal) {
        calcModal.classList.remove('show');
        calcModal.style.display = 'none';
    }
}

function setupFocusTracker() {
    const inputsList = ['budget-duration-val', 'item-budgeted', 'purchase-amount', 'refill-amount'];
    inputsList.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.addEventListener('focus', (e) => {
                window.activeCalculatorInput = e.target.id;
            });
        }
    });
}

function shareApp() {
    playSound('click');
    const url = window.location.href;
    if (navigator.share) {
        navigator.share({ title: 'Menap Budget Planner', url })
            .then(() => playSound('success'))
            .catch(e => console.warn("Share failed:", e));
    } else {
        navigator.clipboard.writeText(url).then(() => {
            playSound('success');
            alert(appSettings.lang === 'fr' ? 'Lien copié dans le presse-papiers!' : 'Ilinki yajyanywe!');
        });
    }
}

window.pressCalc = pressCalc;
window.insertCalcValue = insertCalcValue;
window.openRefillModal = openRefillModal;
window.saveRefill = saveRefill;

// Event bindings
function setupInteractions() {
    const setE = (id, event, fn) => {
        const el = document.getElementById(id);
        if (el) el[event] = fn;
    };

    // Header buttons
    setE('menu-btn', 'onclick', () => {
        playSound('click');
        document.getElementById('drawer')?.classList.add('open');
        document.getElementById('overlay')?.classList.add('show');
    });

    setE('overlay', 'onclick', () => {
        playSound('click');
        document.getElementById('drawer')?.classList.remove('open');
        document.getElementById('overlay')?.classList.remove('show');
    });

    // Date selectors in header
    setE('header-year-selector', 'onclick', () => { playSound('click'); openSelectionModal('years'); });
    setE('header-month-selector', 'onclick', () => { playSound('click'); openSelectionModal('months'); });
    setE('header-day-selector', 'onclick', () => { playSound('click'); openSelectionModal('days'); });

    // Selection Modal Tabs
    document.querySelectorAll('#selection-modal .tab').forEach(tab => {
        tab.onclick = () => { playSound('click'); showSelectionTab(tab.getAttribute('data-tab')); };
    });
    setE('close-modal', 'onclick', () => { playSound('click'); closeSelectionModal(); });

    // Calculator header button
    setE('header-calc-btn', 'onclick', () => {
        playSound('click');
        document.getElementById('calc-display').value = '0';
        document.getElementById('calc-preview').innerText = '';
        
        const calcModal = document.getElementById('calculator-modal');
        if (calcModal) {
            calcModal.style.display = 'flex';
            calcModal.classList.add('show');
            calcModal.style.top = '100px';
            calcModal.style.left = `calc(50% - 150px)`;
        }
    });
    setE('close-calculator-modal', 'onclick', () => {
        playSound('click');
        const calcModal = document.getElementById('calculator-modal');
        if (calcModal) {
            calcModal.classList.remove('show');
            calcModal.style.display = 'none';
        }
    });

    // Search header button
    setE('search-btn', 'onclick', () => {
        playSound('click');
        document.getElementById('search-modal')?.classList.add('show');
        document.getElementById('search-input')?.focus();
    });
    setE('close-search', 'onclick', () => {
        playSound('click');
        document.getElementById('search-modal')?.classList.remove('show');
        document.getElementById('search-input').value = '';
        document.getElementById('search-results').innerHTML = '';
    });
    setE('search-input', 'oninput', (e) => {
        clearTimeout(window.searchTimeout);
        window.searchTimeout = setTimeout(() => handleSearch(e.target.value), 300);
    });

    // Drawer Navigations
    setE('nav-dashboard', 'onclick', () => {
        playSound('click');
        currentView = 'dashboard';
        activeBudget = null;
        renderUI();
        closeDrawer();
    });
    setE('nav-budgets', 'onclick', () => {
        playSound('click');
        currentView = 'dashboard';
        activeBudget = null;
        renderUI();
        closeDrawer();
    });
    setE('nav-search', 'onclick', () => {
        playSound('click');
        closeDrawer();
        document.getElementById('search-modal')?.classList.add('show');
        document.getElementById('search-input')?.focus();
    });
    setE('nav-backup', 'onclick', () => {
        playSound('click');
        closeDrawer();
        document.getElementById('backup-modal')?.classList.add('show');
    });
    setE('nav-share', 'onclick', () => {
        closeDrawer();
        shareApp();
    });
    setE('nav-settings', 'onclick', () => {
        playSound('click');
        closeDrawer();
        
        const soundToggle = document.getElementById('sound-toggle');
        if (soundToggle) soundToggle.checked = appSettings.soundEnabled !== false;
        
        const qrContainer = document.getElementById('settings-qr-container');
        if (qrContainer) qrContainer.style.display = 'none';
        
        updateProfileUI();
        document.getElementById('settings-modal')?.classList.add('show');
    });
    setE('nav-info', 'onclick', () => {
        playSound('click');
        closeDrawer();
        document.getElementById('contact-modal')?.classList.add('show');
    });
    setE('nav-logout', 'onclick', () => {
        playSound('click');
        closeDrawer();
        document.getElementById('logout-qr-display').style.display = 'none';
        document.getElementById('logout-modal')?.classList.add('show');
    });

    // Modals Close buttons
    setE('close-settings', 'onclick', () => { playSound('click'); document.getElementById('settings-modal')?.classList.remove('show'); });
    setE('close-backup-modal', 'onclick', () => { playSound('click'); document.getElementById('backup-modal')?.classList.remove('show'); });
    setE('close-refill-modal', 'onclick', () => { playSound('click'); document.getElementById('refill-modal')?.classList.remove('show'); selectedFoodItemForRefill = null; });
    setE('close-logout-modal', 'onclick', () => { playSound('click'); document.getElementById('logout-modal')?.classList.remove('show'); });

    // Settings Modal selects
    setE('theme-select', 'onchange', (e) => {
        playSound('click');
        appSettings.theme = e.target.value;
        saveSettings();
        applyTheme();
    });
    setE('lang-select', 'onchange', (e) => {
        playSound('click');
        changeLanguage(e.target.value);
    });
    setE('currency-select', 'onchange', (e) => {
        playSound('click');
        appSettings.currency = e.target.value;
        saveSettings();
        renderUI();
    });
    
    // New settings bindings for Profile QR and sound toggle
    setE('sound-toggle', 'onchange', (e) => {
        appSettings.soundEnabled = e.target.checked;
        saveSettings();
        playSound('click');
    });
    setE('generate-qr-btn', 'onclick', () => {
        playSound('click');
        generateProfileQRCode();
    });
    setE('download-qr-btn', 'onclick', () => {
        playSound('click');
        downloadProfileQRCode();
    });
    
    // Logout Modal bindings
    setE('logout-export-qr', 'onclick', () => {
        playSound('click');
        generateLogoutQRCode();
    });
    setE('logout-download-qr', 'onclick', () => {
        playSound('click');
        downloadLogoutQRCode();
    });
    setE('logout-export-dem', 'onclick', () => {
        playSound('click');
        exportDataToDEM();
    });
    setE('logout-confirm-btn', 'onclick', () => {
        playSound('warning');
        const confirmMsg = appSettings.lang === 'fr' 
            ? "Êtes-vous sûr de vouloir vous déconnecter? Toutes vos données locales non sauvegardées seront définitivement perdues." 
            : (appSettings.lang === 'rw' 
                ? "Ese urashaka gusohoka by'ukuri? Amakuru yose utabitse azasibwa burundu."
                : (appSettings.lang === 'rn'
                    ? "Ese urashaka gusohoka vy'ukuri? Amakuru yose utabitse aca atakara burundu."
                    : "Are you sure you want to log out? All unsaved local data will be permanently lost."));
        if (confirm(confirmMsg)) {
            localStorage.clear();
            window.location.reload();
        }
    });

    // Backups actions inside backup screen
    setE('export-btn', 'onclick', () => { playSound('click'); exportDataToDEM(); });
    setE('import-btn-trigger', 'onclick', () => { playSound('click'); document.getElementById('import-file-input').click(); });
    setE('import-file-input', 'onchange', (e) => {
        if (e.target.files.length > 0) {
            handleImportFile(e.target.files[0]);
        }
    });

    // Contact modal close
    setE('close-contact', 'onclick', () => { playSound('click'); document.getElementById('contact-modal')?.classList.remove('show'); });

    // Budgets Modal Close/Save
    setE('close-budget-modal', 'onclick', () => { playSound('click'); document.getElementById('budget-modal').classList.remove('show'); });
    setE('save-budget-btn', 'onclick', () => { playSound('click'); createOrUpdateBudget(); });

    // Food Item Modal Close/Save & Advice binding
    setE('close-item-modal', 'onclick', () => { playSound('click'); document.getElementById('item-modal').classList.remove('show'); });
    setE('save-item-btn', 'onclick', () => { playSound('click'); addFoodItem(); });
    setE('item-name', 'oninput', (e) => {
        showBudgetAdvice(e.target.value);
    });

    // Purchase Modal Close/Save
    setE('close-purchase-modal', 'onclick', () => { playSound('click'); document.getElementById('purchase-modal').classList.remove('show'); });
    setE('save-purchase-btn', 'onclick', () => { playSound('click'); addPurchase(); });

    // Purchases List Modal Close
    setE('close-purchases-list-modal', 'onclick', () => {
        playSound('click');
        document.getElementById('purchases-list-modal').classList.remove('show');
        selectedFoodItemForPurchasesList = null;
    });

    // Refill Save Action
    setE('save-refill-btn', 'onclick', () => { playSound('click'); saveRefill(); });

    // Set tracker focused inputs
    setupFocusTracker();
}

function closeDrawer() {
    document.getElementById('drawer')?.classList.remove('open');
    document.getElementById('overlay')?.classList.remove('show');
}

function toggleLoading(show) {
    const loading = document.getElementById('loading');
    if (loading) loading.style.display = show ? 'flex' : 'none';
}

init();
