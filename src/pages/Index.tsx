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
  const { signOut, isAdmin, siteId } = useAuth();
  const [codes, setCodes] = useState<WashCode[]>([]);
  const [selectedWash, setSelectedWash] = useState<WashType>('basic');
  const [selectedVehicle, setSelectedVehicle] = useState('small_medium');
  const [expiryDays, setExpiryDays] = useState(1);
  const [multiWashDays, setMultiWashDays] = useState(30);
  const [filter, setFilter] = useState<FilterType>('all');
  const [customerPhone, setCustomerPhone] = useState('');
  const [price, setPrice] = useState<number>(0);
  const [dbPrices, setDbPrices] = useState<Record<string, Record<string, number>>>({});
  const [businessPhone, setBusinessPhone] = useState('000-000-0000');
  const [businessName, setBusinessName] = useState('BULLDOG CARWASH');
  const [receiptFooter, setReceiptFooter] = useState('Scan QR code at the wash bay to start.');
  const [posReceiptHeader, setPosReceiptHeader] = useState('BULLDOG POS RECEIPT');
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
    const fetchActivePackages = async () => {
      let query = supabase
        .from('wash_packages')
        .select('*', { count: 'exact', head: true })
        .eq('active', true)
        .gte('end_date', new Date().toISOString());
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
      const { data } = await supabase.from('wash_extras').select('*').eq('active', true).order('name');
      if (data) setExtras(data as WashExtra[]);
    };
    fetchExtras();
  }, []);

  const extrasTotal = extras.filter((e) => selectedExtras.has(e.id)).reduce((sum, e) => sum + Number(e.price), 0);
  const totalPrice = price + extrasTotal;

  const handleWashSelect = (type: WashType) => {
    setSelectedWash(type);
    setPrice(dbPrices[selectedVehicle]?.[type] ?? DEFAULT_PRICES[type]);
  };

  const handleVehicleSelect = (vehicleType: string) => {
    setSelectedVehicle(vehicleType);
    setPrice(dbPrices[vehicleType]?.[selectedWash] ?? DEFAULT_PRICES[selectedWash]);
  };

  const handleGenerate = useCallback(async () => {
    setGenerating(true);
    try {
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + (isMultiWash ? multiWashDays : expiryDays));
      const finalPrice = isMultiWash ? totalPrice * washQuantity : totalPrice;
      const newCode = createWashCode(selectedWash, expiresAt, codes, customerPhone.trim(), finalPrice);

      const selectedExtrasList = extras.filter(e => selectedExtras.has(e.id)).map(e => ({ name: e.name, price: e.price }));
      const { error } = await supabase.from('wash_codes').insert({
        id: newCode.id,
        code: newCode.code,
        wash_type: selectedWash,
        customer_phone: customerPhone.trim(),
        price: finalPrice,
        expires_at: expiresAt.toISOString(),
        plc_input: plcInputMap[selectedWash],
        total_washes: isMultiWash ? washQuantity : 1,
        washes_used: 0,
        vehicle_type: selectedVehicle,
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
  }, [selectedWash, expiryDays, codes, customerPhone, totalPrice, isMultiWash, washQuantity, siteId, extras, selectedExtras, multiWashDays, selectedVehicle, fetchCodes]);

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
              <div className="p-2.5 rounded-xl gradient-primary text-white shadow-lg">
                <Droplets className="w-5 h-5" />
              </div>
              <div>
                <h1 className="text-lg font-bold uppercase tracking-tight">{businessName}</h1>
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
          <motion.section initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="bg-card border-2 border-border p-8 rounded-[2.5rem] shadow-2xl space-y-8">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 relative z-10">
              <Button variant="outline" onClick={() => navigate('/reports')} className="h-20 flex flex-col gap-1 rounded-2xl font-black uppercase text-[10px] tracking-widest border-2"><BarChart3 className="w-5 h-5" /> Business Reports</Button>
              <Button variant="outline" onClick={() => navigate('/pricing')} className="h-20 flex flex-col gap-1 rounded-2xl font-black uppercase text-[10px] tracking-widest border-2"><DollarSign className="w-5 h-5" /> Wash Pricing</Button>
              <Button variant="outline" onClick={() => navigate('/users')} className="h-20 flex flex-col gap-1 rounded-2xl font-black uppercase text-[10px] tracking-widest border-2"><Users className="w-5 h-5" /> User Access</Button>
              <Button variant="outline" onClick={() => navigate('/packages')} className="h-20 flex flex-col gap-1 rounded-2xl font-black uppercase text-[10px] tracking-widest border-2"><Car className="w-5 h-5" /> Manage Packages</Button>
              <Button variant="outline" onClick={() => navigate('/pos-products')} className="h-20 flex flex-col gap-1 rounded-2xl font-black uppercase text-[10px] tracking-widest border-2"><Package className="w-5 h-5" /> Shop Catalog</Button>
              <Button variant="outline" onClick={() => navigate('/sites')} className="h-20 flex flex-col gap-1 rounded-2xl font-black uppercase text-[10px] tracking-widest border-2"><MapPin className="w-5 h-5" /> Branch Sites</Button>
              <Button variant="outline" onClick={() => navigate('/package-orders')} className="h-20 flex flex-col gap-1 rounded-2xl font-black uppercase text-[10px] tracking-widest border-2"><ClipboardList className="w-5 h-5" /> Online Orders</Button>
              <Button variant="outline" onClick={() => navigate('/install')} className="h-20 flex flex-col gap-1 rounded-2xl font-black uppercase text-[10px] tracking-widest border-2 border-primary text-primary hover:bg-primary/5"><QrCode className="w-5 h-5" /> System Deployment</Button>
            </div>

            <div className="border-t border-border pt-8 space-y-6">
              <h3 className="text-xs font-black uppercase tracking-[0.3em] text-primary flex items-center gap-2">
                <Printer className="w-4 h-4" /> Printer Receipt Customization
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                {/* Wash Code Receipt */}
                <div className="space-y-4 p-6 bg-zinc-900/50 rounded-3xl border border-border shadow-inner">
                  <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground underline underline-offset-4 decoration-primary">Wash Code Receipt</p>
                  <div className="space-y-3">
                    <div>
                      <label className="text-[9px] font-bold text-zinc-500 uppercase ml-1">Receipt Footer</label>
                      <Input value={receiptFooter} onChange={(e) => setReceiptFooter(e.target.value)} className="bg-zinc-900 border-zinc-800 rounded-xl text-xs" />
                    </div>
                  </div>
                </div>

                {/* POS Receipt */}
                <div className="space-y-4 p-6 bg-zinc-900/50 rounded-3xl border border-border shadow-inner">
                  <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground underline underline-offset-4 decoration-orange-500">POS Shop Receipt</p>
                  <div className="space-y-3">
                    <div>
                      <label className="text-[9px] font-bold text-zinc-500 uppercase ml-1">Receipt Header</label>
                      <Input value={posReceiptHeader} onChange={(e) => setPosReceiptHeader(e.target.value)} className="bg-zinc-900 border-zinc-800 rounded-xl text-xs" />
                    </div>
                    <div>
                      <label className="text-[9px] font-bold text-zinc-500 uppercase ml-1">Receipt Footer</label>
                      <Input value={posReceiptFooter} onChange={(e) => setPosReceiptFooter(e.target.value)} className="bg-zinc-900 border-zinc-800 rounded-xl text-xs" />
                    </div>
                  </div>
                </div>
              </div>
              <Button onClick={handleSaveSettings} className="w-full rounded-2xl gap-2 font-black uppercase text-xs tracking-widest py-6 shadow-xl shadow-primary/10">
                <Save className="w-4 h-4" /> Save Receipt Configurations
              </Button>
            </div>
          </motion.section>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          {/* Left Panel: Configuration */}
          <div className="lg:col-span-7 space-y-8">
            <section className="bg-card border-2 border-border p-8 rounded-[2.5rem] shadow-xl space-y-8">
              <div className="space-y-4">
                <h2 className="text-[10px] font-black uppercase tracking-[0.3em] text-muted-foreground pl-1">01. Vehicle Category</h2>
                <div className="grid grid-cols-3 gap-3">
                  {VEHICLE_TYPES.map((vt) => (
                    <button key={vt.id} onClick={() => handleVehicleSelect(vt.id)} className={`py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all border-2 ${selectedVehicle === vt.id ? 'bg-primary border-primary text-white shadow-lg shadow-primary/20 scale-[1.02]' : 'bg-zinc-900 border-zinc-800 text-zinc-500 hover:bg-zinc-800'}`}>
                      {vt.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-4">
                <h2 className="text-[10px] font-black uppercase tracking-[0.3em] text-muted-foreground pl-1">02. Service Selection</h2>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {WASH_OPTIONS.map((option) => (
                    <WashTypeCard key={option.id} option={option} selected={selectedWash === option.id} onSelect={handleWashSelect} />
                  ))}
                </div>
              </div>

              <div className="space-y-4">
                <h2 className="text-[10px] font-black uppercase tracking-[0.3em] text-muted-foreground pl-1">03. Client Details</h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-[9px] font-black uppercase text-zinc-500 ml-1">Phone Number (Optional)</label>
                    <Input value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} placeholder="081 234 5678" className="h-14 bg-zinc-900 border-zinc-800 rounded-2xl font-black text-primary font-mono tracking-widest" />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[9px] font-black uppercase text-zinc-500 ml-1">Service Value (R)</label>
                    <Input type="number" value={totalPrice} disabled className="h-14 bg-zinc-900/50 border-zinc-800 rounded-2xl font-black text-2xl text-emerald-500 font-mono italic" />
                  </div>
                </div>
              </div>

              <Button onClick={handleGenerate} disabled={generating} className="w-full h-20 rounded-[1.5rem] bg-primary hover:bg-primary/90 text-white font-black uppercase tracking-[0.2em] shadow-2xl shadow-primary/20 text-sm italic group">
                {generating ? <Loader2 className="w-6 h-6 animate-spin" /> : <Plus className="w-6 h-6 group-hover:rotate-90 transition-transform" />}
                Generate Secure Access Code
              </Button>
            </section>
          </div>

          {/* Right Panel: Feed */}
          <div className="lg:col-span-5 space-y-6">
            <div className="flex items-center justify-between px-2">
              <h2 className="text-[10px] font-black uppercase tracking-[0.3em] text-muted-foreground">Live Code Stream</h2>
              <div className="flex gap-1">
                {(['all', 'active', 'used'] as FilterType[]).map((f) => (
                  <button key={f} onClick={() => setFilter(f)} className={`px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-tighter border transition-all ${filter === f ? 'bg-primary border-primary text-white' : 'bg-zinc-900 border-zinc-800 text-zinc-500'}`}>
                    {f}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-4 overflow-y-auto max-h-[800px] pr-2 custom-scrollbar text-orange-500">
              {filteredCodes.length === 0 ? (
                <div className="py-20 text-center opacity-20 italic uppercase text-[10px] font-black tracking-widest">No matching transactions</div>
              ) : (
                filteredCodes.map((code) => (
                  <CodeDisplay key={code.id} code={code} onMarkUsed={handleMarkUsed} isAdmin={isAdmin} businessPhone={businessPhone} businessName={businessName} receiptFooter={receiptFooter} />
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
