import { supabase, fetchHouses } from './supabaseClient.js';

document.addEventListener('DOMContentLoaded', () => {
    initPublicApp();
});

async function initPublicApp() {
    setupFilterListeners();
    await fetchAndRenderHouses();
    subscribeToRealtimeUpdates();
}

function setupFilterListeners() {
    document.getElementById('searchInput')?.addEventListener('input', debounce(fetchAndRenderHouses, 300));
    document.getElementById('regionFilter')?.addEventListener('change', fetchAndRenderHouses);
    document.getElementById('countyFilter')?.addEventListener('change', fetchAndRenderHouses);
    document.getElementById('genderFilter')?.addEventListener('change', fetchAndRenderHouses);
    document.getElementById('supportFilter')?.addEventListener('change', fetchAndRenderHouses);
    document.getElementById('availableOnlyToggle')?.addEventListener('change', fetchAndRenderHouses);
}

async function fetchAndRenderHouses() {
    const grid = document.getElementById('houseGrid');
    if (!grid) return;

    grid.innerHTML = '<div class="loading-spinner">Loading sober houses...</div>';

    const search = document.getElementById('searchInput')?.value.trim();
    const region = document.getElementById('regionFilter')?.value;
    const county = document.getElementById('countyFilter')?.value;
    const gender = document.getElementById('genderFilter')?.value;
    const supportLevel = document.getElementById('supportFilter')?.value;
    const availableOnly = document.getElementById('availableOnlyToggle')?.checked;

    let query = supabase.from('houses').select('*');

    if (region) query = query.eq('region', region);
    if (county) query = query.eq('county', county);
    if (supportLevel) query = query.eq('level_of_support', supportLevel);

    const { data: houses, error } = await query;

    if (error) {
        grid.innerHTML = `<p class="error-msg">Error loading directory: ${error.message}</p>`;
        return;
    }

    let filtered = houses || [];

    if (gender) {
        filtered = filtered.filter(h => 
            (h.population && h.population.toLowerCase().includes(gender.toLowerCase())) ||
            (h.gender && h.gender.toLowerCase().includes(gender.toLowerCase()))
        );
    }

    if (availableOnly) {
        filtered = filtered.filter(h => (h.available_beds || 0) > 0);
    }

    if (search) {
        const term = search.toLowerCase();
        filtered = filtered.filter(h => 
            (h.house_name && h.house_name.toLowerCase().includes(term)) || 
            (h.city && h.city.toLowerCase().includes(term)) ||
            (h.parent_company && h.parent_company.toLowerCase().includes(term))
        );
    }

    updateKPISummary(houses || []);
    renderHouseCards(filtered);
}

function updateKPISummary(allHouses) {
    let totalAvail = 0;
    let totalOcc = 0;
    let totalRes = 0;
    let totalMaint = 0;

    allHouses.forEach(h => {
        totalAvail += Number(h.available_beds) || 0;
        totalOcc += Number(h.occupied_beds) || 0;
        totalRes += Number(h.reserved_beds) || 0;
        totalMaint += Number(h.maintenance_beds) || 0;
    });

    const grandTotal = totalAvail + totalOcc + totalRes + totalMaint;
    const occPct = grandTotal > 0 ? Math.round((totalOcc / grandTotal) * 100) : 0;

    const elAvail = document.getElementById('kpiAvailable');
    const elOcc = document.getElementById('kpiOccupied');
    const elRes = document.getElementById('kpiReserved');
    const elMaint = document.getElementById('kpiMaintenance');
    const elPct = document.getElementById('totalOccupancyPct');

    if (elAvail) elAvail.textContent = totalAvail;
    if (elOcc) elOcc.textContent = totalOcc;
    if (elRes) elRes.textContent = totalRes;
    if (elMaint) elMaint.textContent = totalMaint;
    if (elPct) elPct.textContent = `${occPct}%`;

    const subAvail = document.getElementById('kpiAvailableSub');
    const subOcc = document.getElementById('kpiOccupiedSub');
    const subRes = document.getElementById('kpiReservedSub');
    const subMaint = document.getElementById('kpiMaintenanceSub');

    if (subAvail) subAvail.textContent = `of ${grandTotal} total beds`;
    if (subOcc) subOcc.textContent = `of ${grandTotal} total beds`;
    if (subRes) subRes.textContent = `of ${grandTotal} total beds`;
    if (subMaint) subMaint.textContent = `of ${grandTotal} total beds`;
}

function renderHouseCards(houses) {
    const grid = document.getElementById('houseGrid');
    if (!grid) return;

    grid.innerHTML = '';

    if (!houses || houses.length === 0) {
        grid.innerHTML = '<div class="no-results">No recovery residences found matching your criteria.</div>';
        return;
    }

    houses.forEach(house => {
        const card = document.createElement('article');
        card.className = 'house-card';

        const parentOrg = house.parent_company || house.company_name || 'Independent Residence';
        const rentDisplay = house.rent_amount ? `$${Number(house.rent_amount).toLocaleString()}/mo` : 'Contact for Rent';
        const moveInDisplay = house.move_in_cost ? `$${Number(house.move_in_cost).toLocaleString()}` : 'Contact for Details';
        const insuranceDisplay = house.insurance_accepted || 'Self-Pay / Cash';

        let amenitiesList = [];
        if (Array.isArray(house.amenities)) {
            amenitiesList = house.amenities;
        } else if (typeof house.amenities === 'string') {
            amenitiesList = house.amenities.split(',').map(a => a.trim());
        }

        const amenitiesHTML = amenitiesList.length > 0 
            ? amenitiesList.map(item => `<span class="amenity-tag">✓ ${escapeHtml(item)}</span>`).join(' ')
            : '<span class="text-muted">None listed</span>';

        const availCount = house.available_beds || 0;
        const totalHouseCapacity = (availCount + (house.occupied_beds || 0) + (house.reserved_beds || 0) + (house.maintenance_beds || 0)) || 10;

        card.innerHTML = `
            <div class="card-top">
                <div class="card-title-group">
                    <span class="org-sub-label">ORGANIZATION: ${escapeHtml(parentOrg)}</span>
                    <h3 class="house-name">${escapeHtml(house.house_name)}</h3>
                    <p class="house-location">${escapeHtml(house.city || 'N/A')}, ${escapeHtml(house.county || '')} County</p>
                </div>

                ${getBedGaugeHTML(availCount, totalHouseCapacity)}
            </div>

            <div class="card-tags-row">
                <span class="pill-tag tag-blue">Serving: ${escapeHtml(house.population || house.gender || 'N/A')}</span>
                <span class="pill-tag tag-dark">NARR Level ${house.level_of_support || 2} ${house.narr_type ? `(${escapeHtml(house.narr_type)})` : ''}</span>
                <span class="pill-tag ${house.allows_moud !== false ? 'tag-green' : 'tag-red'}">
                    ${house.allows_moud !== false ? '✓ Allows MOUD' : '✕ No MOUD'}
                </span>
            </div>

            ${house.description ? `<p class="house-description">${escapeHtml(house.description)}</p>` : ''}

            <div class="pricing-grid">
                <div class="price-box">
                    <span class="price-label">Move-In Fee</span>
                    <span class="price-val">${moveInDisplay}</span>
                </div>
                <div class="price-box">
                    <span class="price-label">Monthly Rent</span>
                    <span class="price-val">${rentDisplay}</span>
                </div>
                <div class="price-box full-width-box">
                    <span class="price-label">Insurance / Payment Accepted</span>
                    <span class="price-val text-cyan">${escapeHtml(insuranceDisplay)}</span>
                </div>
            </div>

            <div class="contact-footer">
                <div class="contact-info">
                    ${house.contact_name ? `<span>👤 <strong>Contact:</strong> ${escapeHtml(house.contact_name)}</span>` : ''}
                    ${house.phone ? `<span>📞 <a href="tel:${escapeHtml(house.phone)}">${escapeHtml(house.phone)}</a></span>` : ''}
                    ${house.email ? `<span>✉️ <a href="mailto:${escapeHtml(house.email)}">${escapeHtml(house.email)}</a></span>` : ''}
                </div>

                <div class="action-links">
                    ${house.website ? `<a href="${escapeHtml(house.website)}" target="_blank" class="btn-sm btn-dark">🌐 Website</a>` : ''}
                    ${house.application_link ? `<a href="${escapeHtml(house.application_link)}" target="_blank" class="btn-sm btn-blue">📝 Apply Now</a>` : ''}
                </div>
            </div>

            <details class="details-accordion">
                <summary>View Amenities, Policies & Extra Details ▼</summary>
                <div class="details-content">
                    <strong style="color: #94a3b8; display: block; margin-bottom: 0.4rem;">Amenities:</strong>
                    <div class="amenities-container">${amenitiesHTML}</div>
                </div>
            </details>
        `;
        grid.appendChild(card);
    });
}

function getBedGaugeHTML(openBeds, totalBeds) {
    const totalArcLength = 126;
    const ratio = totalBeds > 0 ? Math.min(openBeds / totalBeds, 1) : 0;
    const dashOffset = totalArcLength * (1 - ratio);
    const gaugeColor = openBeds > 0 ? '#10b981' : '#64748b';

    return `
        <div class="bed-gauge-container">
            <svg class="bed-gauge-svg" viewBox="0 0 100 60">
                <path class="gauge-bg" d="M 10,50 A 40,40 0 0,1 90,50" />
                <path class="gauge-fill" 
                      d="M 10,50 A 40,40 0 0,1 90,50" 
                      style="stroke-dashoffset: ${dashOffset}; stroke: ${gaugeColor};" />
                <g class="bed-icon-group" transform="translate(37, 28)">
                    <rect x="0" y="2" width="3" height="15" rx="1" />
                    <rect x="4" y="9" width="21" height="5" rx="1" />
                    <rect x="4" y="6" width="6" height="4" rx="1" class="pillow" />
                    <rect x="0" y="14" width="25" height="2" rx="1" />
                    <rect x="23" y="14" width="2" height="4" rx="1" />
                </g>
            </svg>
            <div class="gauge-text">
                <span class="count" style="color: ${gaugeColor}">${openBeds}</span>
                <span class="label">OPEN BEDS</span>
            </div>
        </div>
    `;
}

function subscribeToRealtimeUpdates() {
    supabase.channel('public-bed-updates')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'houses' }, () => {
            fetchAndRenderHouses();
        })
        .subscribe();
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

function getBedGaugeHTML(openBeds, totalBeds) {
    const totalArcLength = 110;
    const ratio = totalBeds > 0 ? Math.min(openBeds / totalBeds, 1) : 0;
    const dashOffset = totalArcLength * (1 - ratio);
    const gaugeColor = openBeds > 0 ? '#22c55e' : '#94a3b8';

    return `
        <div class="bed-gauge-container">
            <svg class="bed-gauge-svg" viewBox="0 0 100 60">
                <path class="gauge-bg" d="M 15,50 A 35,35 0 0,1 85,50" />
                <path class="gauge-fill" 
                      d="M 15,50 A 35,35 0 0,1 85,50" 
                      style="stroke-dashoffset: ${dashOffset}; stroke: ${gaugeColor};" />
                <g class="bed-icon-group" transform="translate(37, 26)">
                    <rect x="0" y="2" width="3" height="15" rx="1" fill="#38bdf8" />
                    <rect x="4" y="9" width="21" height="5" rx="1" fill="#38bdf8" />
                    <rect x="4" y="6" width="6" height="4" rx="1" fill="#cbd5e1" />
                    <rect x="0" y="14" width="25" height="2" rx="1" fill="#38bdf8" />
                    <rect x="23" y="14" width="2" height="4" rx="1" fill="#38bdf8" />
                </g>
            </svg>
            <div class="gauge-text">
                <span class="count" style="color: ${gaugeColor}">${openBeds}</span>
                <span class="label">OPEN BEDS</span>
            </div>
        </div>
    `;
}