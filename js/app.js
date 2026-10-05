// js/app.js
import { supabase, isWithin7Days } from './supabaseClient.js';

let currentUserProfile = null;
let currentSession = null;

document.addEventListener('DOMContentLoaded', () => {
    initApp();
});

async function initApp() {
    setupEventListeners();
    await initAuth();
    await fetchAndRenderHouses();
    await loadFeedback();
    subscribeToRealtimeUpdates();
}

/**
 * Enables Supabase Realtime WebSocket subscriptions so all public clients update live
 */
function subscribeToRealtimeUpdates() {
    supabase
        .channel('public-bed-updates')
        .on(
            'postgres_changes',
            { event: '*', schema: 'public', table: 'beds' },
            () => {
                fetchAndRenderHouses();
                if (document.getElementById('orgDashboardModal')?.classList.contains('active')) {
                    renderOrgDashboard();
                }
            }
        )
        .on(
            'postgres_changes',
            { event: '*', schema: 'public', table: 'hold_requests' },
            () => fetchAndRenderHouses()
        )
        .subscribe();
}

/**
 * Initializes Supabase Auth listeners.
 * Relying solely on onAuthStateChange handles initial session load (INITIAL_SESSION) 
 * as well as SIGNED_IN, SIGNED_OUT, and TOKEN_REFRESHED events without duplicate runs.
 */
async function initAuth() {
    supabase.auth.onAuthStateChange(async (_event, session) => {
        await handleSessionChange(session);
    });
}

/**
 * Handles profile loading, email confirmation verification, and navbar state
 */
async function handleSessionChange(session) {
    currentSession = session;
    const alertBanner = document.getElementById('authAlertBanner');

    if (session) {
        const isEmailConfirmed = !!session.user.email_confirmed_at;

        if (!isEmailConfirmed && alertBanner) {
            alertBanner.className = 'alert-banner alert-warning';
            alertBanner.innerHTML = `
                ⚠️ <strong>Email Unconfirmed:</strong> Please check <code>${escapeHtml(session.user.email)}</code> and click the verification link.
                <button class="btn-text-link" id="bannerResendBtn">Resend Link</button>
            `;
            alertBanner.style.display = 'block';
            document.getElementById('bannerResendBtn')?.addEventListener('click', resendVerificationEmail);
        } else if (alertBanner) {
            alertBanner.style.display = 'none';
        }

        const { data: profile } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', session.user.id)
            .maybeSingle();

        if (profile) {
            currentUserProfile = profile;
        } else {
            currentUserProfile = {
                id: session.user.id,
                email: session.user.email,
                company_id: session.user.user_metadata?.company_id || null,
                house_id: session.user.user_metadata?.house_id || null
            };
        }

        updateUIForAuth(true);
        return;
    }

    currentUserProfile = null;
    if (alertBanner) alertBanner.style.display = 'none';
    updateUIForAuth(false);
}

/**
 * Toggles UI navbar buttons based on authentication state
 */
function updateUIForAuth(isLoggedIn) {
    const loginBtn = document.getElementById('openLoginModalBtn');
    const signUpBtn = document.getElementById('openSignUpModalBtn');
    const logoutBtn = document.getElementById('logoutBtn');
    const managerNav = document.getElementById('managerPortalNav');

    if (loginBtn) loginBtn.style.display = isLoggedIn ? 'none' : 'block';
    if (signUpBtn) signUpBtn.style.display = isLoggedIn ? 'none' : 'block';
    if (logoutBtn) logoutBtn.style.display = isLoggedIn ? 'block' : 'none';
    if (managerNav) managerNav.style.display = isLoggedIn ? 'block' : 'none';
}

function setupEventListeners() {
    // Public Filter controls
    document.getElementById('searchInput')?.addEventListener('input', debounce(fetchAndRenderHouses, 300));
    document.getElementById('regionFilter')?.addEventListener('change', fetchAndRenderHouses);
    document.getElementById('countyFilter')?.addEventListener('change', fetchAndRenderHouses);
    document.getElementById('genderFilter')?.addEventListener('change', fetchAndRenderHouses);
    document.getElementById('supportFilter')?.addEventListener('change', fetchAndRenderHouses);
    document.getElementById('availableOnlyToggle')?.addEventListener('change', fetchAndRenderHouses);

    // High Contrast Mode Toggle
    document.getElementById('contrastToggle')?.addEventListener('click', toggleHighContrast);

    // Auth Listeners
    document.getElementById('signupForm')?.addEventListener('submit', handleSignUp);
    document.getElementById('loginForm')?.addEventListener('submit', handleLogin);
    document.getElementById('logoutBtn')?.addEventListener('click', handleLogout);
    document.getElementById('resendConfirmBtn')?.addEventListener('click', resendVerificationEmail);

    // Public Form Submissions
    document.getElementById('holdModalForm')?.addEventListener('submit', handleStandbyHold);
    document.getElementById('feedbackForm')?.addEventListener('submit', handleFeedbackSubmit);
}

/**
 * Handles Company / Manager Sign Up with verification email trigger and origin redirect
 */
async function handleSignUp(e) {
    e.preventDefault();
    const orgName = document.getElementById('signupOrgName')?.value.trim();
    const email = document.getElementById('signupEmail')?.value.trim();
    const password = document.getElementById('signupPassword')?.value;

    if (!email || !password) return alert('Please complete all required fields.');

    const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
            data: { company_name: orgName },
            emailRedirectTo: `${window.location.origin}`
        }
    });

    if (error) {
        alert('Registration error: ' + error.message);
        return;
    }

    closeModal('signupModal');

    if (data.user && !data.session) {
        alert(`🎉 Account created! A confirmation email was sent to ${email}. Please verify your email before logging in.`);
    } else {
        alert('Account created successfully!');
        await handleSessionChange(data.session);
        await openOrgDashboard();
    }
}

/**
 * Resends email confirmation link
 */
async function resendVerificationEmail(e) {
    if (e) e.preventDefault();
    const email = currentSession?.user?.email || document.getElementById('loginEmail')?.value.trim();

    if (!email) {
        alert('Please enter your email address first.');
        return;
    }

    const { error } = await supabase.auth.resend({ type: 'signup', email });

    if (error) {
        alert('Could not resend email: ' + error.message);
    } else {
        alert(`Verification email resent to ${email}. Check your inbox and spam folder.`);
    }
}

/**
 * Handles Manager Sign In
 */
async function handleLogin(e) {
    e.preventDefault();
    const email = document.getElementById('loginEmail')?.value.trim();
    const password = document.getElementById('loginPassword')?.value;

    if (!email || !password) return alert('Please enter both email and password.');

    const { data, error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
        alert('Login failed: ' + error.message);
    } else {
        closeModal('loginModal');
        await handleSessionChange(data.session);
        await openOrgDashboard();
    }
}

/**
 * Opens Organization Dashboard Modal with email confirmation check
 */
window.openOrgDashboard = async function() {
    if (!currentSession) {
        alert('Please sign in to access your organization portal.');
        return;
    }

    if (!currentSession.user?.email_confirmed_at) {
        alert('⚠️ Please verify your email address before accessing the Management Portal.');
        return;
    }

    await renderOrgDashboard();
    document.getElementById('orgDashboardModal')?.classList.add('active');
};

/**
 * Renders individual house cards inside the Organization Portal
 */
async function renderOrgDashboard() {
    const grid = document.getElementById('orgHouseGrid');
    if (!grid) return;

    grid.innerHTML = '<div class="loading-spinner" role="status">Loading organization residences...</div>';

    let query = supabase
        .from('houses')
        .select(`
            *,
            companies(name),
            beds(total_beds, available_beds, last_updated_at)
        `);

    if (currentUserProfile?.company_id) {
        query = query.eq('company_id', currentUserProfile.company_id);
    } else if (currentUserProfile?.house_id) {
        query = query.eq('id', currentUserProfile.house_id);
    }

    const { data: houses, error } = await query;

    if (error) {
        grid.innerHTML = `<p class="error-msg" role="alert">Error loading houses: ${error.message}</p>`;
        return;
    }

    if (!houses || houses.length === 0) {
        grid.innerHTML = `
            <div class="no-results" role="status">
                <p>No recovery residences are currently assigned to your account.</p>
                <small>Contact MARR support to assign listings to your account.</small>
            </div>
        `;
        return;
    }

    const orgName = houses[0]?.companies?.name || 'Your Organization';
    const titleEl = document.getElementById('orgDashboardTitle');
    if (titleEl) titleEl.innerText = `🏢 ${orgName} Management Portal`;

    grid.innerHTML = '';

    houses.forEach(house => {
        const bedData = house.beds || { total_beds: 10, available_beds: 0, last_updated_at: null };
        const isFresh = isWithin7Days(bedData.last_updated_at);

        const card = document.createElement('div');
        card.className = 'org-house-card';

        card.innerHTML = `
            <div class="org-card-header">
                <div>
                    <h4>${escapeHtml(house.name)}</h4>
                    <p class="location-tag">📍 ${escapeHtml(house.city)}, ${escapeHtml(house.county)} Co.</p>
                </div>
                <span class="meta-pill ${isFresh ? 'fresh-updated' : 'stale-updated'}">
                    ${isFresh ? 'Updated < 7 days' : 'Needs Verification Update'}
                </span>
            </div>

            <form class="org-bed-form" onsubmit="handleHouseCardUpdate(event, '${house.id}')">
                <div class="form-row">
                    <div class="filter-group">
                        <label for="total-${house.id}">Total Capacity</label>
                        <input type="number" id="total-${house.id}" value="${bedData.total_beds ?? ''}" min="1" required>
                    </div>
                    <div class="filter-group">
                        <label for="available-${house.id}">Available Open Beds</label>
                        <input type="number" id="available-${house.id}" value="${bedData.available_beds ?? 0}" min="0" required>
                    </div>
                </div>
                <button type="submit" class="btn btn-success full-width">
                    ⚡ Update ${escapeHtml(house.name)} Status
                </button>
            </form>
        `;

        grid.appendChild(card);
    });
}

/**
 * Saves capacity updates for an individual house card inside the Organization Portal
 */
window.handleHouseCardUpdate = async function(e, houseId) {
    e.preventDefault();

    const totalBeds = parseInt(document.getElementById(`total-${houseId}`).value, 10);
    const availableBeds = parseInt(document.getElementById(`available-${houseId}`).value, 10);

    if (isNaN(totalBeds) || isNaN(availableBeds)) {
        alert('Please enter valid bed numbers.');
        return;
    }

    if (availableBeds > totalBeds) {
        alert('Available beds cannot exceed total capacity.');
        return;
    }

    const { error } = await supabase.from('beds').upsert([
        {
            house_id: houseId,
            total_beds: totalBeds,
            available_beds: availableBeds,
            last_updated_at: new Date().toISOString()
        }
    ], { onConflict: 'house_id' });

    if (error) {
        alert('Update failed: ' + error.message);
    } else {
        alert('⚡ Bed capacity updated and live across Maine!');
        await fetchAndRenderHouses();
        await renderOrgDashboard();
    }
};

/**
 * Handles Logout
 */
async function handleLogout() {
    const { error } = await supabase.auth.signOut();
    if (error) {
        alert('Logout failed: ' + error.message);
    } else {
        alert('Logged out successfully.');
        closeModal('orgDashboardModal');
        await fetchAndRenderHouses();
    }
}

/**
 * Fetches and renders all sober houses from Supabase into individual cards
 */
async function fetchAndRenderHouses() {
    const grid = document.getElementById('houseGrid');
    if (!grid) return;

    grid.innerHTML = '<div class="loading-spinner" role="status">Loading sober houses...</div>';

    const search = document.getElementById('searchInput')?.value.trim();
    const region = document.getElementById('regionFilter')?.value;
    const county = document.getElementById('countyFilter')?.value;
    const gender = document.getElementById('genderFilter')?.value;
    const support = document.getElementById('supportFilter')?.value;
    const availableOnly = document.getElementById('availableOnlyToggle')?.checked;

    // Fetch all houses with joined company and bed details from Supabase
    let query = supabase
        .from('houses')
        .select(`
            *,
            companies(name),
            beds(total_beds, available_beds, last_updated_at),
            hold_requests(id, expires_at, status)
        `);

    if (region) query = query.eq('region', region);
    if (county) query = query.eq('county', county);
    if (gender) query = query.eq('gender_served', gender);
    if (support) query = query.eq('support_level', support);

    const { data: houses, error } = await query;

    if (error) {
        grid.innerHTML = `<p class="error-msg" role="alert">Error loading directory: ${error.message}</p>`;
        return;
    }

    let filtered = houses || [];

    // Filter by search keyword (House Name, City, or Organization Name)
    if (search) {
        const term = search.toLowerCase();
        filtered = filtered.filter(h => 
            (h.name && h.name.toLowerCase().includes(term)) || 
            (h.city && h.city.toLowerCase().includes(term)) ||
            (h.companies?.name && h.companies.name.toLowerCase().includes(term))
        );
    }

    // Filter by available beds toggle
    if (availableOnly) {
        filtered = filtered.filter(h => h.beds && h.beds.available_beds > 0);
    }

    renderHouseCards(filtered);
}

/**
 * Renders public summary banner metrics
 */
function renderPublicSummaryBanner(totalHouses, totalAvailable, totalCapacity) {
    const banner = document.getElementById('publicSummaryBanner');
    if (!banner) return;

    banner.innerHTML = `
        <div class="summary-stats">
            <span><strong>${totalHouses}</strong> Residences Listed</span>
            <span><strong>${totalAvailable}</strong> Open Beds Available</span>
            <span><strong>${totalCapacity}</strong> Total Capacity</span>
        </div>
    `;
}

/**
 * Renders individual cards for each sober house listed in Supabase
 */
function renderHouseCards(houses) {
    const grid = document.getElementById('houseGrid');
    if (!grid) return;

    grid.innerHTML = '';

    if (!houses || houses.length === 0) {
        grid.innerHTML = '<div class="no-results" role="status">No recovery residences found matching your criteria.</div>';
        return;
    }

    // Calculate public aggregate metrics
    let totalAvailableBeds = 0;
    let totalCapacity = 0;

    houses.forEach(house => {
        const bedData = house.beds || { total_beds: 0, available_beds: 0 };
        const activeHolds = (house.hold_requests || []).filter(r => r.status === 'active' && new Date(r.expires_at) > new Date());
        const netAvailable = Math.max(0, bedData.available_beds - activeHolds.length);

        totalAvailableBeds += netAvailable;
        totalCapacity += (bedData.total_beds || 0);
    });

    renderPublicSummaryBanner(houses.length, totalAvailableBeds, totalCapacity);

    // Create an individual card element for each sober house
    houses.forEach(house => {
        const bedData = house.beds || { total_beds: 0, available_beds: 0, last_updated_at: null };
        const isFresh = isWithin7Days(bedData.last_updated_at);
        const activeHolds = (house.hold_requests || []).filter(r => r.status === 'active' && new Date(r.expires_at) > new Date());
        const netAvailable = Math.max(0, bedData.available_beds - activeHolds.length);
        
        const orgName = house.companies?.name || 'Independent Residence';
        const houseName = house.name || 'Unnamed Sober House';
        const genderServed = house.gender_served || 'All Populations';
        const supportLevel = house.support_level || 'Peer-Run Recovery';

        const card = document.createElement('article');
        card.className = 'house-card';
        card.setAttribute('aria-label', `${houseName}, operated by ${orgName}`);

        card.innerHTML = `
            <div class="card-header">
                <div>
                    <!-- Organization / Company Name -->
                    <span class="company-tag">🏢 ${escapeHtml(orgName)}</span>
                    
                    <!-- Sober House Name -->
                    <h3 class="house-title">${escapeHtml(houseName)}</h3>
                    
                    <!-- Location -->
                    <p class="location-tag">📍 ${escapeHtml(house.city || 'N/A')}, ${escapeHtml(house.county || '')} Co. (${escapeHtml(house.region || 'Maine')})</p>
                </div>
                ${house.is_marr_certified ? `
                    <div class="marr-badge" title="MARR Certified Recovery Residence">
                        ✓ MARR Verified
                    </div>
                ` : ''}
            </div>

            <!-- Bed Count & Capacity Display -->
            <div class="bed-stat-box ${netAvailable > 0 ? 'status-open' : 'status-full'}">
                <div class="bed-count-number">${netAvailable}</div>
                <div class="bed-count-label">
                    <strong>${netAvailable === 1 ? 'Open Bed Available' : 'Open Beds Available'}</strong>
                    <small>out of ${bedData.total_beds} Total Capacity</small>
                </div>
            </div>

            <!-- Population Served & House Details -->
            <div class="card-meta">
                <span class="meta-pill" title="Population Served">
                    👤 <strong>Serves:</strong> ${escapeHtml(genderServed)}
                </span>
                <span class="meta-pill" title="Level of Support">
                    🛡️ <strong>Support:</strong> ${escapeHtml(supportLevel)}
                </span>
                <span class="meta-pill ${isFresh ? 'fresh-updated' : 'stale-updated'}">
                    ⏱️ ${isFresh ? 'Bed info updated recently' : 'Needs Verification Update'}
                </span>
            </div>

            ${activeHolds.length > 0 ? `<p class="hold-warning">⚠️ ${activeHolds.length} temporary 24-hr hold(s) pending on this house.</p>` : ''}

            <!-- Contact & Hold Action Buttons -->
            <div class="card-actions">
                <button class="btn btn-secondary" onclick="openHoldModal('${house.id}', '${escapeHtml(houseName)}')" ${netAvailable === 0 ? 'disabled' : ''}>
                    ⏱ Hold Bed (24 Hours)
                </button>
                <a href="${house.phone ? 'tel:' + escapeHtml(house.phone) : '#'}" class="btn btn-primary" ${!house.phone ? 'aria-disabled="true"' : ''}>
                    📞 Contact ${escapeHtml(houseName)}
                </a>
            </div>
        `;

        grid.appendChild(card);
    });
}

/**
 * Public 24-Hour Hold Submission
 */
async function handleStandbyHold(e) {
    e.preventDefault();
    const houseId = document.getElementById('holdHouseId').value;
    const clientAlias = document.getElementById('holdAlias').value.trim() || 'Anonymous Client';
    const contactPhone = document.getElementById('holdPhone').value.trim();

    const { error } = await supabase.from('hold_requests').insert([
        {
            house_id: houseId,
            client_alias: clientAlias,
            contact_phone: contactPhone,
            expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
        }
    ]);

    if (error) {
        alert('Could not place hold: ' + error.message);
    } else {
        alert('24-Hour Standby Hold confirmed!');
        closeModal('holdModal');
        await fetchAndRenderHouses();
    }
}

/**
 * Public Feedback Submission
 */
async function handleFeedbackSubmit(e) {
    e.preventDefault();
    const category = document.getElementById('feedbackCategory').value;
    const message = document.getElementById('feedbackMessage').value.trim();

    const { error } = await supabase.from('feedback').insert([{ category, message }]);

    if (error) {
        alert('Error submitting feedback: ' + error.message);
    } else {
        alert('Thank you for contributing to Apertus.');
        document.getElementById('feedbackForm').reset();
        await loadFeedback();
    }
}

async function loadFeedback() {
    const list = document.getElementById('feedbackList');
    if (!list) return;

    const { data } = await supabase.from('feedback').select('*').order('created_at', { ascending: false }).limit(5);

    if (data) {
        list.innerHTML = data.map(item => `
            <div class="feedback-card">
                <div class="feedback-header">
                    <strong>${escapeHtml(item.category)}</strong>
                    <span class="badge badge-${(item.status || 'pending').toLowerCase().replace(' ', '-')}">${escapeHtml(item.status || 'Pending')}</span>
                </div>
                <p>${escapeHtml(item.message)}</p>
            </div>
        `).join('');
    }
}

function toggleHighContrast() {
    document.body.classList.toggle('high-contrast');
    const isHigh = document.body.classList.contains('high-contrast');
    localStorage.setItem('apertus_high_contrast', isHigh ? 'true' : 'false');
}

function debounce(func, wait) {
    let timeout;
    return (...args) => {
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(this, args), wait);
    };
}

function escapeHtml(str) {
    return String(str || '').replace(/[&<>"']/g, m => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
    }[m]));
}

// Global modal helpers
window.openHoldModal = (houseId, houseName) => {
    document.getElementById('holdHouseId').value = houseId;
    document.getElementById('holdHouseTitle').innerText = houseName;
    document.getElementById('holdModal').classList.add('active');
};

window.closeModal = (modalId) => {
    document.getElementById(modalId)?.classList.remove('active');
};