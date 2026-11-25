import { useEffect, useState } from 'react';
import { supabase } from './supabase';

// The signed-in user's role, remembered for this session (one lookup, shared by all screens).
let cached: { userId: string; role: string } | null = null;

/**
 * True when the signed-in user is a freelancer (profiles.role = 'creator').
 * Shared screens (profiles, Inspiration) use it to leave out booking for freelancers.
 */
export function useIsFreelancer(): boolean {
  const [role, setRole] = useState<string | null>(cached?.role ?? null);
  useEffect(() => {
    let active = true;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      if (cached?.userId !== user.id) {
        const { data } = await supabase.from('profiles').select('role').eq('id', user.id).single();
        cached = { userId: user.id, role: data?.role ?? 'user' };
      }
      if (active) setRole(cached.role);
    })().catch(() => {});
    return () => { active = false; };
  }, []);
  return role === 'creator';
}
