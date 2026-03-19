import { Navigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { Loader2, ShieldX } from 'lucide-react';
import { Button } from '@/components/ui/button';

const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { session, loading, approved, signOut } = useAuth();

  if (loading || (session && approved === null)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!session) {
    return <Navigate to="/login" replace />;
  }

  if (!approved) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <div className="text-center space-y-4 max-w-md">
          <ShieldX className="w-16 h-16 mx-auto text-muted-foreground" />
          <h1 className="text-2xl font-bold text-foreground">Awaiting Approval</h1>
          <p className="text-muted-foreground">
            Your account has been created but needs to be approved by an administrator before you can access this page.
          </p>
          <Button variant="outline" onClick={signOut}>Sign Out</Button>
        </div>
      </div>
    );
  }

  return <>{children}</>;
};

export default ProtectedRoute;
