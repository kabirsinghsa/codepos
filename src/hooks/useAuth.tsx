import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { Session, User } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';

interface AuthContextType {
  session: Session | null;
  user: User | null;
  loading: boolean;
  approved: boolean | null;
  isAdmin: boolean;
  siteId: string | null;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  session: null,
  user: null,
  loading: true,
  approved: null,
  isAdmin: false,
  siteId: null,
  signOut: async () => {},
});

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [approved, setApproved] = useState<boolean | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [siteId, setSiteId] = useState<string | null>(null);

  const checkProfile = async (userId: string) => {
    const { data } = await supabase
      .from('profiles')
      .select('approved, site_id')
      .eq('id', userId)
      .single();
    setApproved(data?.approved ?? false);
    setSiteId((data as any)?.site_id ?? null);
  };

  const checkAdmin = async (userId: string) => {
    const { data } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', userId)
      .eq('role', 'admin')
      .maybeSingle();
    setIsAdmin(!!data);
  };

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (session?.user) {
        checkProfile(session.user.id);
        checkAdmin(session.user.id);
      } else {
        setApproved(null);
        setIsAdmin(false);
        setSiteId(null);
      }
      setLoading(false);
    });

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session?.user) {
        checkProfile(session.user.id);
        checkAdmin(session.user.id);
      } else {
        setApproved(null);
        setIsAdmin(false);
        setSiteId(null);
      }
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  return (
    <AuthContext.Provider value={{ session, user: session?.user ?? null, loading, approved, isAdmin, siteId, signOut }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
