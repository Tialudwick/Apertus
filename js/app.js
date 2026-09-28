// js/app.js
import { supabase, isWithin7Days } from './supabaseClient.js';

document.addEventListener('DOMContentLoaded', () => {
    initApp();
});

async function initApp() {
    setupEventListeners();
    await fetchAndRenderHouses();
    await loadFeedback();
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

    // Modal Listeners
    document.getElementById('holdModalForm')?.addEventListener('submit', handleStandbyHold);
    document.getElementById('quickUpdateForm')?.addEventListener('submit', handleManagerBedUpdate);
    document.getElementById('feedbackForm')?.addEventListener('submit', handleFeedbackSubmit);
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

    // Client-side search and availability filtering
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
                <button class="btn btn-secondary" onclick="openHoldModal('${house.id}', '${escapeHtml(house.name)}') ${netAvailable === 0 ? 'disabled' : ''}">
                    ⏱️ Hold Bed for 24 Hours
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
 * Rapid 30-Second House Manager Bed Count Update
 */
async function handleManagerBedUpdate(e) {
    e.preventDefault();
    const houseId = document.getElementById('managerHouseSelect').value;
    const totalBeds = parseInt(document.getElementById('managerTotalBeds').value, 10);
    const availableBeds = parseInt(document.getElementById('managerAvailableBeds').value, 10);

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
        alert('Bed availability successfully updated in under 30 seconds!');
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
                    <span class="badge badge-${item.status.toLowerCase().replace(' ', '-')}">${escapeHtml(item.status)}</span>
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
    document.getElementById(modalId).classList.remove('active');
};