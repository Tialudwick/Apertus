import { 
    supabase, 
    loginManager, 
    logoutManager, 
    fetchAssignedHouse, 
    submitBedUpdate, 
    fetchHouses, 
    isWithin7Days 
} from './supabaseClient.js';

let currentSession = null;

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
    const openLoginBtn = document.getElementById('openLoginModalBtn');
    const closeLoginBtn = document.getElementById('closeLoginBtn');
    const logoutBtn = document.getElementById('logoutBtn');
    const loginCard = document.getElementById('loginCard');

    // Toggle Login Card
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

    // Login Form Submission
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

    // Global Logout
    if (logoutBtn) {
        logoutBtn.addEventListener('click', async () => {
            try {
                await logoutManager();
            } catch (err) {
                alert('Logout failed: ' + err.message);
            }
        });
    }

    // Public Filters
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

        if (session) {
            try {
                const assignedHouse = await fetchAssignedHouse(session.user.id);
                if (authStatusBanner) {
                    authStatusBanner.innerHTML = `
                        <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 0.5rem;">
                            <div>
                                <strong>Logged in as:</strong> ${session.user.email}
                                <div style="font-size: 0.85rem; color: var(--text-muted);">
                                    Assigned House: <strong>${assignedHouse ? assignedHouse.house_name : 'No house assigned'}</strong>
                                </div>
                            </div>
                        </div>
                    `;
                }
            } catch (err) {
                console.error('Error loading manager session details:', err);
            }
        } else {
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
        grid.innerHTML = '<div class="no-results">No recovery residences found matching your criteria.</div>';
        return;
    }

    houses.forEach(house => {
        const card = document.createElement('article');
        card.className = 'house-card';
        card.innerHTML = `
            <div class="card-header">
                <div>
                    <h3 class="house-title">${escapeHtml(house.house_name || 'Unnamed House')}</h3>
                    <p class="location-tag">📍 ${escapeHtml(house.city || 'N/A')}, ${escapeHtml(house.county || '')} Co.</p>
                </div>
            </div>
            <div class="bed-stat-box">
                <div class="bed-count-number">${house.available_beds || 0}</div>
                <div class="bed-count-label">Available Beds</div>
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