// js/supabaseClient.js
// Replace placeholders with your Supabase Project Settings -> API credentials

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Initialize Supabase Client
export const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

/**
 * Utility: Checks if a date falls within the 7-day rolling window
 * @param {string|Date} dateString 
 * @returns {boolean}
 */
export function isWithin7Days(dateString) {
    if (!dateString) return false;
    const date = new Date(dateString);
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    return date >= sevenDaysAgo;
}

/**
 * Submits updated bed metrics to the Supabase cloud database
 * @param {string} houseId - UUID of the house record
 * @param {Object} bedMetrics - { available, occupied, reserved, maintenance }
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

/**
 * Log in a manager with Email & Password
 */
export async function loginManager(email, password) {
    const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password
    });
    if (error) throw error;
    return data;
}

/**
 * Log out the active manager
 */
export async function logoutManager() {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
}

/**
 * Fetch the specific house assigned to a logged-in manager ID
 */
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