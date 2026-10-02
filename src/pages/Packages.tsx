import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { Loader2, Plus, Car, ArrowLeft, Trash2, Pencil, Save } from 'lucide-react';
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
  const { isAdmin, siteId: mySiteId } = useAuth();
  const [sites, setSites] = useState<{ id: string; name: string }[]>([]);
  const [pkgSiteId, setPkgSiteId] = useState<string>('');
  useEffect(() => {
    supabase.from('sites').select('id, name').order('name').then(({ data }) => setSites(data || []));
  }, []);
  useEffect(() => { if (mySiteId && !pkgSiteId) setPkgSiteId(mySiteId); }, [mySiteId, pkgSiteId]);
  const siteNameOf = (id?: string | null) => sites.find(x => x.id === id)?.name || 'No site';
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

  // Edit state
  const [editPkg, setEditPkg] = useState<WashPackage | null>(null);
  const [editForm, setEditForm] = useState({ vehicle_reg: '', vehicle_make: '', vehicle_colour: '', customer_phone: '', wash_type: '', price: '', end_date: '', active: true, site_id: '' });
  const [saving, setSaving] = useState(false);

  // Delete confirm state
  const [deletePkg, setDeletePkg] = useState<WashPackage | null>(null);
  const [deleting, setDeleting] = useState(false);

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

  useEffect(() => { fetchPackages(); }, [fetchPackages]);

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
    if (!vehicleReg.trim()) { toast.error('Registration number is required'); return; }
    if (!pkgSiteId) { toast.error('Choose the site this package belongs to'); return; }
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
        site_id: pkgSiteId,
      } as any);
      if (error) throw error;
      toast.success(`Package created for ${vehicleReg.toUpperCase()}`);
      setVehicleReg(''); setVehicleMake(''); setVehicleColour(''); setCustomerPhone('');
      fetchPackages();
    } catch (err: any) {
      toast.error(err.message || 'Failed to create package');
    } finally { setCreating(false); }
  };

  const openEdit = (pkg: WashPackage) => {
    const endLocal = new Date(new Date(pkg.end_date).getTime() - new Date(pkg.end_date).getTimezoneOffset() * 60000).toISOString().slice(0, 10);
    setEditForm({
      vehicle_reg: pkg.vehicle_reg,
      vehicle_make: pkg.vehicle_make,
      vehicle_colour: pkg.vehicle_colour,
      customer_phone: pkg.customer_phone,
      wash_type: pkg.wash_type,
      price: String(pkg.price),
      end_date: endLocal,
      active: pkg.active,
      site_id: (pkg as any).site_id || '',
    });
    setEditPkg(pkg);
  };

  const handleSaveEdit = async () => {
    if (!editPkg) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from('wash_packages')
        .update({
          vehicle_reg: editForm.vehicle_reg.trim().toUpperCase(),
          vehicle_make: editForm.vehicle_make.trim(),
          vehicle_colour: editForm.vehicle_colour.trim(),
          customer_phone: editForm.customer_phone.trim(),
          wash_type: editForm.wash_type,
          price: Number(editForm.price),
          end_date: new Date(editForm.end_date).toISOString(),
          active: editForm.active,
          site_id: editForm.site_id || null,
          updated_at: new Date().toISOString(),
        } as any)
        .eq('id', editPkg.id);
      if (error) throw error;
      toast.success('Package updated');
      setEditPkg(null);
      fetchPackages();
    } catch (err: any) {
      toast.error(err.message || 'Failed to update');
    } finally { setSaving(false); }
  };

  const handleDelete = async () => {
    if (!deletePkg) return;
    setDeleting(true);
    try {
      const { error } = await supabase.from('wash_packages').delete().eq('id', deletePkg.id);
      if (error) throw error;
      toast.success(`Package for ${deletePkg.vehicle_reg} deleted`);
      setDeletePkg(null);
      fetchPackages();
    } catch (err: any) {
      toast.error(err.message || 'Failed to delete');
    } finally { setDeleting(false); }
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
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Site *</label>
              <select value={pkgSiteId} onChange={e => setPkgSiteId(e.target.value)} disabled={!!mySiteId && !isAdmin}
                className="w-full h-10 rounded-md bg-secondary border border-border px-3 text-sm">
                <option value="">Choose site…</option>
                {sites.map(x => <option key={x.id} value={x.id}>{x.name}</option>)}
              </select>
              <p className="text-[11px] text-muted-foreground mt-1">Works at this site, and at any sites linked to it on the Sites page.</p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Registration Number *</label>
                <Input value={vehicleReg} onChange={(e) => setVehicleReg(e.target.value)} placeholder="e.g. CA 123-456" className="font-mono bg-secondary border-border uppercase" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Make / Model</label>
                <Input value={vehicleMake} onChange={(e) => setVehicleMake(e.target.value)} placeholder="e.g. Toyota Hilux" className="bg-secondary border-border" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Colour</label>
                <Input value={vehicleColour} onChange={(e) => setVehicleColour(e.target.value)} placeholder="e.g. White" className="bg-secondary border-border" />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Customer Phone</label>
                <Input value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} placeholder="0812345678" className="font-mono bg-secondary border-border" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Duration</label>
                <Select value={String(duration)} onValueChange={(v) => setDuration(Number(v))}>
                  <SelectTrigger className="bg-secondary border-border"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {DURATION_OPTIONS.map((d) => (
                      <SelectItem key={d.days} value={String(d.days)}>{d.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Total Price (R)</label>
                <Input type="number" value={totalPrice.toFixed(2)} className="font-mono bg-secondary border-border" disabled />
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
                        <p>📍 {siteNameOf((pkg as any).site_id)}</p>
                        {pkg.vehicle_make && <p>{pkg.vehicle_make} — {pkg.vehicle_colour}</p>}
                        <p>{getPackageLabel(pkg.wash_type)} • R{Number(pkg.price).toFixed(2)}</p>
                        <p className="text-xs font-medium text-primary">♾️ Unlimited washes included</p>
                        <p>{new Date(pkg.start_date).toLocaleDateString()} → {new Date(pkg.end_date).toLocaleDateString()}</p>
                        {pkg.customer_phone && <p>📞 {pkg.customer_phone}</p>}
                      </div>
                      {isAdmin && (
                        <div className="flex items-center gap-2 pt-1">
                          <Button variant="outline" size="sm" className="gap-1" onClick={() => openEdit(pkg)}>
                            <Pencil className="w-3 h-3" /> Edit
                          </Button>
                          <Button variant="outline" size="sm" className="gap-1 text-destructive hover:text-destructive" onClick={() => setDeletePkg(pkg)}>
                            <Trash2 className="w-3 h-3" /> Delete
                          </Button>
                        </div>
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

      {/* Edit Dialog */}
      <Dialog open={!!editPkg} onOpenChange={(open) => !open && setEditPkg(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Package</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Site</label>
              <select value={editForm.site_id} onChange={e => setEditForm(f => ({ ...f, site_id: e.target.value }))}
                className="w-full h-10 rounded-md bg-secondary border border-border px-3 text-sm">
                <option value="">No site (won't work at any kiosk)</option>
                {sites.map(x => <option key={x.id} value={x.id}>{x.name}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Registration</label>
              <Input value={editForm.vehicle_reg} onChange={e => setEditForm(f => ({ ...f, vehicle_reg: e.target.value }))} className="font-mono uppercase bg-secondary border-border" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Make / Model</label>
                <Input value={editForm.vehicle_make} onChange={e => setEditForm(f => ({ ...f, vehicle_make: e.target.value }))} className="bg-secondary border-border" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Colour</label>
                <Input value={editForm.vehicle_colour} onChange={e => setEditForm(f => ({ ...f, vehicle_colour: e.target.value }))} className="bg-secondary border-border" />
              </div>
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Phone</label>
              <Input value={editForm.customer_phone} onChange={e => setEditForm(f => ({ ...f, customer_phone: e.target.value }))} className="font-mono bg-secondary border-border" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Package Type</label>
                <Select value={editForm.wash_type} onValueChange={v => setEditForm(f => ({ ...f, wash_type: v }))}>
                  <SelectTrigger className="bg-secondary border-border"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {PACKAGE_TYPES.map(t => <SelectItem key={t.id} value={t.id}>{t.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Price (R)</label>
                <Input type="number" value={editForm.price} onChange={e => setEditForm(f => ({ ...f, price: e.target.value }))} className="font-mono bg-secondary border-border" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">End Date</label>
                <Input type="date" value={editForm.end_date} onChange={e => setEditForm(f => ({ ...f, end_date: e.target.value }))} className="bg-secondary border-border" />
              </div>
              <div className="flex items-end pb-1">
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input type="checkbox" checked={editForm.active} onChange={e => setEditForm(f => ({ ...f, active: e.target.checked }))} className="rounded" />
                  Active
                </label>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditPkg(null)}>Cancel</Button>
            <Button onClick={handleSaveEdit} disabled={saving} className="gap-2">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirm Dialog */}
      <Dialog open={!!deletePkg} onOpenChange={(open) => !open && setDeletePkg(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete Package</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Are you sure you want to permanently delete the package for <strong className="text-foreground">{deletePkg?.vehicle_reg}</strong>? This cannot be undone.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeletePkg(null)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleting} className="gap-2">
              {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Packages;
