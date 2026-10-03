// js/app.js
import { supabase, isWithin7Days } from './supabaseClient.js';

// Track active manager profile across the app session
let currentUserProfile = null;

document.addEventListener('DOMContentLoaded', () => {
    initApp();
});

async function initApp() {
    setupEventListeners();
    await initAuth();
    await populateManagerHouseDropdown();
    await fetchAndRenderHouses();
    await loadFeedback();
}

/**
 * Initializes Supabase Auth listeners & checks existing session
 */
async function initAuth() {
    const { data: { session } } = await supabase.auth.getSession();
    await handleSessionChange(session);

    // Listen for auth state changes (login, logout, token refresh)
    supabase.auth.onAuthStateChange(async (_event, session) => {
        await handleSessionChange(session);
    });
}

/**
 * Handles profile fetching and UI state toggle on Auth change
 */
async function handleSessionChange(session) {
    if (session) {
        const { data: profile, error } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', session.user.id)
            .single();

        if (!error && profile) {
            currentUserProfile = profile;
            updateUIForAuth(true);
            return;
        }
    }

    currentUserProfile = null;
    updateUIForAuth(false);
}

/**
 * Toggles UI elements based on authentication status
 */
function updateUIForAuth(isLoggedIn) {
    const loginBtn = document.getElementById('openLoginModalBtn');
    const logoutBtn = document.getElementById('logoutBtn');
    const managerNav = document.getElementById('managerPortalNav');
    const houseSelectContainer = document.getElementById('managerHouseSelectGroup');

    if (loginBtn) loginBtn.style.display = isLoggedIn ? 'none' : 'block';
    if (logoutBtn) logoutBtn.style.display = isLoggedIn ? 'block' : 'none';
    if (managerNav) managerNav.style.display = isLoggedIn ? 'block' : 'none';

    // If manager has a specific house_id assigned, pre-select or lock the house field
    const houseSelect = document.getElementById('managerHouseSelect');
    if (houseSelect && currentUserProfile?.house_id) {
        houseSelect.value = currentUserProfile.house_id;
        if (houseSelectContainer) houseSelectContainer.style.display = 'none'; // Hide dropdown if tied to 1 house
    } else if (houseSelectContainer) {
        houseSelectContainer.style.display = 'block';
    }
}

/**
 * Populates the House Manager modal select dropdown with all registered residences from Supabase
 */
async function populateManagerHouseDropdown() {
    const select = document.getElementById('managerHouseSelect');
    if (!select) return;

    const { data: houses, error } = await supabase
        .from('houses')
        .select('id, name, city')
        .order('name', { ascending: true });

    if (error) {
        console.error('Error fetching house list for dropdown:', error);
        return;
    }

    select.innerHTML = '<option value="">Select your assigned residence...</option>';

    houses.forEach(house => {
        const option = document.createElement('option');
        option.value = house.id;
        option.textContent = `${house.name} (${house.city})`;
        select.appendChild(option);
    });

    if (currentUserProfile?.house_id) {
        select.value = currentUserProfile.house_id;
    }
}

function setupEventListeners() {
    // Filter controls
    document.getElementById('searchInput')?.addEventListener('input', debounce(fetchAndRenderHouses, 300));
    document.getElementById('regionFilter')?.addEventListener('change', fetchAndRenderHouses);
    document.getElementById('countyFilter')?.addEventListener('change', fetchAndRenderHouses);
    document.getElementById('genderFilter')?.addEventListener('change', fetchAndRenderHouses);
    document.getElementById('supportFilter')?.addEventListener('change', fetchAndRenderHouses);
    document.getElementById('availableOnlyToggle')?.addEventListener('change', fetchAndRenderHouses);

    // High Contrast Mode Toggle
    document.getElementById('contrastToggle')?.addEventListener('click', toggleHighContrast);

    // Auth Listeners
    document.getElementById('loginForm')?.addEventListener('submit', handleLogin);
    document.getElementById('logoutBtn')?.addEventListener('click', handleLogout);

    // Manager house select listener to pre-fill current bed numbers on selection
    document.getElementById('managerHouseSelect')?.addEventListener('change', loadSelectedHouseBedData);

    // Modal Listeners
    document.getElementById('holdModalForm')?.addEventListener('submit', handleStandbyHold);
    document.getElementById('quickUpdateForm')?.addEventListener('submit', handleManagerBedUpdate);
    document.getElementById('feedbackForm')?.addEventListener('submit', handleFeedbackSubmit);
}

/**
 * Pre-fills current bed counts when a house is selected in the dropdown
 */
async function loadSelectedHouseBedData(e) {
    const houseId = e.target.value;
    if (!houseId) return;

    const { data: bed } = await supabase
        .from('beds')
        .select('total_beds, available_beds')
        .eq('house_id', houseId)
        .maybeSingle();

    if (bed) {
        document.getElementById('managerTotalBeds').value = bed.total_beds || '';
        document.getElementById('managerAvailableBeds').value = bed.available_beds ?? 0;
    }
}

/**
 * User Login Handler
 */
async function handleLogin(e) {
    e.preventDefault();
    const email = document.getElementById('loginEmail')?.value.trim();
    const password = document.getElementById('loginPassword')?.value;

    if (!email || !password) return alert('Please enter both email and password.');

    const { error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
        alert('Login failed: ' + error.message);
    } else {
        alert('Successfully logged in!');
        closeModal('loginModal');
        await populateManagerHouseDropdown();
        await fetchAndRenderHouses();
    }
}

/**
 * User Logout Handler
 */
async function handleLogout() {
    const { error } = await supabase.auth.signOut();
    if (error) {
        alert('Logout failed: ' + error.message);
    } else {
        alert('Logged out successfully.');
        await fetchAndRenderHouses();
    }
}

/**
 * Fetches houses and beds with real-time multi-parameter filters
 */
async function fetchAndRenderHouses() {
    const grid = document.getElementById('houseGrid');
    if (!grid) return;

    grid.innerHTML = '<div class="loading-spinner" role="status">Loading real-time availability...</div>';

    const search = document.getElementById('searchInput')?.value.trim();
    const region = document.getElementById('regionFilter')?.value;
    const county = document.getElementById('countyFilter')?.value;
    const gender = document.getElementById('genderFilter')?.value;
    const support = document.getElementById('supportFilter')?.value;
    const availableOnly = document.getElementById('availableOnlyToggle')?.checked;

    let query = supabase
        .from('houses')
        .select(`
            *,
            companies(name),
            beds(total_beds, available_beds, last_updated_at),
            hold_requests(id, expires_at, status)
        `)
        .eq('is_marr_certified', true);

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

    if (search) {
        const term = search.toLowerCase();
        filtered = filtered.filter(h => 
            h.name.toLowerCase().includes(term) || 
            h.city.toLowerCase().includes(term) ||
            h.companies?.name.toLowerCase().includes(term)
        );
    }

    if (availableOnly) {
        filtered = filtered.filter(h => h.beds && h.beds.available_beds > 0);
    }

    renderHouseCards(filtered);
}

/**
 * Renders WCAG-compliant cards for each recovery house
 */
function renderHouseCards(houses) {
    const grid = document.getElementById('houseGrid');
    grid.innerHTML = '';

    if (houses.length === 0) {
        grid.innerHTML = '<div class="no-results" role="status">No recovery residences found matching your criteria.</div>';
        return;
    }

    houses.forEach(house => {
        const bedData = house.beds || { total_beds: 0, available_beds: 0, last_updated_at: null };
        const isFresh = isWithin7Days(bedData.last_updated_at);
        const activeHolds = (house.hold_requests || []).filter(r => r.status === 'active' && new Date(r.expires_at) > new Date());
        const netAvailable = Math.max(0, bedData.available_beds - activeHolds.length);

        const card = document.createElement('article');
        card.className = 'house-card';
        card.setAttribute('aria-label', `${house.name}, ${house.city}`);

        card.innerHTML = `
            <div class="card-header">
                <div>
                    <span class="company-tag">${escapeHtml(house.companies?.name || 'Independent')}</span>
                    <h3>${escapeHtml(house.name)}</h3>
                    <p class="location-tag">📍 ${escapeHtml(house.city)}, ${escapeHtml(house.county)} Co. (${escapeHtml(house.region)})</p>
                </div>
                <div class="marr-badge" title="MARR Certified Residence">
                    ✓ MARR Verified
                </div>
            </div>

            <div class="bed-stat-box ${netAvailable > 0 ? 'status-open' : 'status-full'}">
                <div class="bed-count-number">${netAvailable}</div>
                <div class="bed-count-label">
                    ${netAvailable === 1 ? 'Open Bed' : 'Open Beds'} 
                    <small>(${bedData.total_beds} Total Capacity)</small>
                </div>
            </div>

            <div class="card-meta">
                <span class="meta-pill">👤 ${escapeHtml(house.gender_served)}</span>
                <span class="meta-pill">🛡️ ${escapeHtml(house.support_level)}</span>
                <span class="meta-pill ${isFresh ? 'fresh-updated' : 'stale-updated'}">
                    ⏱️ ${isFresh ? 'Updated < 7 days ago' : 'Needs Verification Update'}
                </span>
            </div>

            ${activeHolds.length > 0 ? `<p class="hold-warning">⚠️ ${activeHolds.length} 24-hr hold(s) currently pending on this house.</p>` : ''}

            <div class="card-actions">
                <button class="btn btn-secondary" onclick="openHoldModal('${house.id}', '${escapeHtml(house.name)}')" ${netAvailable === 0 ? 'disabled' : ''}>
                    ⏱ Hold Bed for 24 Hours
                </button>
                <a href="tel:${escapeHtml(house.phone || '')}" class="btn btn-primary" ${!house.phone ? 'aria-disabled="true"' : ''}>
                    📞 Contact Residence
                </a>
            </div>
        `;

        grid.appendChild(card);
    });
}

/**
 * Handles 24-Hour Standby Bed Hold Creation
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
        alert('24-Hour Standby Hold confirmed! The bed status has been updated.');
        closeModal('holdModal');
        await fetchAndRenderHouses();
    }
}

/**
 * Rapid House Manager Bed Count Update (Secured by Auth)
 */
async function handleManagerBedUpdate(e) {
    e.preventDefault();

    const houseId = currentUserProfile?.house_id || document.getElementById('managerHouseSelect')?.value;
    const totalBeds = parseInt(document.getElementById('managerTotalBeds').value, 10);
    const availableBeds = parseInt(document.getElementById('managerAvailableBeds').value, 10);

    if (!houseId) {
        alert('Please select a residence to update.');
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
        alert('Bed availability successfully updated!');
        closeModal('managerModal');
        await fetchAndRenderHouses();
    }
}

/**
 * Community Feedback Submission
 */
async function handleFeedbackSubmit(e) {
    e.preventDefault();
    const category = document.getElementById('feedbackCategory').value;
    const message = document.getElementById('feedbackMessage').value.trim();

    const { error } = await supabase.from('feedback').insert([{ category, message }]);

    if (error) {
        alert('Error submitting feedback: ' + error.message);
    } else {
        alert('Thank you for contributing to Apertus. Your feedback has been submitted.');
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

// Global scope helpers for HTML onclick attributes
window.openHoldModal = (houseId, houseName) => {
    document.getElementById('holdHouseId').value = houseId;
    document.getElementById('holdHouseTitle').innerText = houseName;
    document.getElementById('holdModal').classList.add('active');
};

window.closeModal = (modalId) => {
    document.getElementById(modalId)?.classList.remove('active');
};