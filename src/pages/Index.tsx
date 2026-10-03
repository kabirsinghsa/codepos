import { useState, useCallback, useEffect, useMemo } from 'react';
import { WashType, WashCode, WASH_OPTIONS, DEFAULT_PRICES, createWashCode, getCodeStatus } from '@/lib/codeGenerator';
import { WashTypeCard } from '@/components/WashTypeCard';
import { CodeDisplay } from '@/components/CodeDisplay';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Zap, Plus, Settings, Loader2, BarChart3, LogOut, Users, DollarSign, Droplets, Car, ShoppingCart, Package, MapPin, ClipboardList, QrCode, Save, Printer } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import Footer from '@/components/Footer';
import { motion, AnimatePresence } from 'framer-motion';

type FilterType = 'all' | 'active' | 'used' | 'expired';

const VEHICLE_TYPES = [
  { id: 'small_medium', label: 'Small/Medium' },
  { id: 'bakkie_suv', label: 'Bakkie/SUV' },
  { id: 'quantum', label: 'Quantum' }
] as const;

interface WashExtra {
  id: string;
  name: string;
  price: number;
  active: boolean;
}

const plcInputMap: Record<WashType, number> = {
  basic: 1,
  standard: 2,
  premium: 3,
  ultimate: 4
};

const Index = () => {
  const navigate = useNavigate();
  const { signOut, isAdmin, siteId: profileSiteId } = useAuth();
  // Staff use the site on their profile. Admins without a site pick which site they're selling for.
  const [adminSiteId, setAdminSiteId] = useState<string | null>(() => {
    try { return localStorage.getItem('codepos_admin_site'); } catch { return null; }
  });
  const [allSites, setAllSites] = useState<{ id: string; name: string }[]>([]);
  const siteId = profileSiteId || adminSiteId;
  const chooseAdminSite = (id: string) => {
    setAdminSiteId(id || null);
    try { id ? localStorage.setItem('codepos_admin_site', id) : localStorage.removeItem('codepos_admin_site'); } catch { /* ignore */ }
  };
  useEffect(() => {
    if (isAdmin && !profileSiteId) {
      supabase.from('sites').select('id, name').eq('active', true).order('name')
        .then(({ data }) => setAllSites(data || []));
    }
  }, [isAdmin, profileSiteId]);
  const [codes, setCodes] = useState<WashCode[]>([]);
  const [selectedWash, setSelectedWash] = useState<WashType>('basic');
  const [selectedVehicle, setSelectedVehicle] = useState('small_medium');
  const [expiryDays, setExpiryDays] = useState(1);
  const [multiWashDays, setMultiWashDays] = useState(30);
  const [filter, setFilter] = useState<FilterType>('all');
  const [customerPhone, setCustomerPhone] = useState('');
  const [price, setPrice] = useState<number>(0);
  const [siteLogo, setSiteLogo] = useState('');
  // Per-site wash menu (each wash mapped to an ESP32 relay)
  const [siteWashes, setSiteWashes] = useState<any[]>([]);
  const [vehiclePricing, setVehiclePricing] = useState(true);
  const [selectedSiteWashId, setSelectedSiteWashId] = useState<string | null>(null);
  const [dbPrices, setDbPrices] = useState<Record<string, Record<string, number>>>({});
  const [businessPhone, setBusinessPhone] = useState('000-000-0000');
  const [businessName, setBusinessName] = useState('GES CODE CONTROLLER');
  const [receiptFooter, setReceiptFooter] = useState('Scan QR code at the wash bay to start.');
  const [posReceiptHeader, setPosReceiptHeader] = useState('GES CODE CONTROLLER');
  const [posReceiptFooter, setPosReceiptFooter] = useState('Thank you for your purchase!');

  const [showSettings, setShowSettings] = useState(false);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [extras, setExtras] = useState<WashExtra[]>([]);
  const [selectedExtras, setSelectedExtras] = useState<Set<string>>(new Set());
  const [isMultiWash, setIsMultiWash] = useState(false);
  const [washQuantity, setWashQuantity] = useState(5);
  const [siteName, setSiteName] = useState('');
  const [packagesEnabled, setPackagesEnabled] = useState(false);
  const [unlimitedPackagesEnabled, setUnlimitedPackagesEnabled] = useState(false);
  const [packageExteriorPrice, setPackageExteriorPrice] = useState('500');
  const [packageInteriorPrice, setPackageInteriorPrice] = useState('800');
  const [posEnabled, setPosEnabled] = useState(false);
  const [activePackagesCount, setActivePackagesCount] = useState(0);

  useEffect(() => {
    const fetchSettings = async () => {
      const { data } = await supabase.from('business_settings').select('key, value');
      if (data) {
        data.forEach((row: any) => {
          if (row.key === 'business_name') setBusinessName(row.value);
          if (row.key === 'business_phone') setBusinessPhone(row.value);
          if (row.key === 'receipt_footer') setReceiptFooter(row.value);
          if (row.key === 'pos_receipt_header') setPosReceiptHeader(row.value);
          if (row.key === 'pos_receipt_footer') setPosReceiptFooter(row.value);
          if (row.key === 'expiry_days') setExpiryDays(Number(row.value) || 1);
          if (row.key === 'multi_wash_days') setMultiWashDays(Number(row.value) || 30);
          if (row.key === 'site_name') setSiteName(row.value);
          if (row.key === 'packages_enabled') setPackagesEnabled(row.value === 'true');
          if (row.key === 'unlimited_packages_enabled') setUnlimitedPackagesEnabled(row.value === 'true');
          if (row.key === 'package_exterior_price') setPackageExteriorPrice(row.value);
          if (row.key === 'package_interior_price') setPackageInteriorPrice(row.value);
          if (row.key === 'pos_enabled') setPosEnabled(row.value === 'true');
        });
      }
    };
    fetchSettings();
  }, []);

  useEffect(() => {
    const fetchSiteName = async () => {
      if (siteId) {
        const { data } = await (supabase as any).from('sites').select('name, logo_url').eq('id', siteId).single();
        if (data) { setSiteName(data.name); setSiteLogo(data.logo_url || ''); }
      } else {
        setSiteName('');
        setSiteLogo('');
      }
    };
    fetchSiteName();
  }, [siteId]);

  useEffect(() => {
    const fetchActivePackages = async () => {
      let query = supabase
        .from('wash_packages')
        .select('*', { count: 'exact', head: true })
        .eq('active', true)
        .gte('end_date', new Date().toISOString());
      // Packages belonging to this site
      if (siteId) query = query.eq('site_id', siteId);
      const { count } = await query;
      setActivePackagesCount(count || 0);
    };
    fetchActivePackages();
  }, [siteId]);

  useEffect(() => {
    const fetchPrices = async () => {
      const { data } = await supabase.from('wash_prices').select('wash_type, vehicle_type, price');
      if (data) {
        const priceMap: Record<string, Record<string, number>> = {};
        data.forEach((row: any) => {
          if (!priceMap[row.vehicle_type]) priceMap[row.vehicle_type] = {};
          priceMap[row.vehicle_type][row.wash_type] = Number(row.price);
        });
        setDbPrices(priceMap);
        setPrice(priceMap['small_medium']?.['basic'] ?? DEFAULT_PRICES.basic);
      }
    };
    fetchPrices();
  }, []);

  const sitePrice = (w: any, vehicle: string, pricingOn: boolean) =>
    Number(!pricingOn || vehicle === 'small_medium' ? w.price : vehicle === 'bakkie_suv' ? w.price_suv : w.price_quantum) || 0;

  useEffect(() => {
    if (!siteId) { setSiteWashes([]); setSelectedSiteWashId(null); return; }
    const db = supabase as any;
    Promise.all([
      db.from('site_washes').select('*').eq('site_id', siteId).eq('active', true).order('sort_order').order('created_at'),
      db.from('sites').select('vehicle_pricing').eq('id', siteId).maybeSingle(),
    ]).then(([w, s]: any[]) => {
      const list = w.data || [];
      const pricingOn = s.data?.vehicle_pricing !== false;
      setSiteWashes(list);
      setVehiclePricing(pricingOn);
      if (list.length) {
        setSelectedSiteWashId(list[0].id);
        setPrice(sitePrice(list[0], pricingOn ? selectedVehicle : 'small_medium', pricingOn));
      } else {
        setSelectedSiteWashId(null);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [siteId]);

  const selectedSiteWash = siteWashes.find(w => w.id === selectedSiteWashId) || null;
  const handleSiteWashSelect = (w: any) => {
    setSelectedSiteWashId(w.id);
    setPrice(sitePrice(w, selectedVehicle, vehiclePricing));
  };

  const fetchCodes = useCallback(async () => {
    let query = supabase
      .from('wash_codes')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(100);
    if (siteId) query = query.eq('site_id', siteId);
    const { data, error } = await query;

    if (error) {
      toast.error('Failed to load codes');
    } else if (data) {
      setCodes(data.map((row) => ({
        id: row.id,
        code: row.code,
        washType: row.wash_type as WashType,
        washName: (row as any).wash_name ?? undefined,
        customerPhone: row.customer_phone,
        price: Number(row.price),
        createdAt: new Date(row.created_at),
        expiresAt: new Date(row.expires_at),
        used: row.used,
        usedAt: row.used_at ? new Date(row.used_at) : undefined,
        totalWashes: (row as any).total_washes ?? 1,
        washesUsed: (row as any).washes_used ?? 0,
        vehicleType: (row as any).vehicle_type ?? 'small_medium',
        selectedExtras: (row as any).selected_extras ?? [],
      })));
    }
    setLoading(false);
  }, [siteId]);

  useEffect(() => { fetchCodes(); }, [fetchCodes]);

  useEffect(() => {
    const fetchExtras = async () => {
      // This site's extras plus any shared ones (no site)
      let q = (supabase as any).from('wash_extras').select('*').eq('active', true);
      q = siteId ? q.or(`site_id.eq.${siteId},site_id.is.null`) : q.is('site_id', null);
      const { data } = await q.order('sort_order').order('name');
      setExtras((data || []) as WashExtra[]);
      setSelectedExtras(new Set());
    };
    fetchExtras();
  }, [siteId]);

  const toggleExtra = (id: string) => setSelectedExtras(prev => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  const extrasTotal = extras.filter((e) => selectedExtras.has(e.id)).reduce((sum, e) => sum + Number(e.price), 0);
  const totalPrice = price + extrasTotal;

  const handleWashSelect = (type: WashType) => {
    setSelectedWash(type);
    setPrice(dbPrices[selectedVehicle]?.[type] ?? DEFAULT_PRICES[type]);
  };

  const handleVehicleSelect = (vehicleType: string) => {
    setSelectedVehicle(vehicleType);
    if (selectedSiteWash) setPrice(sitePrice(selectedSiteWash, vehicleType, vehiclePricing));
    else setPrice(dbPrices[vehicleType]?.[selectedWash] ?? DEFAULT_PRICES[selectedWash]);
  };

  const handleGenerate = useCallback(async () => {
    setGenerating(true);
    try {
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + (isMultiWash ? multiWashDays : expiryDays));
      const finalPrice = isMultiWash ? totalPrice * washQuantity : totalPrice;
      if (!siteId) {
        toast.error(isAdmin
          ? 'Choose a site first. Codes only work at the site that sold them.'
          : 'Your account has no site. Ask an admin to assign one on the Users page.');
        return;
      }
      const newCode = createWashCode(selectedWash, expiresAt, codes, customerPhone.trim(), finalPrice);

      const selectedExtrasList = extras.filter(e => selectedExtras.has(e.id)).map(e => ({ name: e.name, price: e.price }));
      const { error } = await supabase.from('wash_codes').insert({
        id: newCode.id,
        code: newCode.code,
        // For site washes, wash_type mirrors the relay (1=basic..4=ultimate) so older ESP32 sketches still fire the right relay
        wash_type: selectedSiteWash ? ((['basic', 'standard', 'premium', 'ultimate'] as WashType[])[selectedSiteWash.relay_number - 1] ?? 'basic') : selectedWash,
        customer_phone: customerPhone.trim(),
        price: finalPrice,
        expires_at: expiresAt.toISOString(),
        plc_input: selectedSiteWash ? selectedSiteWash.relay_number : plcInputMap[selectedWash],
        site_wash_id: selectedSiteWash?.id ?? null,
        wash_name: selectedSiteWash?.name ?? null,
        relay_number: selectedSiteWash ? selectedSiteWash.relay_number : null,
        total_washes: isMultiWash ? washQuantity : 1,
        washes_used: 0,
        vehicle_type: siteWashes.length && !vehiclePricing ? 'any' : selectedVehicle,
        selected_extras: selectedExtrasList,
        site_id: siteId,
      } as any);

      if (error) {
        toast.error('Failed to save code');
        return;
      }

      await fetchCodes();
      toast.success(`Code ${newCode.code} generated!`);
      setCustomerPhone('');
      setSelectedExtras(new Set());
      setIsMultiWash(false);
    } finally {
      setGenerating(false);
    }
  }, [selectedWash, expiryDays, codes, customerPhone, totalPrice, isMultiWash, washQuantity, siteId, extras, selectedExtras, multiWashDays, selectedVehicle, fetchCodes, isAdmin, selectedSiteWash, siteWashes, vehiclePricing]);

  const handleMarkUsed = useCallback(async (id: string) => {
    const code = codes.find((c) => c.id === id);
    if (!code) return;
    const newWashesUsed = code.washesUsed + 1;
    const isFullyUsed = code.totalWashes <= 1 || newWashesUsed >= code.totalWashes;
    const { error } = await supabase.from('wash_codes').update({
      washes_used: newWashesUsed, used: isFullyUsed, used_at: isFullyUsed ? new Date().toISOString() : null
    } as any).eq('id', id);
    if (error) { toast.error('Update failed'); return; }
    fetchCodes();
    toast.info('Status updated');
  }, [codes, fetchCodes]);

  const handleSaveSettings = async () => {
    const updates = [
      { key: 'business_name', value: businessName },
      { key: 'business_phone', value: businessPhone },
      { key: 'receipt_footer', value: receiptFooter },
      { key: 'pos_receipt_header', value: posReceiptHeader },
      { key: 'pos_receipt_footer', value: posReceiptFooter }
    ];
    const { error } = await supabase.from('business_settings').upsert(updates, { onConflict: 'key' });
    if (error) {
      toast.error('Failed to save settings');
    } else {
      toast.success('Receipt configurations updated');
    }
  };

  const filteredCodes = codes.filter((c) => filter === 'all' || getCodeStatus(c) === filter);
  const activeCount = codes.filter((c) => getCodeStatus(c) === 'active').length;

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground font-sans">
      <header className="page-header">
        <div className="max-w-7xl mx-auto px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {siteLogo ? (
                <img src={siteLogo} alt="Site logo" className="w-11 h-11 rounded-xl object-contain bg-white border border-border shadow-sm" />
              ) : (
                <div className="p-2.5 rounded-xl gradient-primary text-white shadow-lg">
                  <Droplets className="w-5 h-5" />
                </div>
              )}
              <div>
                <h1 className="text-lg font-bold uppercase tracking-tight">{siteName || businessName}</h1>
                <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-widest">Command Center</p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <button onClick={() => navigate('/pos')} className="p-2.5 rounded-xl bg-secondary border border-border text-primary hover:bg-primary/10 transition-all" title="Shop POS">
                <ShoppingCart className="w-4 h-4" />
              </button>
              <button onClick={() => setShowSettings(!showSettings)} className={`p-2.5 rounded-xl border transition-all ${showSettings ? 'gradient-primary text-white border-primary/50' : 'bg-secondary border-border text-muted-foreground hover:text-foreground'}`}>
                <Settings className="w-4 h-4" />
              </button>
              <button onClick={signOut} className="p-2.5 rounded-xl bg-secondary border border-border text-destructive hover:bg-destructive/10 transition-all">
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          </div>

          {isAdmin && !profileSiteId && (
            <div className="mt-3 flex items-center gap-2">
              <MapPin className="w-4 h-4 text-primary shrink-0" />
              <select
                value={adminSiteId || ''}
                onChange={e => chooseAdminSite(e.target.value)}
                className="flex-1 h-10 rounded-xl bg-secondary border border-border px-3 text-sm font-semibold"
                aria-label="Site you are selling for"
              >
                <option value="">Choose site to sell for…</option>
                {allSites.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
          )}

          {/* Stat counters — visible on all screens */}
          <div className="flex gap-3 mt-3">
            <div className="flex-1 stat-card flex items-center justify-between">
              <div>
                <p className="section-label">Active Codes</p>
                <p className="text-2xl font-bold font-mono text-primary leading-none mt-1">{activeCount}</p>
              </div>
              <div className="p-2 rounded-lg bg-primary/10"><QrCode className="w-4 h-4 text-primary" /></div>
            </div>
            <div className="flex-1 stat-card flex items-center justify-between">
              <div>
                <p className="section-label">Packages</p>
                <p className="text-2xl font-bold font-mono text-primary leading-none mt-1">{activePackagesCount}</p>
              </div>
              <div className="p-2 rounded-lg bg-primary/10"><Car className="w-4 h-4 text-primary" /></div>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8 space-y-10">
        {showSettings && (
          <motion.section initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="glass-card p-6 rounded-2xl space-y-6">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Button type="button" variant="outline" onClick={() => navigate('/reports')} className="h-16 flex flex-col gap-1 rounded-xl premium-card text-[10px] font-semibold uppercase tracking-wider border-0"><BarChart3 className="w-4 h-4 text-primary" /> Reports</Button>
              <Button type="button" variant="outline" onClick={() => navigate('/pricing')} className="h-16 flex flex-col gap-1 rounded-xl premium-card text-[10px] font-semibold uppercase tracking-wider border-0"><DollarSign className="w-4 h-4 text-primary" /> Pricing</Button>
              <Button type="button" variant="outline" onClick={() => navigate('/users')} className="h-16 flex flex-col gap-1 rounded-xl premium-card text-[10px] font-semibold uppercase tracking-wider border-0"><Users className="w-4 h-4 text-primary" /> Users</Button>
              <Button type="button" variant="outline" onClick={() => navigate('/packages')} className="h-16 flex flex-col gap-1 rounded-xl premium-card text-[10px] font-semibold uppercase tracking-wider border-0"><Car className="w-4 h-4 text-primary" /> Packages</Button>
              <Button type="button" variant="outline" onClick={() => navigate('/pos-products')} className="h-16 flex flex-col gap-1 rounded-xl premium-card text-[10px] font-semibold uppercase tracking-wider border-0"><Package className="w-4 h-4 text-primary" /> Catalog</Button>
              <Button type="button" variant="outline" onClick={() => navigate('/sites')} className="h-16 flex flex-col gap-1 rounded-xl premium-card text-[10px] font-semibold uppercase tracking-wider border-0"><MapPin className="w-4 h-4 text-primary" /> Sites</Button>
              <Button type="button" variant="outline" onClick={() => navigate('/package-orders')} className="h-16 flex flex-col gap-1 rounded-xl premium-card text-[10px] font-semibold uppercase tracking-wider border-0"><ClipboardList className="w-4 h-4 text-primary" /> Orders</Button>
              <Button type="button" variant="outline" onClick={() => navigate('/theme')} className="h-16 flex flex-col gap-1 rounded-xl premium-card text-[10px] font-semibold uppercase tracking-wider border-0"><Settings className="w-4 h-4 text-primary" /> Theme</Button>
              <Button type="button" variant="outline" onClick={() => navigate('/install')} className="h-16 flex flex-col gap-1 rounded-xl premium-card text-[10px] font-semibold uppercase tracking-wider border-0 !border-primary/30"><QrCode className="w-4 h-4 text-primary" /> Deploy</Button>
            </div>

            <div className="border-t border-border/50 pt-6 space-y-5">
              <h3 className="section-label flex items-center gap-2 text-primary">
                <Printer className="w-3.5 h-3.5" /> Receipt Settings
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-3 p-5 premium-card">
                  <p className="section-label text-primary">Wash Code Receipt</p>
                  <div>
                    <label className="text-[9px] font-medium text-muted-foreground uppercase ml-1">Footer Text</label>
                    <Input value={receiptFooter} onChange={(e) => setReceiptFooter(e.target.value)} className="bg-secondary border-border rounded-lg text-xs mt-1" />
                  </div>
                </div>
                <div className="space-y-3 p-5 premium-card">
                  <p className="section-label text-primary">POS Receipt</p>
                  <div>
                    <label className="text-[9px] font-medium text-muted-foreground uppercase ml-1">Header</label>
                    <Input value={posReceiptHeader} onChange={(e) => setPosReceiptHeader(e.target.value)} className="bg-secondary border-border rounded-lg text-xs mt-1" />
                  </div>
                  <div>
                    <label className="text-[9px] font-medium text-muted-foreground uppercase ml-1">Footer</label>
                    <Input value={posReceiptFooter} onChange={(e) => setPosReceiptFooter(e.target.value)} className="bg-secondary border-border rounded-lg text-xs mt-1" />
                  </div>
                </div>
              </div>
              <Button onClick={handleSaveSettings} className="w-full rounded-xl gap-2 font-semibold uppercase text-xs tracking-wider py-5 gradient-primary border-0">
                <Save className="w-4 h-4" /> Save Settings
              </Button>
            </div>
          </motion.section>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left Panel: Configuration */}
          <div className="lg:col-span-7 space-y-6">
            <section className="premium-card p-6 space-y-6">
              {(!siteWashes.length || vehiclePricing) && (
              <div className="space-y-3">
                <h2 className="section-label pl-1">01 — Vehicle Category</h2>
                <div className="grid grid-cols-3 gap-2">
                  {VEHICLE_TYPES.map((vt) => (
                    <button key={vt.id} onClick={() => handleVehicleSelect(vt.id)} className={`py-3.5 rounded-xl text-[10px] font-semibold uppercase tracking-wider transition-all border ${selectedVehicle === vt.id ? 'gradient-primary border-primary/50 text-white shadow-md' : 'bg-secondary border-border text-muted-foreground hover:text-foreground hover:border-border'}`}>
                      {vt.label}
                    </button>
                  ))}
                </div>
              </div>
              )}

              <div className="space-y-3">
                <h2 className="section-label pl-1">02 — Service Selection</h2>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                  {siteWashes.length ? siteWashes.map((w) => (
                    <button key={w.id} onClick={() => handleSiteWashSelect(w)}
                      className={`relative p-3.5 rounded-xl border transition-all duration-200 text-left w-full ${selectedSiteWashId === w.id ? 'border-primary/60 bg-primary/10 shadow-md' : 'border-border bg-secondary hover:bg-secondary/80'}`}>
                      <span className="font-semibold text-sm text-foreground block mb-1">{w.name}</span>
                      {w.description && <p className="text-xs text-muted-foreground leading-relaxed">{w.description}</p>}
                      <span className="text-[9px] text-muted-foreground/60 font-mono mt-1.5 block">
                        R{sitePrice(w, selectedVehicle, vehiclePricing).toFixed(2)} · Relay {w.relay_number}
                      </span>
                    </button>
                  )) : WASH_OPTIONS.map((option) => (
                    <WashTypeCard key={option.id} option={option} selected={selectedWash === option.id} onSelect={handleWashSelect} />
                  ))}
                </div>
              </div>

              {extras.length > 0 && (
                <div className="space-y-3">
                  <h2 className="section-label pl-1">Extras (optional)</h2>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                    {extras.map((e) => {
                      const on = selectedExtras.has(e.id);
                      return (
                        <button key={e.id} type="button" onClick={() => toggleExtra(e.id)} aria-pressed={on}
                          className={`p-3 rounded-xl border text-left transition-all ${on ? 'border-primary/60 bg-primary/10 shadow-md' : 'border-border bg-secondary hover:bg-secondary/80'}`}>
                          <span className="flex items-center justify-between gap-2">
                            <span className="font-semibold text-sm text-foreground">{e.name}</span>
                            <span className={`w-4 h-4 rounded border flex items-center justify-center text-[10px] ${on ? 'bg-primary border-primary text-primary-foreground' : 'border-border'}`}>{on ? '✓' : ''}</span>
                          </span>
                          <span className="text-xs text-muted-foreground font-mono">+R{Number(e.price).toFixed(2)}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className="space-y-3">
                <h2 className="section-label pl-1">03 — Client Details</h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-[9px] font-medium uppercase text-muted-foreground ml-1">Phone (Optional)</label>
                    <Input value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} placeholder="081 234 5678" className="h-12 bg-secondary border-border rounded-xl font-semibold text-primary font-mono tracking-wider" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[9px] font-medium uppercase text-muted-foreground ml-1">Value (R)</label>
                    <Input type="number" value={totalPrice} disabled className="h-12 bg-secondary/50 border-border rounded-xl font-bold text-xl text-success font-mono" />
                  </div>
                </div>
              </div>

              <Button onClick={handleGenerate} disabled={generating} className="w-full h-16 rounded-xl gradient-primary text-white font-semibold uppercase tracking-wider shadow-lg border-0 group">
                {generating ? <Loader2 className="w-5 h-5 animate-spin" /> : <Plus className="w-5 h-5 group-hover:rotate-90 transition-transform" />}
                Generate Access Code
              </Button>
            </section>
          </div>

          {/* Right Panel: Feed */}
          <div className="lg:col-span-5 space-y-4">
            <div className="flex items-center justify-between px-1">
              <h2 className="section-label">Live Code Feed</h2>
              <div className="flex gap-1">
                {(['all', 'active', 'used'] as FilterType[]).map((f) => (
                  <button key={f} onClick={() => setFilter(f)} className={`px-3 py-1 rounded-lg text-[9px] font-semibold uppercase tracking-wider border transition-all ${filter === f ? 'gradient-primary border-primary/50 text-white' : 'bg-secondary border-border text-muted-foreground hover:text-foreground'}`}>
                    {f}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-3 overflow-y-auto max-h-[800px] pr-1">
              {filteredCodes.length === 0 ? (
                <div className="py-20 text-center text-muted-foreground/40 uppercase text-[10px] font-medium tracking-widest">No matching transactions</div>
              ) : (
                filteredCodes.map((code) => (
                  <CodeDisplay key={code.id} code={code} onMarkUsed={handleMarkUsed} isAdmin={isAdmin} businessPhone={businessPhone} businessName={businessName} receiptFooter={receiptFooter} siteName={siteName} />
                ))
              )}
            </div>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
};

export default Index;
