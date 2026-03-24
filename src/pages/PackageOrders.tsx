import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Loader2, CheckCircle, Clock, Car, Package } from 'lucide-react';
import Footer from '@/components/Footer';

interface PackageOrder {
  id: string;
  vehicle_reg: string;
  vehicle_make: string;
  vehicle_colour: string;
  package_type: string;
  duration_days: number;
  amount: number;
  payment_status: string;
  customer_email: string;
  customer_phone: string;
  package_id: string | null;
  site_id: string | null;
  created_at: string;
}

interface Site {
  id: string;
  name: string;
}

const statusColors: Record<string, string> = {
  pending: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
  paid: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
  activated: 'bg-primary/10 text-primary',
  cancelled: 'bg-destructive/10 text-destructive',
};

const PackageOrders = () => {
  const navigate = useNavigate();
  const [orders, setOrders] = useState<PackageOrder[]>([]);
  const [sites, setSites] = useState<Site[]>([]);
  const [loading, setLoading] = useState(true);
  const [activatingId, setActivatingId] = useState<string | null>(null);

  const fetchOrders = useCallback(async () => {
    const [ordersRes, sitesRes] = await Promise.all([
      supabase.from('package_orders').select('*').order('created_at', { ascending: false }),
      supabase.from('sites').select('id, name'),
    ]);
    if (ordersRes.data) setOrders(ordersRes.data as PackageOrder[]);
    if (sitesRes.data) setSites(sitesRes.data);
    setLoading(false);
  }, []);

  useEffect(() => { fetchOrders(); }, [fetchOrders]);

  const activateOrder = async (order: PackageOrder) => {
    setActivatingId(order.id);
    try {
      const { error } = await supabase.functions.invoke('activate-package-order', {
        body: { order_id: order.id },
      });
      if (error) throw error;
      toast.success(`Package activated for ${order.vehicle_reg}`);
      fetchOrders();
    } catch {
      toast.error('Failed to activate package');
    } finally {
      setActivatingId(null);
    }
  };

  const getSiteName = (siteId: string | null) => {
    if (!siteId) return 'Any site';
    return sites.find(s => s.id === siteId)?.name || 'Unknown';
  };

  const formatPackageType = (type: string) => {
    return type.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  const pendingOrders = orders.filter(o => o.payment_status === 'pending' || o.payment_status === 'paid');
  const completedOrders = orders.filter(o => o.payment_status === 'activated' || o.payment_status === 'cancelled');

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <div className="flex-1 max-w-2xl mx-auto w-full px-4 py-6">
        <div className="flex items-center gap-3 mb-6">
          <Button variant="ghost" size="icon" onClick={() => navigate('/')}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div>
            <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
              <Package className="w-5 h-5 text-primary" />
              Package Orders
            </h1>
            <p className="text-sm text-muted-foreground">{orders.length} total orders</p>
          </div>
        </div>

        {/* Pending Orders */}
        {pendingOrders.length > 0 && (
          <div className="mb-6">
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-2">
              <Clock className="w-4 h-4" />
              Pending ({pendingOrders.length})
            </h2>
            <div className="space-y-3">
              {pendingOrders.map((order) => (
                <Card key={order.id}>
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <Car className="w-4 h-4 text-muted-foreground" />
                        <span className="font-bold text-foreground">{order.vehicle_reg}</span>
                      </div>
                      <Badge className={statusColors[order.payment_status] || 'bg-muted text-muted-foreground'}>
                        {order.payment_status}
                      </Badge>
                    </div>
                    <div className="grid grid-cols-2 gap-1 text-sm text-muted-foreground mb-3">
                      <span>Package: <span className="text-foreground">{formatPackageType(order.package_type)}</span></span>
                      <span>Duration: <span className="text-foreground">{order.duration_days} days</span></span>
                      <span>Amount: <span className="text-foreground font-semibold">R{order.amount}</span></span>
                      <span>Site: <span className="text-foreground">{getSiteName(order.site_id)}</span></span>
                      <span>Email: <span className="text-foreground">{order.customer_email}</span></span>
                      <span>Phone: <span className="text-foreground">{order.customer_phone}</span></span>
                    </div>
                    {order.vehicle_make && (
                      <p className="text-xs text-muted-foreground mb-3">
                        {order.vehicle_make} {order.vehicle_colour && `• ${order.vehicle_colour}`}
                      </p>
                    )}
                    <p className="text-xs text-muted-foreground mb-3">
                      Ordered: {new Date(order.created_at).toLocaleDateString()} {new Date(order.created_at).toLocaleTimeString()}
                    </p>
                    <Button
                      size="sm"
                      className="w-full gap-2"
                      onClick={() => activateOrder(order)}
                      disabled={activatingId === order.id}
                    >
                      {activatingId === order.id ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <CheckCircle className="w-4 h-4" />
                      )}
                      Activate Package
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        )}

        {/* Completed Orders */}
        {completedOrders.length > 0 && (
          <div>
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-2">
              <CheckCircle className="w-4 h-4" />
              Completed ({completedOrders.length})
            </h2>
            <div className="space-y-3">
              {completedOrders.map((order) => (
                <Card key={order.id} className="opacity-75">
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <Car className="w-4 h-4 text-muted-foreground" />
                        <span className="font-bold text-foreground">{order.vehicle_reg}</span>
                      </div>
                      <Badge className={statusColors[order.payment_status] || 'bg-muted text-muted-foreground'}>
                        {order.payment_status}
                      </Badge>
                    </div>
                    <div className="grid grid-cols-2 gap-1 text-sm text-muted-foreground">
                      <span>{formatPackageType(order.package_type)}</span>
                      <span>R{order.amount} • {order.duration_days} days</span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      {new Date(order.created_at).toLocaleDateString()}
                    </p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        )}

        {orders.length === 0 && (
          <div className="text-center py-12 text-muted-foreground">
            <Package className="w-12 h-12 mx-auto mb-3 opacity-50" />
            <p>No package orders yet</p>
          </div>
        )}
      </div>
      <Footer />
    </div>
  );
};

export default PackageOrders;
