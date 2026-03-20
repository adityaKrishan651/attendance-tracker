const STORAGE_KEY = 'attendanceHero';

const firebaseConfig = {
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
    storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: import.meta.env.VITE_FIREBASE_APP_ID,
    measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID
};

if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
}

const auth = firebase.auth();
const db = firebase.firestore();

let currentUser = null;

// Default state structure
let appState = {
    meta: {
        version: '1.0',
        createdAt: null,
        userName: '',
        overallAttendance: 75
    },
    subjects: []
};

let currentCalendarSubjectId = null;
let currentCalendarDate = new Date();

// --- Initialization ---

document.addEventListener('DOMContentLoaded', () => {
    initApp();
});

function initApp() {
    // Listen for Authentication state changes
    auth.onAuthStateChanged((user) => {
        if (user) {
            currentUser = user;
            document.getElementById('login-modal').classList.add('hidden');
            document.getElementById('logout-btn').style.display = 'inline-block';
            fetchUserData(user.uid);
        } else {
            currentUser = null;
            document.getElementById('app-container').classList.add('hidden');
            document.getElementById('wizard-modal').classList.add('hidden');
            document.getElementById('logout-btn').style.display = 'none';
            document.getElementById('login-modal').classList.remove('hidden');
        }
    });

    // Wizard Form Listener
    document.getElementById('wizard-form').addEventListener('submit', finishWizard);

    // Add Subject Form Listener
    document.getElementById('add-subject-form').addEventListener('submit', handleAddSubject);
}

function saveState() {
    // Fallback to local storage if offline or not logged in yet (during wizard)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(appState));

    // Save to Firestore if authenticated
    if (currentUser) {
        db.collection('users').doc(currentUser.uid).set(appState)
            .catch(error => console.error("Error saving data to Firestore:", error));
    }
}

function generateUUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
        var r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

// --- Theme Toggling ---
function toggleTheme() {
    document.body.classList.toggle('dark-mode');
    document.body.classList.toggle('light-mode');
}

// --- Onboarding Wizard Logic ---

function showWizard() {
    document.getElementById('app-container').classList.add('hidden');
    document.getElementById('wizard-modal').classList.remove('hidden');

    // Add first empty subject to wizard
    if (document.getElementById('wizard-subjects').children.length === 0) {
        addWizardSubject();
    }
}

function nextStep(stepNumber) {
    document.querySelectorAll('.wizard-step').forEach(step => step.classList.add('hidden'));
    document.getElementById(`step-${stepNumber}`).classList.remove('hidden');
}

function addWizardSubject() {
    const container = document.getElementById('wizard-subjects');
    const idx = container.children.length;
    const div = document.createElement('div');
    div.className = 'wizard-subject-row comic-panel mini';
    div.style.padding = '12px';
    div.innerHTML = `
        <label>Subject Name</label>
        <input type="text" class="comic-input subj-name" placeholder="e.g. Defense Against the Dark Arts" required>
        <div class="split-inputs">
            <div>
                <label>Attended</label>
                <input type="number" class="comic-input subj-att" min="0" value="0" required>
            </div>
            <div>
                <label>Total Held</label>
                <input type="number" class="comic-input subj-tot" min="0" value="0" required>
            </div>
        </div>
    `;
    container.appendChild(div);
}

function finishWizard(e) {
    e.preventDefault();

    const name = document.getElementById('hero-name').value.trim();
    const threshold = parseInt(document.getElementById('target-threshold').value) || 75;

    appState.meta.userName = name;
    appState.meta.overallAttendance = threshold;
    appState.meta.createdAt = new Date().toISOString();

    const subjectRows = document.querySelectorAll('.wizard-subject-row');
    subjectRows.forEach(row => {
        const sName = row.querySelector('.subj-name').value.trim();
        const sAtt = parseInt(row.querySelector('.subj-att').value) || 0;
        const sTot = parseInt(row.querySelector('.subj-tot').value) || 0;

        if (sName) {
            appState.subjects.push({
                id: generateUUID(),
                name: sName,
                attendedClasses: sAtt,
                totalClasses: Math.max(sAtt, sTot), // ensure total >= attended
                records: []
            });
        }
    });

    saveState();

    document.getElementById('wizard-modal').classList.add('hidden');
    renderApp();
}

// --- Main App Logic ---

function renderApp() {
    document.getElementById('app-container').classList.remove('hidden');

    const name = appState.meta.userName ? `${appState.meta.userName}'s ` : '';
    document.getElementById('greeting-title').textContent = `${name.toUpperCase()}HERO LAB`;
    document.getElementById('global-target-display').textContent = appState.meta.overallAttendance;

    updateDashboardStats();
    renderSubjects();
    checkGlobalAlert();
}

function renderSubjects() {
    const container = document.getElementById('subjects-container');
    container.innerHTML = '';

    const todayStr = getTodayString();

    appState.subjects.forEach(subject => {
        let pct = 0;
        if (subject.totalClasses > 0) {
            pct = Math.round((subject.attendedClasses / subject.totalClasses) * 100);
        }

        let targetPct = appState.meta.overallAttendance;
        let badgeClass = 'safe';
        let badgeText = 'SAFE';

        if (pct < targetPct) {
            badgeClass = 'danger';
            badgeText = 'CRITICAL';
        } else if (pct < targetPct + 5) {
            badgeClass = 'warning';
            badgeText = 'WARNING';
        }

        // Has marked today?
        const markedToday = subject.records.find(r => r.date === todayStr);
        let actionHTML = '';

        if (markedToday) {
            actionHTML = `<div class="marked-today-text">You marked today as: ${markedToday.status.toUpperCase()}</div>`;
        } else {
            actionHTML = `
                <button class="comic-btn success" onclick="markAttendance('${subject.id}', 'present', '${todayStr}')">✅ PRESENT</button>
                <button class="comic-btn danger" onclick="markAttendance('${subject.id}', 'absent', '${todayStr}')">❌ ABSENT</button>
            `;
        }

        // Predictive Insights HTML
        let insightHTML = '';
        if (subject.totalClasses > 0) {
            if (pct >= targetPct) {
                let canMiss = Math.floor(subject.attendedClasses / (targetPct / 100) - subject.totalClasses);
                if (canMiss > 0) {
                    insightHTML = `<div class="insight-bubble">You can skip ${canMiss} more classes and stay safe! 😎</div>`;
                } else {
                    insightHTML = `<div class="insight-bubble">You are exactly on the line! Don't skip! 😬</div>`;
                }
            } else {
                let mustAttend = Math.ceil(((targetPct / 100) * subject.totalClasses - subject.attendedClasses) / (1 - (targetPct / 100)));
                if (mustAttend > 0) {
                    insightHTML = `<div class="insight-bubble">Attend ${mustAttend} consecutive classes to reach ${targetPct}%! 🚀</div>`;
                }
            }
        }

        const card = document.createElement('div');
        card.className = 'subject-card comic-panel';
        card.innerHTML = `
            <div class="subject-header">
                <div>
                    <h3 class="subject-name">${subject.name}</h3>
                    <div class="status-badge ${badgeClass}">${badgeText}</div>
                </div>
                <div class="subject-stats">
                    <div class="subject-percent" style="color: var(--${badgeClass === 'danger' ? 'danger-red' : (badgeClass === 'warning' ? 'action-yellow' : 'safe-green')})">${pct}%</div>
                    <div class="subject-counts">${subject.attendedClasses} / ${subject.totalClasses} classes</div>
                </div>
            </div>
            
            <div class="action-panel">
                ${actionHTML}
            </div>
            
            ${insightHTML}
            
            <div class="card-tools">
                <button onclick="openCalendarModal('${subject.id}')">📅 Calendar</button>
                <button onclick="openCustomDateModal('${subject.id}')">Custom Date</button>
                <button onclick="deleteSubject('${subject.id}')" style="color:red; border-color:red;">Delete</button>
            </div>
        `;
        container.appendChild(card);
    });
}

// --- Attendance Actions ---

function playActionWord(word) {
    const overlay = document.getElementById('action-overlay');
    const wordEl = document.getElementById('action-word');

    wordEl.textContent = word;
    overlay.classList.remove('hidden');
    wordEl.classList.remove('animate-pow');

    // Trigger reflow to restart animation
    void wordEl.offsetWidth;

    wordEl.classList.add('animate-pow');

    setTimeout(() => {
        overlay.classList.add('hidden');
    }, 600);
}

function getTodayString() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function markAttendance(subjectId, status, dateStr) {
    const subject = appState.subjects.find(s => s.id === subjectId);
    if (!subject) return;

    // Check if already exists for this date
    const existingIdx = subject.records.findIndex(r => r.date === dateStr);

    if (existingIdx !== -1) {
        // If editing a past record, adjust counts
        const oldStatus = subject.records[existingIdx].status;
        if (oldStatus !== status) {
            if (status === 'present') subject.attendedClasses++;
            else if (oldStatus === 'present') subject.attendedClasses--;
            subject.records[existingIdx].status = status;
        }
    } else {
        // New record
        subject.totalClasses++;
        if (status === 'present') subject.attendedClasses++;

        subject.records.push({
            date: dateStr,
            status: status,
            timestamp: Date.now()
        });
    }

    saveState();

    if (status === 'present') playActionWord('POW!');
    else playActionWord('BAM!');

    renderSubjects();
}

function deleteSubject(subjectId) {
    if (confirm("Are you sure you want to delete this subject? This action cannot be undone.")) {
        appState.subjects = appState.subjects.filter(s => s.id !== subjectId);
        saveState();
        renderSubjects();
    }
}

// --- Add Subject Modal ---

function openAddSubjectModal() {
    document.getElementById('add-subject-modal').classList.remove('hidden');
    document.getElementById('add-subject-form').reset();
}

function closeAddSubjectModal() {
    document.getElementById('add-subject-modal').classList.add('hidden');
}

function handleAddSubject(e) {
    e.preventDefault();
    const sName = document.getElementById('new-subj-name').value.trim();
    const sAtt = parseInt(document.getElementById('new-subj-attended').value) || 0;
    const sTot = parseInt(document.getElementById('new-subj-total').value) || 0;

    if (sName) {
        appState.subjects.push({
            id: generateUUID(),
            name: sName,
            attendedClasses: sAtt,
            totalClasses: Math.max(sAtt, sTot),
            records: []
        });
        saveState();
        closeAddSubjectModal();
        renderSubjects();
        playActionWord('ZAP!');
    }
}

// --- Custom Date Modal ---

function openCustomDateModal(subjectId) {
    document.getElementById('custom-date-subject-id').value = subjectId;
    document.getElementById('custom-date-input').value = getTodayString();
    document.getElementById('mark-custom-date-modal').classList.remove('hidden');
}

function closeCustomDateModal() {
    document.getElementById('mark-custom-date-modal').classList.add('hidden');
}

document.getElementById('custom-date-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const subjectId = document.getElementById('custom-date-subject-id').value;
    const dateStr = document.getElementById('custom-date-input').value;
    const status = document.getElementById('custom-date-status').value;

    markAttendance(subjectId, status, dateStr);
    closeCustomDateModal();
});

// --- Dashboard Overview Stats ---

function updateDashboardStats() {
    let globalTotal = 0;
    let globalAttended = 0;

    appState.subjects.forEach(s => {
        globalTotal += s.totalClasses;
        globalAttended += s.attendedClasses;
    });

    let pct = globalTotal > 0 ? Math.round((globalAttended / globalTotal) * 100) : 0;
    document.getElementById('overall-pct-text').textContent = pct + '%';
    document.getElementById('overall-attended-text').textContent = globalAttended;
    document.getElementById('overall-total-text').textContent = globalTotal;

    document.getElementById('overall-donut').style.setProperty('--fill', pct + '%');

    // Calculate Streak
    let dateMap = {};
    appState.subjects.forEach(s => {
        s.records.forEach(r => {
            if (!dateMap[r.date]) dateMap[r.date] = { present: 0, absent: 0 };
            dateMap[r.date][r.status]++;
        });
    });

    let sortedDates = Object.keys(dateMap).sort((a, b) => b.localeCompare(a));
    let streak = 0;
    for (let date of sortedDates) {
        if (dateMap[date].absent > 0) {
            break; // Streak broken
        }
        if (dateMap[date].present > 0) {
            streak++;
        }
    }
    document.getElementById('streak-count').textContent = streak;
}

// --- Alert System ---

function checkGlobalAlert() {
    let globalTotal = 0;
    let globalAttended = 0;

    appState.subjects.forEach(s => {
        globalTotal += s.totalClasses;
        globalAttended += s.attendedClasses;
    });

    const banner = document.getElementById('global-alert');
    if (globalTotal > 0) {
        const pct = (globalAttended / globalTotal) * 100;
        if (pct < appState.meta.overallAttendance) {
            banner.classList.remove('hidden');
        } else {
            banner.classList.add('hidden');
        }
    } else {
        banner.classList.add('hidden');
    }
}

// --- Calendar Logic ---

function openCalendarModal(subjectId) {
    currentCalendarSubjectId = subjectId;
    currentCalendarDate = new Date(); // Reset to current month
    document.getElementById('calendar-modal').classList.remove('hidden');
    renderCalendar();
}

function closeCalendarModal() {
    document.getElementById('calendar-modal').classList.add('hidden');
}

function prevMonth() {
    currentCalendarDate.setMonth(currentCalendarDate.getMonth() - 1);
    renderCalendar();
}

function nextMonth() {
    currentCalendarDate.setMonth(currentCalendarDate.getMonth() + 1);
    renderCalendar();
}

function renderCalendar() {
    const subject = appState.subjects.find(s => s.id === currentCalendarSubjectId);
    if (!subject) return;

    document.getElementById('calendar-subject-name').textContent = subject.name + ' Calendar';

    const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
    document.getElementById('calendar-month-year').textContent = `${monthNames[currentCalendarDate.getMonth()]} ${currentCalendarDate.getFullYear()}`;

    const daysContainer = document.getElementById('calendar-days');
    daysContainer.innerHTML = '';

    const firstDay = new Date(currentCalendarDate.getFullYear(), currentCalendarDate.getMonth(), 1);
    const lastDay = new Date(currentCalendarDate.getFullYear(), currentCalendarDate.getMonth() + 1, 0);
    const startOffset = firstDay.getDay(); // 0 (Sun) to 6 (Sat)

    // Create empty slots for days before 1st of month
    for (let i = 0; i < startOffset; i++) {
        let div = document.createElement('div');
        div.className = 'cal-day empty';
        daysContainer.appendChild(div);
    }

    const todayStr = getTodayString();

    for (let i = 1; i <= lastDay.getDate(); i++) {
        let div = document.createElement('div');
        div.className = 'cal-day';

        const dateStr = `${currentCalendarDate.getFullYear()}-${String(currentCalendarDate.getMonth() + 1).padStart(2, '0')}-${String(i).padStart(2, '0')}`;

        div.textContent = i;

        if (dateStr === todayStr) {
            div.classList.add('today');
        }

        const mark = subject.records.find(r => r.date === dateStr);
        if (mark) {
            div.classList.add(mark.status);
        }

        // On click for past/present days, open marking
        const currDateOnly = new Date(dateStr);
        const todayDateOnly = new Date(todayStr);
        if (currDateOnly <= todayDateOnly) {
            div.onclick = () => {
                closeCalendarModal();
                document.getElementById('custom-date-subject-id').value = subject.id;
                document.getElementById('custom-date-input').value = dateStr;
                if (mark) {
                    document.getElementById('custom-date-status').value = mark.status;
                } else {
                    document.getElementById('custom-date-status').value = 'present';
                }
                document.getElementById('mark-custom-date-modal').classList.remove('hidden');
            };
        } else {
            div.style.cursor = 'not-allowed';
            div.style.background = '#f5f5f5';
        }

        daysContainer.appendChild(div);
    }
}

// --- Export Data ---

function exportData() {
    let csvContent = "data:text/csv;charset=utf-8,";
    csvContent += "Subject Name,Date,Status\\r\\n";

    appState.subjects.forEach(s => {
        s.records.forEach(r => {
            csvContent += `"${s.name}","${r.date}","${r.status}"\\r\\n`;
        });
    });

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `attendance_export_${getTodayString()}.csv`);
    document.body.appendChild(link);

    link.click();

    document.body.removeChild(link);
    playActionWord('BAM!');
}

// --- Firebase Auth & DB Logic ---

function signInWithGoogle() {
    const provider = new firebase.auth.GoogleAuthProvider();
    auth.signInWithPopup(provider).catch(error => {
        console.error("Sign-in error:", error);
        alert("Failed to sign in: " + error.message);
    });
}

function signOut() {
    auth.signOut().catch(error => {
        console.error("Sign-out error:", error);
    });
}

function fetchUserData(uid) {
    db.collection('users').doc(uid).get().then(doc => {
        if (doc.exists) {
            appState = doc.data();
            if (!appState.meta.overallAttendance) {
                appState.meta.overallAttendance = 75; // fallback
            }
            renderApp();
        } else {
            // New user, does not exist in DB yet
            console.log("No data found for user, starting onboarding");
            // Check if local storage has data we could migrate
            const localData = localStorage.getItem(STORAGE_KEY);
            if (localData) {
                try {
                    appState = JSON.parse(localData);
                    saveState(); // Migrates to firestore
                    renderApp();
                    return;
                } catch (e) { }
            }
            showWizard();
        }
    }).catch(error => {
        console.error("Error fetching user data:", error);
        alert("Failed to load your data. Please check your connection.");
        if (Object.keys(appState.meta).length > 0 && appState.meta.userName !== '') {
            renderApp(); // Fallback to memory
        }
    });
}

// --- Global Context Bindings for HTML ---
window.signInWithGoogle = signInWithGoogle;
window.signOut = signOut;
window.exportData = exportData;
window.toggleTheme = toggleTheme;
window.markAttendance = markAttendance;
window.deleteSubject = deleteSubject;
window.openCalendarModal = openCalendarModal;
window.openCustomDateModal = openCustomDateModal;
window.closeCalendarModal = closeCalendarModal;
window.closeCustomDateModal = closeCustomDateModal;
window.closeAddSubjectModal = closeAddSubjectModal;
window.openAddSubjectModal = openAddSubjectModal;
window.prevMonth = prevMonth;
window.nextMonth = nextMonth;
