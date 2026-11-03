import { createClient } from '@supabase/supabase-js';
import { supabaseConfig } from './config.js';
import { createRequestFetch } from './request-fetch.js';

let client;
export function getSupabase() {
  if (!client)
    client = createClient(supabaseConfig.url, supabaseConfig.publishableKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'pkce' },
      realtime: { params: { eventsPerSecond: 10 } },
      global: {
        fetch: createRequestFetch(),
      },
    });
  return client;
}
