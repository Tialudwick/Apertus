import { 
    supabase, 
    loginManager, 
    logoutManager, 
    fetchAssignedHouse, 
    fetchHousesForDirector,
    assignHouseManager,
    submitBedUpdate, 
    fetchHouses, 
    isWithin7Days 
} from './supabaseClient.js';

let currentSession = null;
let currentManagerHouse = null;

document.addEventListener('DOMContentLoaded', () => {
    initApp();
});

async function initApp() {
    setupEventListeners();
    initAuthListener();
    await fetchAndRenderHouses();
    await loadFeedback();
    subscribeToRealtimeUpdates();
}

function setupEventListeners() {
    const loginForm = document.getElementById('loginForm');
    const updateBedForm = document.getElementById('updateBedForm');
    const openLoginBtn = document.getElementById('openLoginModalBtn');
    const closeLoginBtn = document.getElementById('closeLoginBtn');
    const logoutBtn = document.getElementById('logoutBtn');
    const loginCard = document.getElementById('loginCard');

    if (openLoginBtn && loginCard) {
        openLoginBtn.addEventListener('click', () => {
            loginCard.style.display = loginCard.style.display === 'none' || !loginCard.style.display ? 'block' : 'none';
        });
    }

    if (closeLoginBtn && loginCard) {
        closeLoginBtn.addEventListener('click', () => {
            loginCard.style.display = 'none';
        });
    }

    if (loginForm) {
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const email = document.getElementById('loginEmail')?.value.trim();
            const password = document.getElementById('loginPassword')?.value;
            const submitBtn = document.getElementById('loginBtn');

            if (!email || !password) return alert('Please enter both email and password.');

            try {
                if (submitBtn) {
                    submitBtn.textContent = 'Logging in...';
                    submitBtn.disabled = true;
                }
                await loginManager(email, password);
                loginForm.reset();
                if (loginCard) loginCard.style.display = 'none';
            } catch (err) {
                alert(`Login failed: ${err.message}`);
            } finally {
                if (submitBtn) {
                    submitBtn.textContent = 'Log In';
                    submitBtn.disabled = false;
                }
            }
        });
    }

    if (updateBedForm) {
        updateBedForm.addEventListener('submit', async (e) => {
            e.preventDefault();

            if (!currentManagerHouse) {
                alert('No house assigned to your account.');
                return;
            }

            const bedMetrics = {
                available: document.getElementById('inputAvailable').value,
                occupied: document.getElementById('inputOccupied').value,
                reserved: document.getElementById('inputReserved').value,
                maintenance: document.getElementById('inputMaintenance').value
            };

            const saveBtn = document.getElementById('saveBedBtn');

            try {
                if (saveBtn) {
                    saveBtn.textContent = 'Saving...';
                    saveBtn.disabled = true;
                }

                await submitBedUpdate(currentManagerHouse.id, bedMetrics);
                alert('Bed counts updated live in Supabase cloud!');
                await fetchAndRenderHouses();
            } catch (err) {
                alert('Permission denied or network error. Could not update bed counts.');
            } finally {
                if (saveBtn) {
                    saveBtn.textContent = 'Update Bed Counts Live';
                    saveBtn.disabled = false;
                }
            }
        });
    }

    if (logoutBtn) {
        logoutBtn.addEventListener('click', async () => {
            try {
                await logoutManager();
            } catch (err) {
                alert('Logout failed: ' + err.message);
            }
        });
    }

    document.getElementById('searchInput')?.addEventListener('input', debounce(fetchAndRenderHouses, 300));
    document.getElementById('regionFilter')?.addEventListener('change', fetchAndRenderHouses);
    document.getElementById('countyFilter')?.addEventListener('change', fetchAndRenderHouses);
    document.getElementById('genderFilter')?.addEventListener('change', fetchAndRenderHouses);
    document.getElementById('supportFilter')?.addEventListener('change', fetchAndRenderHouses);
    document.getElementById('availableOnlyToggle')?.addEventListener('change', fetchAndRenderHouses);

    document.getElementById('feedbackForm')?.addEventListener('submit', handleFeedbackSubmit);
}

function initAuthListener() {
    supabase.auth.onAuthStateChange(async (event, session) => {
        currentSession = session;
        updateUIForAuth(!!session);

        const authStatusBanner = document.getElementById('authStatusBanner');
        const managerUpdateSection = document.getElementById('managerUpdateSection');
        const directorPanel = document.getElementById('directorPanel');

        if (session) {
            try {
                currentManagerHouse = await fetchAssignedHouse(session.user.id);

                if (currentManagerHouse && managerUpdateSection) {
                    managerUpdateSection.style.display = 'block';
                    document.getElementById('managerHouseLabel').textContent = 
                        `Editing residence: ${currentManagerHouse.house_name} (${currentManagerHouse.county} Co.)`;

                    document.getElementById('inputAvailable').value = currentManagerHouse.available_beds || 0;
                    document.getElementById('inputOccupied').value = currentManagerHouse.occupied_beds || 0;
                    document.getElementById('inputReserved').value = currentManagerHouse.reserved_beds || 0;
                    document.getElementById('inputMaintenance').value = currentManagerHouse.maintenance_beds || 0;
                } else if (managerUpdateSection) {
                    managerUpdateSection.style.display = 'none';
                }

                if (authStatusBanner) {
                    authStatusBanner.innerHTML = `
                        <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 0.5rem;">
                            <div>
                                <strong>Logged in as:</strong> ${session.user.email}
                                <div style="font-size: 0.85rem; color: var(--text-muted);">
                                    Assigned House: <strong>${currentManagerHouse ? currentManagerHouse.house_name : 'None (Read-Only / Admin)'}</strong>
                                </div>
                            </div>
                        </div>
                    `;
                }
            } catch (err) {
                console.error('Error fetching manager house:', err);
            }

            try {
                const directorHouses = await fetchHousesForDirector(session.user.id);
                if (directorHouses && directorHouses.length > 0 && directorPanel) {
                    directorPanel.style.display = 'block';
                    renderDirectorTable(directorHouses);
                } else if (directorPanel) {
                    directorPanel.style.display = 'none';
                }
            } catch (err) {
                console.error('Error loading director access:', err);
            }

        } else {
            currentManagerHouse = null;
            if (managerUpdateSection) managerUpdateSection.style.display = 'none';
            if (directorPanel) directorPanel.style.display = 'none';

            if (authStatusBanner) {
                authStatusBanner.innerHTML = `
                    <div style="display: flex; justify-content: space-between; align-items: center;">
                        <span>Public View (Read Only)</span>
                    </div>
                `;
            }
        }
    });
}

function renderDirectorTable(houses) {
    const tableBody = document.getElementById('directorHouseTableBody');
    if (!tableBody) return;

    tableBody.innerHTML = '';

    houses.forEach(house => {
        const total = (house.available_beds || 0) + (house.occupied_beds || 0) + 
                      (house.reserved_beds || 0) + (house.maintenance_beds || 0);

        const row = document.createElement('tr');
        row.style.borderBottom = '1px solid var(--card-border)';
        row.innerHTML = `
            <td style="padding: 0.75rem; font-weight: 600;">${escapeHtml(house.house_name)}</td>
            <td style="padding: 0.75rem; color: var(--text-muted);">${escapeHtml(house.county)}</td>
            <td style="padding: 0.75rem;">${house.available_beds || 0} / ${total}</td>
            <td style="padding: 0.75rem;">
                <input type="text" 
                       class="manager-input" 
                       data-house-id="${house.id}" 
                       value="${house.manager_id || ''}" 
                       placeholder="Paste Manager User UID"
                       style="width: 220px; font-size: 0.8rem; padding: 0.3rem 0.5rem; background: #0f172a; border: 1px solid var(--card-border); color: #fff; border-radius: 4px;">
            </td>
            <td style="padding: 0.75rem; text-align: right;">
                <button class="btn btn-outline save-manager-btn" data-house-id="${house.id}" style="padding: 0.3rem 0.6rem; font-size: 0.8rem;">
                    Save Manager
                </button>
            </td>
        `;
        tableBody.appendChild(row);
    });

    document.querySelectorAll('.save-manager-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            const houseId = e.target.dataset.houseId;
            const inputElem = document.querySelector(`.manager-input[data-house-id="${houseId}"]`);
            const newManagerId = inputElem ? inputElem.value.trim() : '';

            try {
                e.target.textContent = 'Saving...';
                await assignHouseManager(houseId, newManagerId);
                alert('House manager successfully updated!');
            } catch (err) {
                alert('Failed to update manager assignment. Ensure you have director privileges in Supabase.');
            } finally {
                e.target.textContent = 'Save Manager';
            }
        });
    });
}

function updateUIForAuth(isLoggedIn) {
    const loginBtn = document.getElementById('openLoginModalBtn');
    const logoutBtn = document.getElementById('logoutBtn');

    if (loginBtn) loginBtn.style.display = isLoggedIn ? 'none' : 'block';
    if (logoutBtn) logoutBtn.style.display = isLoggedIn ? 'block' : 'none';
}

async function fetchAndRenderHouses() {
    const grid = document.getElementById('houseGrid');
    if (!grid) return;

    grid.innerHTML = '<div class="loading-spinner">Loading sober houses...</div>';

    const search = document.getElementById('searchInput')?.value.trim();
    const region = document.getElementById('regionFilter')?.value;
    const county = document.getElementById('countyFilter')?.value;

    let query = supabase.from('houses').select('*');

    if (region) query = query.eq('region', region);
    if (county) query = query.eq('county', county);

    const { data: houses, error } = await query;

    if (error) {
        grid.innerHTML = `<p class="error-msg">Error loading directory: ${error.message}</p>`;
        return;
    }

    let filtered = houses || [];

    if (search) {
        const term = search.toLowerCase();
        filtered = filtered.filter(h => 
            (h.house_name && h.house_name.toLowerCase().includes(term)) || 
            (h.city && h.city.toLowerCase().includes(term)) ||
            (h.parent_company && h.parent_company.toLowerCase().includes(term))
        );
    }

    renderHouseCards(filtered);
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

        // Format Amenities tag array
        let amenitiesList = [];
        if (Array.isArray(house.amenities)) {
            amenitiesList = house.amenities;
        } else if (typeof house.amenities === 'string') {
            amenitiesList = house.amenities.split(',').map(a => a.trim());
        }

        const amenitiesHTML = amenitiesList.length > 0 
            ? amenitiesList.map(item => `<span style="background: #0f172a; border: 1px solid #334155; color: #cbd5e1; font-size: 0.75rem; padding: 0.25rem 0.5rem; border-radius: 4px; display: inline-block; margin: 0.15rem;">✓ ${escapeHtml(item)}</span>`).join(' ')
            : '<span style="color: #64748b; font-size: 0.85rem;">None listed</span>';

        // Social Media Links
        const socials = [];
        if (house.social_facebook) socials.push(`<a href="${escapeHtml(house.social_facebook)}" target="_blank" style="color: #38bdf8;">Facebook</a>`);
        if (house.social_linkedin) socials.push(`<a href="${escapeHtml(house.social_linkedin)}" target="_blank" style="color: #38bdf8;">LinkedIn</a>`);
        if (house.social_x) socials.push(`<a href="${escapeHtml(house.social_x)}" target="_blank" style="color: #38bdf8;">X</a>`);
        if (house.social_instagram) socials.push(`<a href="${escapeHtml(house.social_instagram)}" target="_blank" style="color: #38bdf8;">Instagram</a>`);

        card.innerHTML = `
            <!-- Top Header -->
            <div style="display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 1rem;">
                <div>
                    <div style="font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.05em; color: #38bdf8; font-weight: 700; margin-bottom: 0.2rem;">
                        🏢 Organization: ${escapeHtml(parentOrg)}
                    </div>
                    <h3 style="margin: 0; color: #fff; font-size: 1.35rem; font-weight: 800;">
                        ${escapeHtml(house.house_name)}
                    </h3>
                    <p style="margin: 0.3rem 0 0 0; color: #94a3b8; font-size: 0.9rem;">
                        📍 ${escapeHtml(house.city || 'N/A')}, ${escapeHtml(house.county || '')} County
                    </p>
                </div>

                <!-- Bed Counter Box -->
                <div style="background: #0f172a; padding: 0.5rem 1rem; border-radius: 8px; text-align: center; border: 1px solid #334155; min-width: 100px;">
                    <span style="font-size: 1.4rem; font-weight: bold; color: ${house.available_beds > 0 ? '#22c55e' : '#94a3b8'};">
                        ${house.available_beds || 0}
                    </span>
                    <span style="font-size: 0.7rem; color: #94a3b8; display: block; text-transform: uppercase; font-weight: 600;">Open Beds</span>
                </div>
            </div>

            <!-- Certification & Type Badges -->
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

            <!-- Description -->
            ${house.description ? `
                <p style="margin: 1rem 0; color: #cbd5e1; font-size: 0.9rem; line-height: 1.5; background: #0f172a; padding: 0.75rem 1rem; border-radius: 6px; border-left: 3px solid #38bdf8;">
                    ${escapeHtml(house.description)}
                </p>
            ` : ''}

            <!-- Financials Grid -->
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 0.75rem; margin-top: 1rem; font-size: 0.85rem;">
                <div style="background: #0f172a; padding: 0.6rem 0.8rem; border-radius: 6px; border: 1px solid #1e293b;">
                    <div style="color: #94a3b8; font-size: 0.75rem;">Move-In Fee</div>
                    <div style="color: #f8fafc; font-weight: 700; margin-top: 0.1rem; font-size: 0.95rem;">🔑 ${moveInDisplay}</div>
                </div>

                <div style="background: #0f172a; padding: 0.6rem 0.8rem; border-radius: 6px; border: 1px solid #1e293b;">
                    <div style="color: #94a3b8; font-size: 0.75rem;">Monthly Rent</div>
                    <div style="color: #f8fafc; font-weight: 700; margin-top: 0.1rem; font-size: 0.95rem;">💵 ${rentDisplay}</div>
                </div>

                <div style="background: #0f172a; padding: 0.6rem 0.8rem; border-radius: 6px; border: 1px solid #1e293b; grid-column: span 1 / -1;">
                    <div style="color: #94a3b8; font-size: 0.75rem;">Insurance / Payment Accepted</div>
                    <div style="color: #38bdf8; font-weight: 600; margin-top: 0.1rem;">💳 ${escapeHtml(insuranceDisplay)}</div>
                </div>
            </div>

            <!-- Contact & Quick Links Bar -->
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

            <!-- Collapsible Section for Detailed Services & Amenities -->
            <details style="margin-top: 1rem; background: #0f172a; padding: 0.75rem; border-radius: 6px; border: 1px solid #1e293b;">
                <summary style="cursor: pointer; font-weight: 600; color: #38bdf8; font-size: 0.85rem;">
                    View Amenities, Policies & Extra Details ▼
                </summary>
                
                <div style="margin-top: 0.75rem; font-size: 0.85rem; display: flex; flex-direction: column; gap: 0.75rem;">
                    ${house.defining_characteristics ? `
                        <div>
                            <strong style="color: #94a3b8; display: block; margin-bottom: 0.2rem;">Defining Characteristics:</strong>
                            <div>${escapeHtml(house.defining_characteristics)}</div>
                        </div>
                    ` : ''}

                    <div>
                        <strong style="color: #94a3b8; display: block; margin-bottom: 0.4rem;">Amenities:</strong>
                        <div>${amenitiesHTML}</div>
                    </div>

                    ${house.languages ? `
                        <div>
                            <strong style="color: #94a3b8; display: block; margin-bottom: 0.2rem;">Languages Offered:</strong>
                            <div>${escapeHtml(house.languages)}</div>
                        </div>
                    ` : ''}

                    ${house.policies ? `
                        <div>
                            <strong style="color: #94a3b8; display: block; margin-bottom: 0.2rem;">House Policies:</strong>
                            <div>${escapeHtml(house.policies)}</div>
                        </div>
                    ` : ''}

                    ${house.services_available ? `
                        <div>
                            <strong style="color: #94a3b8; display: block; margin-bottom: 0.2rem;">Services Available:</strong>
                            <div>${escapeHtml(house.services_available)}</div>
                        </div>
                    ` : ''}

                    ${house.programs ? `
                        <div>
                            <strong style="color: #94a3b8; display: block; margin-bottom: 0.2rem;">Programs:</strong>
                            <div>${escapeHtml(house.programs)}</div>
                        </div>
                    ` : ''}

                    ${socials.length > 0 ? `
                        <div>
                            <strong style="color: #94a3b8; display: block; margin-bottom: 0.2rem;">Social Media:</strong>
                            <div>${socials.join(' • ')}</div>
                        </div>
                    ` : ''}
                </div>
            </details>
        `;
        grid.appendChild(card);
    });
}

async function handleFeedbackSubmit(e) {
    e.preventDefault();
    const category = document.getElementById('feedbackCategory')?.value;
    const message = document.getElementById('feedbackMessage')?.value.trim();

    const { error } = await supabase.from('feedback').insert([{ category, message }]);

    if (error) {
        alert('Error submitting feedback: ' + error.message);
    } else {
        alert('Thank you for contributing to Apertus.');
        document.getElementById('feedbackForm')?.reset();
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
                <strong>${escapeHtml(item.category)}</strong>
                <p>${escapeHtml(item.message)}</p>
            </div>
        `).join('');
    }
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