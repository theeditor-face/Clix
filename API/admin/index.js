// ═══════════════════════════════════════════════════════════════
//  CLIX — api/admin/index.js
//  Admin API — all admin operations in one route
//  Protected by ADMIN_SECRET_KEY
// ═══════════════════════════════════════════════════════════════

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// ─── Auth check ───────────────────────────────────────────────
function isAdmin(req) {
  const key = req.headers['x-admin-key'] || req.body?.adminKey;
  return key === process.env.ADMIN_SECRET_KEY;
}

// ─── MAIN HANDLER ────────────────────────────────────────────
export default async function handler(req, res) {
  if (!isAdmin(req)) {
    return res.status(403).json({ message: 'Forbidden' });
  }

  const { action } = req.query;

  switch (action) {

    // ── GET ALL USERS ──────────────────────────────────────
    case 'users': {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, email, daily_count, quota_reset_at, is_banned, ban_reason, created_at, last_seen')
        .order('created_at', { ascending: false });

      if (error) return res.status(500).json({ message: error.message });
      return res.status(200).json({ users: data });
    }

    // ── GET STATS ──────────────────────────────────────────
    case 'stats': {
      const [
        { count: totalUsers },
        { data: globalStats },
        { count: totalGenerations },
        { data: recentGens },
        { count: bannedUsers },
        { data: abuseLogs }
      ] = await Promise.all([
        supabase.from('profiles').select('*', { count: 'exact', head: true }),
        supabase.from('global_stats').select('daily_count, last_reset').eq('id', 1).single(),
        supabase.from('generations').select('*', { count: 'exact', head: true }),
        supabase.from('generations').select('site_type, created_at, model_used').order('created_at', { ascending: false }).limit(50),
        supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('is_banned', true),
        supabase.from('abuse_logs').select('reason, created_at').order('created_at', { ascending: false }).limit(20)
      ]);

      // Site type breakdown
      const typeBreakdown = {};
      recentGens?.forEach(g => {
        typeBreakdown[g.site_type] = (typeBreakdown[g.site_type] || 0) + 1;
      });

      // Model usage breakdown
      const modelBreakdown = {};
      recentGens?.forEach(g => {
        const short = g.model_used?.split('/').pop()?.replace(':free', '') || 'unknown';
        modelBreakdown[short] = (modelBreakdown[short] || 0) + 1;
      });

      return res.status(200).json({
        totalUsers,
        totalGenerations,
        bannedUsers,
        dailyCount:      globalStats?.daily_count || 0,
        dailyCap:        3000,
        dailyCapPct:     Math.round(((globalStats?.daily_count || 0) / 3000) * 100),
        typeBreakdown,
        modelBreakdown,
        recentAbuse:     abuseLogs || []
      });
    }

    // ── BAN USER ───────────────────────────────────────────
    case 'ban': {
      if (req.method !== 'POST') return res.status(405).json({ message: 'POST required' });
      const { userId, reason = 'Admin ban' } = req.body;
      if (!userId) return res.status(400).json({ message: 'userId required' });

      await supabase.from('profiles')
        .update({ is_banned: true, ban_reason: reason })
        .eq('id', userId);

      await supabase.from('admin_logs').insert({
        action:       'user_banned',
        performed_by: 'admin',
        target_user:  userId,
        details:      reason
      });

      return res.status(200).json({ message: 'User banned' });
    }

    // ── UNBAN USER ─────────────────────────────────────────
    case 'unban': {
      if (req.method !== 'POST') return res.status(405).json({ message: 'POST required' });
      const { userId } = req.body;
      if (!userId) return res.status(400).json({ message: 'userId required' });

      await supabase.from('profiles')
        .update({ is_banned: false, ban_reason: null })
        .eq('id', userId);

      await supabase.from('admin_logs').insert({
        action:       'user_unbanned',
        performed_by: 'admin',
        target_user:  userId,
        details:      'Unbanned by admin'
      });

      return res.status(200).json({ message: 'User unbanned' });
    }

    // ── RESET USER QUOTA ───────────────────────────────────
    case 'reset-quota': {
      if (req.method !== 'POST') return res.status(405).json({ message: 'POST required' });
      const { userId } = req.body;
      if (!userId) return res.status(400).json({ message: 'userId required' });

      await supabase.from('profiles')
        .update({ daily_count: 0, quota_reset_at: new Date().toISOString() })
        .eq('id', userId);

      await supabase.from('admin_logs').insert({
        action:       'quota_reset',
        performed_by: 'admin',
        target_user:  userId,
        details:      'Quota manually reset'
      });

      return res.status(200).json({ message: 'Quota reset' });
    }

    // ── GET ADMIN LOGS ─────────────────────────────────────
    case 'logs': {
      const { data } = await supabase
        .from('admin_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100);

      return res.status(200).json({ logs: data || [] });
    }

    // ── GET ABUSE LOGS ─────────────────────────────────────
    case 'abuse': {
      const { data } = await supabase
        .from('abuse_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100);

      return res.status(200).json({ logs: data || [] });
    }

    // ── RESET GLOBAL COUNTER ───────────────────────────────
    case 'reset-global': {
      if (req.method !== 'POST') return res.status(405).json({ message: 'POST required' });

      await supabase.from('global_stats')
        .update({ daily_count: 0, last_reset: new Date().toISOString() })
        .eq('id', 1);

      await supabase.from('admin_logs').insert({
        action:       'global_counter_reset',
        performed_by: 'admin',
        target_user:  'system',
        details:      'Daily counter manually reset'
      });

      return res.status(200).json({ message: 'Global counter reset' });
    }

    // ── GET USER GENERATIONS ───────────────────────────────
    case 'user-generations': {
      const { userId } = req.query;
      if (!userId) return res.status(400).json({ message: 'userId required' });

      const { data } = await supabase
        .from('generations')
        .select('id, title, site_type, model_used, created_at')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

      return res.status(200).json({ generations: data || [] });
    }

    default:
      return res.status(404).json({ message: 'Unknown action' });
  }
}
