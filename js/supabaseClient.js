// Safe environment variable retrieval with fallback support
const SUPABASE_URL = (typeof import.meta !== 'undefined' && import.meta?.env?.VITE_SUPABASE_URL)
    ? import.meta.env.VITE_SUPABASE_URL
    : 'https://YOUR_PROJECT_ID.supabase.co'; // Replace with your project URL if not using .env

const SUPABASE_ANON_KEY = (typeof import.meta !== 'undefined' && import.meta?.env?.VITE_SUPABASE_ANON_KEY)
    ? import.meta.env.VITE_SUPABASE_ANON_KEY
    : 'YOUR_ACTUAL_ANON_KEY'; // Replace with your anon key if not using .env

export const supabase = (typeof window !== 'undefined' && window.supabase)
    ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
    : null;

if (!supabase) {
    console.error('Supabase CDN library is not loaded. Ensure <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script> is in index.html.');
}

/**
 * Utility: Checks if a date falls within the 7-day rolling window
 */
export function isWithin7Days(dateString) {
    if (!dateString) return false;
    const date = new Date(dateString);
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    return date >= sevenDaysAgo;
}

/**
 * Submits updated bed metrics to Supabase
 */
export async function submitBedUpdate(houseId, bedMetrics) {
    const { available, occupied, reserved, maintenance } = bedMetrics;

    const { data, error } = await supabase
        .from('houses')
        .update({
            available_beds: Number(available),
            occupied_beds: Number(occupied),
            reserved_beds: Number(reserved),
            maintenance_beds: Number(maintenance),
            updated_at: new Date().toISOString()
        })
        .eq('id', houseId)
        .select();

    if (error) {
        console.error('Error updating bed counts in Supabase:', error.message);
        throw error;
    }
    return data;
}

/**
 * Fetches all house bed records from Supabase
 */
export async function fetchHouses() {
    const { data, error } = await supabase
        .from('houses')
        .select('*')
        .order('house_name', { ascending: true });

    if (error) {
        console.error('Error fetching houses from Supabase:', error.message);
        throw error;
    }
    return data;
}

// --- Authentication Utilities ---

export async function loginManager(email, password) {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    return data;
}

export async function logoutManager() {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
}

export async function fetchAssignedHouse(userId) {
    const { data, error } = await supabase
        .from('houses')
        .select('*')
        .eq('manager_id', userId)
        .maybeSingle();

    if (error) {
        console.error('Error fetching assigned house:', error.message);
        throw error;
    }
    return data;
}

export async function fetchHousesForDirector(directorId) {
    const { data, error } = await supabase
        .from('houses')
        .select('*')
        .eq('org_director_id', directorId)
        .order('house_name', { ascending: true });

    if (error) throw error;
    return data;
}

export async function assignHouseManager(houseId, newManagerUserId) {
    const { data, error } = await supabase
        .from('houses')
        .update({ manager_id: newManagerUserId || null })
        .eq('id', houseId)
        .select();

    if (error) throw error;
    return data;
}