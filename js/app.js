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
        grid.innerHTML = '<div class="no-results" style="padding: 1rem; color: var(--text-muted);">No recovery residences found matching your criteria.</div>';
        return;
    }

    houses.forEach(house => {
        const card = document.createElement('article');
        card.className = 'house-card';
        card.style.cssText = 'background: #1e293b; border: 1px solid var(--card-border, #334155); border-radius: 10px; padding: 1.5rem; margin-bottom: 1.25rem; color: #e2e8f0;';
        
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
            ? amenitiesList.map(item => `<span style="background: #0f172a; border: 1px solid #334155; color: #cbd5e1; font-size: 0.75rem; padding: 0.25rem 0.5rem; border-radius: 4px; display: inline-block; margin: 0.15rem;">✓ ${escapeHtml(item)}</span>`).join(' ')
            : '<span style="color: #64748b; font-size: 0.85rem;">None listed</span>';

        card.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 1rem;">
                <div>
                    <div style="font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.05em; color: #38bdf8; font-weight: 700; margin-bottom: 0.2rem;">
                        Organization: ${escapeHtml(parentOrg)}
                    </div>
                    <h3 style="margin: 0; color: #fff; font-size: 1.35rem; font-weight: 800;">
                        ${escapeHtml(house.house_name)}
                    </h3>
                    <p style="margin: 0.3rem 0 0 0; color: #94a3b8; font-size: 0.9rem;">
                        ${escapeHtml(house.city || 'N/A')}, ${escapeHtml(house.county || '')} County
                    </p>
                </div>

                <div style="background: #0f172a; padding: 0.5rem 1rem; border-radius: 8px; text-align: center; border: 1px solid #334155; min-width: 100px;">
                    <span style="font-size: 1.4rem; font-weight: bold; color: ${house.available_beds > 0 ? '#22c55e' : '#94a3b8'};">
                        ${house.available_beds || 0}
                    </span>
                    <span style="font-size: 0.7rem; color: #94a3b8; display: block; text-transform: uppercase; font-weight: 600;">Open Beds</span>
                </div>
            </div>

            <div style="display: flex; flex-wrap: wrap; gap: 0.5rem; margin-top: 1rem; align-items: center;">
                <span style="background: #0284c7; color: #fff; padding: 0.25rem 0.65rem; border-radius: 12px; font-size: 0.8rem; font-weight: 600;">
                    Serving: ${escapeHtml(house.population || house.gender || 'N/A')}
                </span>

                <span style="background: #334155; color: #38bdf8; padding: 0.25rem 0.65rem; border-radius: 12px; font-size: 0.8rem; font-weight: 600;">
                    NARR Level ${house.level_of_support || 2} ${house.narr_type ? `(${escapeHtml(house.narr_type)})` : ''}
                </span>

                <span style="background: ${house.allows_moud !== false ? '#166534' : '#7f1d1d'}; color: #fff; padding: 0.25rem 0.65rem; border-radius: 12px; font-size: 0.8rem; font-weight: 600;">
                    ${house.allows_moud !== false ? '✓ Allows MOUD' : '✕ No MOUD'}
                </span>
            </div>

            ${house.description ? `
                <p style="margin: 1rem 0; color: #cbd5e1; font-size: 0.9rem; line-height: 1.5; background: #0f172a; padding: 0.75rem 1rem; border-radius: 6px; border-left: 3px solid #38bdf8;">
                    ${escapeHtml(house.description)}
                </p>
            ` : ''}

            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 0.75rem; margin-top: 1rem; font-size: 0.85rem;">
                <div style="background: #0f172a; padding: 0.6rem 0.8rem; border-radius: 6px; border: 1px solid #1e293b;">
                    <div style="color: #94a3b8; font-size: 0.75rem;">Move-In Fee</div>
                    <div style="color: #f8fafc; font-weight: 700; margin-top: 0.1rem; font-size: 0.95rem;">${moveInDisplay}</div>
                </div>

                <div style="background: #0f172a; padding: 0.6rem 0.8rem; border-radius: 6px; border: 1px solid #1e293b;">
                    <div style="color: #94a3b8; font-size: 0.75rem;">Monthly Rent</div>
                    <div style="color: #f8fafc; font-weight: 700; margin-top: 0.1rem; font-size: 0.95rem;">${rentDisplay}</div>
                </div>

                <div style="background: #0f172a; padding: 0.6rem 0.8rem; border-radius: 6px; border: 1px solid #1e293b; grid-column: span 1 / -1;">
                    <div style="color: #94a3b8; font-size: 0.75rem;">Insurance / Payment Accepted</div>
                    <div style="color: #38bdf8; font-weight: 600; margin-top: 0.1rem;">${escapeHtml(insuranceDisplay)}</div>
                </div>
            </div>

            <div style="display: flex; flex-wrap: wrap; gap: 0.75rem; margin-top: 1rem; padding-top: 1rem; border-top: 1px solid #334155; font-size: 0.85rem; align-items: center; justify-content: space-between;">
                <div style="color: #cbd5e1; display: flex; flex-wrap: wrap; gap: 1rem;">
                    ${house.contact_name ? `<span>👤 <strong>Contact:</strong> ${escapeHtml(house.contact_name)}</span>` : ''}
                    ${house.phone ? `<span>📞 <a href="tel:${escapeHtml(house.phone)}" style="color: #38bdf8; text-decoration: none;">${escapeHtml(house.phone)}</a></span>` : ''}
                    ${house.email ? `<span>✉️ <a href="mailto:${escapeHtml(house.email)}" style="color: #38bdf8; text-decoration: none;">${escapeHtml(house.email)}</a></span>` : ''}
                </div>

                <div style="display: flex; gap: 0.5rem; flex-wrap: wrap;">
                    ${house.website ? `<a href="${escapeHtml(house.website)}" target="_blank" style="background: #334155; color: #fff; padding: 0.4rem 0.8rem; border-radius: 6px; text-decoration: none; font-weight: 600; font-size: 0.8rem;">🌐 Website</a>` : ''}
                    ${house.application_link ? `<a href="${escapeHtml(house.application_link)}" target="_blank" style="background: #0284c7; color: #fff; padding: 0.4rem 0.8rem; border-radius: 6px; text-decoration: none; font-weight: 600; font-size: 0.8rem;">📝 Apply Now</a>` : ''}
                </div>
            </div>

            <details style="margin-top: 1rem; background: #0f172a; padding: 0.75rem; border-radius: 6px; border: 1px solid #1e293b;">
                <summary style="cursor: pointer; font-weight: 600; color: #38bdf8; font-size: 0.85rem;">
                    View Amenities, Policies & Extra Details ▼
                </summary>
                
                <div style="margin-top: 0.75rem; font-size: 0.85rem; display: flex; flex-direction: column; gap: 0.75rem;">
                    <div>
                        <strong style="color: #94a3b8; display: block; margin-bottom: 0.4rem;">Amenities:</strong>
                        <div>${amenitiesHTML}</div>
                    </div>
                </div>
            </details>
        `;
        grid.appendChild(card);
    });
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