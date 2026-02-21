/**
 * XTREME BIKE MANAGEMENT — SUPABASE CLIENT
 * Single source of truth for the Supabase connection
 */

const SUPABASE_URL = 'https://qvnrwhoxccbcgigsrgnd.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_0A1rcbB2PJcYx1KDCVTHqw_gv2v027i';

// createClient is injected by the Supabase CDN script
window.xbmDB = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
    },
    realtime: {
        params: { eventsPerSecond: 10 },
    },
});

// Convenience alias
window.db = window.xbmDB;

console.log('[XBM] Supabase client ready:', SUPABASE_URL);
