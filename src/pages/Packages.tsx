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
import { Loader2, Plus, Car, ArrowLeft, Trash2 } from 'lucide-react';
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

const PACKAGE_TYPES = [
  { id: 'ultimate_exterior', label: 'Ultimate Wash Exterior' },
  { id: 'ultimate_interior', label: 'Ultimate Wash with Interior' },
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
  const [packageType, setPackageType] = useState('ultimate_exterior');
  const [duration, setDuration] = useState(30);

  // Admin-set prices
  const [exteriorPrice, setExteriorPrice] = useState(500);
  const [interiorPrice, setInteriorPrice] = useState(800);

  const monthlyPrice = packageType === 'ultimate_exterior' ? exteriorPrice : interiorPrice;
  const totalPrice = monthlyPrice * (duration / 30);

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

  // Fetch admin-configured package prices
  useEffect(() => {
    const fetchPrices = async () => {
      const { data } = await supabase
        .from('business_settings')
        .select('key, value')
        .in('key', ['package_exterior_price', 'package_interior_price']);
      if (data) {
        data.forEach((row: any) => {
          if (row.key === 'package_exterior_price') setExteriorPrice(Number(row.value) || 500);
          if (row.key === 'package_interior_price') setInteriorPrice(Number(row.value) || 800);
        });
      }
    };
    fetchPrices();
  }, []);

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
        wash_type: packageType,
        price: totalPrice,
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

  const getPackageLabel = (type: string) =>
    PACKAGE_TYPES.find((p) => p.id === type)?.label || type;

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="page-container">
      <header className="page-header">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center gap-3">
          <button onClick={() => navigate('/')} className="p-2 rounded-lg hover:bg-secondary transition-colors text-muted-foreground hover:text-foreground">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="p-2 rounded-xl gradient-primary text-white">
            <Car className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-foreground">Wash Packages</h1>
            <p className="text-[10px] text-muted-foreground font-medium">Unlimited plans with plate recognition</p>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-8 space-y-8">
        {/* Package Tier Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {PACKAGE_TYPES.map((tier) => {
            const mp = tier.id === 'ultimate_exterior' ? exteriorPrice : interiorPrice;
            const isSelected = packageType === tier.id;
            return (
              <Card
                key={tier.id}
                className={`cursor-pointer transition-all premium-card border-0 ${isSelected ? 'ring-2 ring-primary !border-primary/40' : ''}`}
                onClick={() => setPackageType(tier.id)}
              >
                <CardContent className="p-5 text-center space-y-2">
                  <Car className={`w-7 h-7 mx-auto ${isSelected ? 'text-primary' : 'text-muted-foreground'}`} />
                  <h3 className="font-bold text-foreground">{tier.label}</h3>
                  <p className="text-2xl font-bold text-primary">R{mp.toFixed(2)}<span className="text-sm font-normal text-muted-foreground">/mo</span></p>
                  <p className="text-[10px] text-muted-foreground">♾️ Unlimited washes</p>
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* Create Package Form */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
              Create New Package — {getPackageLabel(packageType)}
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
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
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
                  value={totalPrice.toFixed(2)}
                  className="font-mono bg-secondary border-border"
                  disabled
                />
              </div>
            </div>
            <Button onClick={handleCreate} disabled={creating} className="gap-2">
              {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              Create Package — R{totalPrice.toFixed(2)}
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
                        <p>{getPackageLabel(pkg.wash_type)} • R{Number(pkg.price).toFixed(2)}</p>
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
