import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { Session, User } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';

interface AuthContextType {
  session: Session | null;
  user: User | null;
  loading: boolean;
  approved: boolean | null;
  isAdmin: boolean;
  isSiteManager: boolean;
  siteId: string | null;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  session: null,
  user: null,
  loading: true,
  approved: null,
  isAdmin: false,
  isSiteManager: false,
  siteId: null,
  signOut: async () => {},
});

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [approved, setApproved] = useState<boolean | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isSiteManager, setIsSiteManager] = useState(false);
  const [siteId, setSiteId] = useState<string | null>(null);

  const loadUserData = async (userId: string) => {
    const [profileRes, rolesRes] = await Promise.all([
      supabase.from('profiles').select('approved, site_id').eq('id', userId).single(),
      supabase.from('user_roles').select('role').eq('user_id', userId),
    ]);
    setApproved(profileRes.data?.approved ?? false);
    setSiteId((profileRes.data as any)?.site_id ?? null);
    const roles = (rolesRes.data || []).map((r: any) => r.role);
    setIsAdmin(roles.includes('admin'));
    setIsSiteManager(roles.includes('site_manager'));
  };

  useEffect(() => {
    let mounted = true;

    const handleSession = async (session: Session | null) => {
      if (!mounted) return;
      setSession(session);
      if (session?.user) {
        await loadUserData(session.user.id);
      } else {
        setApproved(null);
        setIsAdmin(false);
        setIsSiteManager(false);
        setSiteId(null);
      }
      if (mounted) setLoading(false);
    };

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      handleSession(session);
    });

    supabase.auth.getSession().then(({ data: { session } }) => {
      handleSession(session);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  return (
    <AuthContext.Provider value={{ session, user: session?.user ?? null, loading, approved, isAdmin, isSiteManager, siteId, signOut }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
