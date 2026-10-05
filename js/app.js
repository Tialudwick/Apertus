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

    // Modal / Card Toggles
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

    // 1. Manager Login Handler
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

    // 2. Manager Bed Update Form Submission
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

    // 3. Logout Handler
    if (logoutBtn) {
        logoutBtn.addEventListener('click', async () => {
            try {
                await logoutManager();
            } catch (err) {
                alert('Logout failed: ' + err.message);
            }
        });
    }

    // Public Directory Filters
    document.getElementById('searchInput')?.addEventListener('input', debounce(fetchAndRenderHouses, 300));
    document.getElementById('regionFilter')?.addEventListener('change', fetchAndRenderHouses);
    document.getElementById('countyFilter')?.addEventListener('change', fetchAndRenderHouses);
    document.getElementById('genderFilter')?.addEventListener('change', fetchAndRenderHouses);
    document.getElementById('supportFilter')?.addEventListener('change', fetchAndRenderHouses);
    document.getElementById('availableOnlyToggle')?.addEventListener('change', fetchAndRenderHouses);

    // Feedback
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
            // Check Manager Assignment
            try {
                currentManagerHouse = await fetchAssignedHouse(session.user.id);

                if (currentManagerHouse && managerUpdateSection) {
                    managerUpdateSection.style.display = 'block';
                    document.getElementById('managerHouseLabel').textContent = 
                        `Editing residence: ${currentManagerHouse.house_name} (${currentManagerHouse.county} Co.)`;

                    // Pre-fill existing counts in the form
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

            // Check Director Access
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
            // Logged Out State
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

    // Attach Event Listeners to "Save Manager" buttons
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
            (h.city && h.city.toLowerCase().includes(term))
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
        card.style.cssText = 'background: #1e293b; border: 1px solid var(--card-border, #334155); border-radius: 8px; padding: 1.25rem; margin-bottom: 1rem;';
        
        const parentOrg = house.parent_company || house.company_name || 'Independent Residence';
        const rentDisplay = house.rent_amount ? `$${Number(house.rent_amount).toLocaleString()}/wk` : 'Contact for Rent';
        const moveInDisplay = house.move_in_cost ? `$${Number(house.move_in_cost).toLocaleString()}` : 'Contact for Details';
        const insuranceDisplay = house.insurance_accepted || 'Self-Pay';

        card.innerHTML = `
            <!-- Top Section: Org & House Name -->
            <div style="display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 0.75rem;">
                <div>
                    <div style="font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.05em; color: #38bdf8; font-weight: 600; margin-bottom: 0.2rem;">
                        ${escapeHtml(parentOrg)}
                    </div>
                    <h3 style="margin: 0; color: #fff; font-size: 1.15rem; font-weight: 700;">
                        ${escapeHtml(house.house_name)}
                    </h3>
                    <p style="margin: 0.3rem 0 0 0; color: #94a3b8; font-size: 0.85rem;">
                        📍 ${escapeHtml(house.city || 'N/A')}, ${escapeHtml(house.county || '')} County
                    </p>
                </div>

                <!-- Badges & Bed Counter -->
                <div style="display: flex; align-items: center; gap: 0.6rem;">
                    <span style="background: #0284c7; color: #fff; padding: 0.25rem 0.65rem; border-radius: 12px; font-size: 0.75rem; font-weight: 600;">
                        ${escapeHtml(house.gender || 'N/A')}
                    </span>

                    <span title="MARR Level of Support" style="background: #334155; color: #38bdf8; padding: 0.2rem; border-radius: 50%; font-size: 0.75rem; font-weight: bold; width: 26px; height: 26px; display: inline-flex; align-items: center; justify-content: center; border: 1px solid #475569;">
                        L${house.level_of_support || 1}
                    </span>

                    <div style="background: #0f172a; padding: 0.4rem 0.85rem; border-radius: 6px; text-align: center; border: 1px solid #1e293b;">
                        <span style="font-size: 1.25rem; font-weight: bold; color: ${house.available_beds > 0 ? '#22c55e' : '#94a3b8'};">
                            ${house.available_beds || 0}
                        </span>
                        <span style="font-size: 0.7rem; color: #94a3b8; display: block; text-transform: uppercase;">Open Beds</span>
                    </div>
                </div>
            </div>

            <hr style="border: 0; border-top: 1px solid #334155; margin: 1rem 0;" />

            <!-- Bottom Section: Pricing & Insurance Info -->
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 0.75rem; font-size: 0.85rem;">
                <div style="background: #0f172a; padding: 0.5rem 0.75rem; border-radius: 6px; border: 1px solid #1e293b;">
                    <div style="color: #94a3b8; font-size: 0.75rem;">Rent</div>
                    <div style="color: #f8fafc; font-weight: 600; margin-top: 0.1rem;">💵 ${rentDisplay}</div>
                </div>

                <div style="background: #0f172a; padding: 0.5rem 0.75rem; border-radius: 6px; border: 1px solid #1e293b;">
                    <div style="color: #94a3b8; font-size: 0.75rem;">Move-in Cost</div>
                    <div style="color: #f8fafc; font-weight: 600; margin-top: 0.1rem;">🔑 ${moveInDisplay}</div>
                </div>

                <div style="background: #0f172a; padding: 0.5rem 0.75rem; border-radius: 6px; border: 1px solid #1e293b; grid-column: span 1 / -1;">
                    <div style="color: #94a3b8; font-size: 0.75rem;">Insurance / Funding</div>
                    <div style="color: #38bdf8; font-weight: 600; margin-top: 0.1rem;">💳 ${escapeHtml(insuranceDisplay)}</div>
                </div>
            </div>
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