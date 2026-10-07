import { 
    supabase, 
    loginManager, 
    logoutManager, 
    fetchAssignedHouse, 
    fetchHousesForDirector,
    assignHouseManager,
    submitBedUpdate,
    fetchHouses
} from './supabaseClient.js';

let currentSession = null;
let currentManagerHouse = null;

document.addEventListener('DOMContentLoaded', () => {
    initDashboard();
});

function initDashboard() {
    setupEventListeners();
    initAuthListener();
}

function setupEventListeners() {
    const loginForm = document.getElementById('loginForm');
    const updateBedForm = document.getElementById('updateBedForm');
    const logoutBtn = document.getElementById('logoutBtn');

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
            } catch (err) {
                console.error('Login error:', err);
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
                available: Number(document.getElementById('inputAvailable').value) || 0,
                occupied: Number(document.getElementById('inputOccupied').value) || 0,
                reserved: Number(document.getElementById('inputReserved').value) || 0,
                maintenance: Number(document.getElementById('inputMaintenance').value) || 0
            };

            const saveBtn = document.getElementById('saveBedBtn');

            try {
                if (saveBtn) {
                    saveBtn.textContent = 'Saving...';
                    saveBtn.disabled = true;
                }

                await submitBedUpdate(currentManagerHouse.id, bedMetrics);
                alert('Bed counts updated live in Supabase!');
            } catch (err) {
                alert('Permission denied or network error: ' + err.message);
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
}

function initAuthListener() {
    supabase.auth.onAuthStateChange(async (event, session) => {
        currentSession = session;

        const loginCard = document.getElementById('loginCard');
        const logoutBtn = document.getElementById('logoutBtn');
        const authStatusBanner = document.getElementById('authStatusBanner');
        const managerUpdateSection = document.getElementById('managerUpdateSection');
        const directorPanel = document.getElementById('directorPanel');

        if (session) {
            if (loginCard) loginCard.style.display = 'none';
            if (logoutBtn) logoutBtn.style.display = 'inline-block';
            if (authStatusBanner) authStatusBanner.style.display = 'block';

            // 1. Fetch House Manager Assignment
            try {
                currentManagerHouse = await fetchAssignedHouse(session.user.id);

                if (currentManagerHouse && managerUpdateSection) {
                    managerUpdateSection.style.display = 'block';
                    document.getElementById('managerHouseLabel').textContent = 
                        `Assigned Residence: ${currentManagerHouse.house_name} (${currentManagerHouse.county} Co.)`;

                    document.getElementById('inputAvailable').value = currentManagerHouse.available_beds ?? 0;
                    document.getElementById('inputOccupied').value = currentManagerHouse.occupied_beds ?? 0;
                    document.getElementById('inputReserved').value = currentManagerHouse.reserved_beds ?? 0;
                    document.getElementById('inputMaintenance').value = currentManagerHouse.maintenance_beds ?? 0;
                } else if (managerUpdateSection) {
                    managerUpdateSection.style.display = 'none';
                }

                if (authStatusBanner) {
                    authStatusBanner.innerHTML = `
                        <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 0.5rem; padding: 1rem;">
                            <div>
                                <div style="font-size: 0.8rem; text-transform: uppercase; color: #38bdf8; font-weight: 700;">Logged In</div>
                                <div style="font-size: 1.1rem; font-weight: 700; color: #fff;">${session.user.email}</div>
                                <div style="font-size: 0.85rem; color: #94a3b8; margin-top: 0.2rem;">
                                    Assigned House: <strong>${currentManagerHouse ? currentManagerHouse.house_name : 'None (Director / Read-Only)'}</strong>
                                </div>
                            </div>
                        </div>
                    `;
                }
            } catch (err) {
                console.error('Error fetching manager house:', err);
            }

            // 2. Fetch Director Privileges
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
            if (loginCard) loginCard.style.display = 'block';
            if (logoutBtn) logoutBtn.style.display = 'none';
            if (authStatusBanner) authStatusBanner.style.display = 'none';
            if (managerUpdateSection) managerUpdateSection.style.display = 'none';
            if (directorPanel) directorPanel.style.display = 'none';
        }
    });
}

function renderDirectorTable(houses) {
    const tableBody = document.getElementById('directorHouseTableBody');
    if (!tableBody) return;

    tableBody.innerHTML = '';

    houses.forEach(house => {
        const row = document.createElement('tr');
        row.style.borderBottom = '1px solid #334155';
        row.innerHTML = `
            <td style="padding: 0.75rem; font-weight: 600; vertical-align: middle;">
                ${escapeHtml(house.house_name)}
                <div style="font-size: 0.75rem; color: #94a3b8;">${escapeHtml(house.city || '')}</div>
            </td>
            <td style="padding: 0.75rem; color: #94a3b8; vertical-align: middle;">
                ${escapeHtml(house.county)}
            </td>
            
            <!-- Director Bed Inputs -->
            <td style="padding: 0.75rem; vertical-align: middle;">
                <div style="display: flex; gap: 0.5rem; align-items: center; flex-wrap: wrap;">
                    <label style="display: flex; flex-direction: column; font-size: 0.7rem; color: #22c55e; font-weight: 600;">
                        Avail
                        <input type="number" min="0" class="bed-avail-input" data-house-id="${house.id}" value="${house.available_beds ?? 0}" style="width: 58px; padding: 0.3rem; background: #0f172a; border: 1px solid #334155; color: #fff; text-align: center; border-radius: 4px; font-size: 0.85rem;">
                    </label>

                    <label style="display: flex; flex-direction: column; font-size: 0.7rem; color: #eab308; font-weight: 600;">
                        Occ
                        <input type="number" min="0" class="bed-occ-input" data-house-id="${house.id}" value="${house.occupied_beds ?? 0}" style="width: 58px; padding: 0.3rem; background: #0f172a; border: 1px solid #334155; color: #fff; text-align: center; border-radius: 4px; font-size: 0.85rem;">
                    </label>

                    <label style="display: flex; flex-direction: column; font-size: 0.7rem; color: #3b82f6; font-weight: 600;">
                        Res
                        <input type="number" min="0" class="bed-res-input" data-house-id="${house.id}" value="${house.reserved_beds ?? 0}" style="width: 58px; padding: 0.3rem; background: #0f172a; border: 1px solid #334155; color: #fff; text-align: center; border-radius: 4px; font-size: 0.85rem;">
                    </label>

                    <label style="display: flex; flex-direction: column; font-size: 0.7rem; color: #ef4444; font-weight: 600;">
                        Maint
                        <input type="number" min="0" class="bed-maint-input" data-house-id="${house.id}" value="${house.maintenance_beds ?? 0}" style="width: 58px; padding: 0.3rem; background: #0f172a; border: 1px solid #334155; color: #fff; text-align: center; border-radius: 4px; font-size: 0.85rem;">
                    </label>

                    <button class="btn btn-success save-beds-btn" data-house-id="${house.id}" style="padding: 0.4rem 0.6rem; font-size: 0.75rem; margin-top: auto;">
                        Save Beds
                    </button>
                </div>
            </td>

            <!-- Assign Manager Input -->
            <td style="padding: 0.75rem; vertical-align: middle;">
                <div style="display: flex; gap: 0.3rem; align-items: center;">
                    <input type="text" 
                           class="manager-input" 
                           data-house-id="${house.id}" 
                           value="${house.manager_id || ''}" 
                           placeholder="Paste Manager UID"
                           style="width: 170px; font-size: 0.75rem; padding: 0.35rem; background: #0f172a; border: 1px solid #334155; color: #fff; border-radius: 4px;">
                    <button class="btn btn-outline save-manager-btn" data-house-id="${house.id}" style="padding: 0.35rem 0.5rem; font-size: 0.75rem;">
                        Assign
                    </button>
                </div>
            </td>
        `;
        tableBody.appendChild(row);
    });

    // Save Beds Button Event Listeners
    document.querySelectorAll('.save-beds-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            const button = e.currentTarget;
            const houseId = button.dataset.houseId;

            const available = Number(document.querySelector(`.bed-avail-input[data-house-id="${houseId}"]`)?.value) || 0;
            const occupied = Number(document.querySelector(`.bed-occ-input[data-house-id="${houseId}"]`)?.value) || 0;
            const reserved = Number(document.querySelector(`.bed-res-input[data-house-id="${houseId}"]`)?.value) || 0;
            const maintenance = Number(document.querySelector(`.bed-maint-input[data-house-id="${houseId}"]`)?.value) || 0;

            try {
                button.textContent = 'Saving...';
                button.disabled = true;

                await submitBedUpdate(houseId, { available, occupied, reserved, maintenance });
                alert('Bed counts updated live!');
            } catch (err) {
                alert('Failed to update bed counts: ' + err.message);
            } finally {
                button.textContent = 'Save Beds';
                button.disabled = false;
            }
        });
    });

    // Save Manager Button Event Listeners
    document.querySelectorAll('.save-manager-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            const button = e.currentTarget;
            const houseId = button.dataset.houseId;
            const inputElem = document.querySelector(`.manager-input[data-house-id="${houseId}"]`);
            const newManagerId = inputElem ? inputElem.value.trim() : '';

            try {
                button.textContent = 'Saving...';
                button.disabled = true;
                await assignHouseManager(houseId, newManagerId);
                alert('House manager assignment updated!');
            } catch (err) {
                alert('Failed to update manager assignment.');
            } finally {
                button.textContent = 'Assign';
                button.disabled = false;
            }
        });
    });
}

function escapeHtml(str) {
    return String(str || '').replace(/[&<>"']/g, m => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
    }[m]));
}