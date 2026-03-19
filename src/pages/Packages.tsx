import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { Loader2, Plus, Car, ArrowLeft, Trash2, Droplets } from 'lucide-react';
import Footer from '@/components/Footer';

interface WashPackage {
  id: string;
  customer_phone: string;
  vehicle_reg: string;
  vehicle_make: string;
  vehicle_colour: string;
  wash_type: string;
  price: number;
  start_date: string;
  end_date: string;
  active: boolean;
  created_at: string;
}

const WASH_TYPES = [
  { id: 'basic', label: 'Basic Wash' },
  { id: 'standard', label: 'Standard Wash' },
  { id: 'premium', label: 'Premium Wash' },
  { id: 'ultimate', label: 'Ultimate Wash' },
];

const DURATION_OPTIONS = [
  { days: 30, label: '1 Month' },
  { days: 60, label: '2 Months' },
  { days: 90, label: '3 Months' },
  { days: 180, label: '6 Months' },
  { days: 365, label: '1 Year' },
];

const Packages = () => {
  const navigate = useNavigate();
  const { isAdmin } = useAuth();
  const [packages, setPackages] = useState<WashPackage[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);

  // Form state
  const [vehicleReg, setVehicleReg] = useState('');
  const [vehicleMake, setVehicleMake] = useState('');
  const [vehicleColour, setVehicleColour] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [washType, setWashType] = useState('basic');
  const [price, setPrice] = useState(0);
  const [duration, setDuration] = useState(30);
  const [dbPrices, setDbPrices] = useState<Record<string, number>>({});

  const fetchPackages = useCallback(async () => {
    const { data, error } = await supabase
      .from('wash_packages')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) {
      toast.error('Failed to load packages');
    } else {
      setPackages((data as any[]) || []);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchPackages();
  }, [fetchPackages]);

  useEffect(() => {
    const fetchPrices = async () => {
      const { data } = await supabase
        .from('wash_prices')
        .select('wash_type, price')
        .eq('vehicle_type', 'small_medium');
      if (data) {
        const map: Record<string, number> = {};
        data.forEach((r: any) => { map[r.wash_type] = Number(r.price); });
        setDbPrices(map);
        setPrice(map['basic'] ?? 0);
      }
    };
    fetchPrices();
  }, []);

  const handleWashTypeChange = (type: string) => {
    setWashType(type);
    setPrice(dbPrices[type] ?? 0);
  };

  const handleCreate = async () => {
    if (!vehicleReg.trim()) {
      toast.error('Registration number is required');
      return;
    }
    setCreating(true);
    try {
      const endDate = new Date();
      endDate.setDate(endDate.getDate() + duration);

      const { error } = await supabase.from('wash_packages').insert({
        vehicle_reg: vehicleReg.trim().toUpperCase(),
        vehicle_make: vehicleMake.trim(),
        vehicle_colour: vehicleColour.trim(),
        customer_phone: customerPhone.trim(),
        wash_type: washType,
        price: price * (duration / 30), // Price per month × months
        start_date: new Date().toISOString(),
        end_date: endDate.toISOString(),
      } as any);

      if (error) throw error;
      toast.success(`Package created for ${vehicleReg.toUpperCase()}`);
      setVehicleReg('');
      setVehicleMake('');
      setVehicleColour('');
      setCustomerPhone('');
      fetchPackages();
    } catch (err: any) {
      toast.error(err.message || 'Failed to create package');
    } finally {
      setCreating(false);
    }
  };

  const handleDeactivate = async (id: string) => {
    const { error } = await supabase
      .from('wash_packages')
      .update({ active: false, updated_at: new Date().toISOString() } as any)
      .eq('id', id);
    if (error) {
      toast.error('Failed to deactivate');
    } else {
      toast.success('Package deactivated');
      fetchPackages();
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center gap-3">
          <button onClick={() => navigate('/')} className="p-2 rounded-md hover:bg-secondary transition-colors text-muted-foreground hover:text-foreground">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="p-2 rounded-lg bg-primary/10 text-primary">
            <Car className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-foreground">Monthly Wash Packages</h1>
            <p className="text-xs text-muted-foreground">Time-based packages with plate recognition</p>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-8 space-y-8">
        {/* Create Package Form */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
              Create New Package
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Registration Number *</label>
                <Input
                  value={vehicleReg}
                  onChange={(e) => setVehicleReg(e.target.value)}
                  placeholder="e.g. CA 123-456"
                  className="font-mono bg-secondary border-border uppercase"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Make / Model</label>
                <Input
                  value={vehicleMake}
                  onChange={(e) => setVehicleMake(e.target.value)}
                  placeholder="e.g. Toyota Hilux"
                  className="bg-secondary border-border"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Colour</label>
                <Input
                  value={vehicleColour}
                  onChange={(e) => setVehicleColour(e.target.value)}
                  placeholder="e.g. White"
                  className="bg-secondary border-border"
                />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Customer Phone</label>
                <Input
                  value={customerPhone}
                  onChange={(e) => setCustomerPhone(e.target.value)}
                  placeholder="0812345678"
                  className="font-mono bg-secondary border-border"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Wash Type</label>
                <Select value={washType} onValueChange={handleWashTypeChange}>
                  <SelectTrigger className="bg-secondary border-border">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {WASH_TYPES.map((w) => (
                      <SelectItem key={w.id} value={w.id}>{w.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Duration</label>
                <Select value={String(duration)} onValueChange={(v) => setDuration(Number(v))}>
                  <SelectTrigger className="bg-secondary border-border">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {DURATION_OPTIONS.map((d) => (
                      <SelectItem key={d.days} value={String(d.days)}>{d.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Total Price (R)</label>
                <Input
                  type="number"
                  min={0}
                  value={price * (duration / 30)}
                  onChange={(e) => setPrice(Math.max(0, parseFloat(e.target.value) || 0) / (duration / 30))}
                  className="font-mono bg-secondary border-border"
                  disabled={!isAdmin}
                />
              </div>
            </div>
            <Button onClick={handleCreate} disabled={creating} className="gap-2">
              {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              Create Package — R{(price * (duration / 30)).toFixed(2)}
            </Button>
          </CardContent>
        </Card>

        {/* Active Packages */}
        <section className="space-y-4">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
            Active Packages ({packages.filter(p => p.active && new Date(p.end_date) > new Date()).length})
          </h2>
          {packages.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground">
              <Car className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p className="font-mono text-sm">No packages created yet</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {packages.map((pkg) => {
                const isExpired = new Date(pkg.end_date) < new Date();
                const isActive = pkg.active && !isExpired;
                return (
                  <Card key={pkg.id} className={`${!isActive ? 'opacity-60' : ''}`}>
                    <CardContent className="p-4 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-lg font-bold font-mono text-foreground">{pkg.vehicle_reg}</span>
                        <Badge variant={isActive ? 'default' : 'secondary'}>
                          {isActive ? 'Active' : isExpired ? 'Expired' : 'Inactive'}
                        </Badge>
                      </div>
                      <div className="text-sm text-muted-foreground space-y-1">
                        {pkg.vehicle_make && <p>{pkg.vehicle_make} — {pkg.vehicle_colour}</p>}
                        <p className="capitalize">{pkg.wash_type} Wash • R{Number(pkg.price).toFixed(2)}</p>
                        <p className="text-xs font-medium text-primary">♾️ Unlimited washes included</p>
                        <p>
                          {new Date(pkg.start_date).toLocaleDateString()} → {new Date(pkg.end_date).toLocaleDateString()}
                        </p>
                        {pkg.customer_phone && <p>📞 {pkg.customer_phone}</p>}
                      </div>
                      {isActive && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="gap-1 text-destructive hover:text-destructive"
                          onClick={() => handleDeactivate(pkg.id)}
                        >
                          <Trash2 className="w-3 h-3" />
                          Deactivate
                        </Button>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </section>
      </main>
      <Footer />
    </div>
  );
};

export default Packages;
