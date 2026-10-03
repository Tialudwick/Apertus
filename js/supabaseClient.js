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