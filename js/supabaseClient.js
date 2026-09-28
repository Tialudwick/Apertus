// js/supabaseClient.js
// Replace placeholders with your Supabase Project Settings -> API credentials

const SUPABASE_URL = "https://YOUR-SUPABASE-PROJECT-ID.supabase.co";
const SUPABASE_ANON_KEY = "YOUR-SUPABASE-ANON-KEY";

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