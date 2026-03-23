import { useState, useCallback, useEffect } from 'react';
import { WashType, WashCode, WASH_OPTIONS, DEFAULT_PRICES, createWashCode, getCodeStatus } from '@/lib/codeGenerator';
import { WashTypeCard } from '@/components/WashTypeCard';
import { CodeDisplay } from '@/components/CodeDisplay';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Zap, Plus, Filter, Settings, Loader2, Save, BarChart3, LogOut, Users, DollarSign, Droplets, Printer, Car, ShoppingCart, Package } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import Footer from '@/components/Footer';
type FilterType = 'all' | 'active' | 'used' | 'expired';

const VEHICLE_TYPES = [
{ id: 'small_medium', label: 'Small/Medium Cars' },
{ id: 'bakkie_suv', label: 'Bakkies/SUV' },
{ id: 'quantum', label: 'Quantum' }] as
const;

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
  const { signOut, isAdmin } = useAuth();
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
  const [showSettings, setShowSettings] = useState(false);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [extras, setExtras] = useState<WashExtra[]>([]);
  const [selectedExtras, setSelectedExtras] = useState<Set<string>>(new Set());
  const [isMultiWash, setIsMultiWash] = useState(false);
  const [washQuantity, setWashQuantity] = useState(5);
  const [masterSiteUrl, setMasterSiteUrl] = useState('');
  const [siteName, setSiteName] = useState('');
  const [packagesEnabled, setPackagesEnabled] = useState(false);
  const [unlimitedPackagesEnabled, setUnlimitedPackagesEnabled] = useState(false);
  const [packageExteriorPrice, setPackageExteriorPrice] = useState('500');
  const [packageInteriorPrice, setPackageInteriorPrice] = useState('800');

  // Load business settings from database
  useEffect(() => {
    const fetchSettings = async () => {
      const { data } = await supabase.
      from('business_settings').
      select('key, value');
      if (data) {
        data.forEach((row: any) => {
          if (row.key === 'business_name') setBusinessName(row.value);
          if (row.key === 'business_phone') setBusinessPhone(row.value);
          if (row.key === 'receipt_footer') setReceiptFooter(row.value);
          if (row.key === 'expiry_days') setExpiryDays(Number(row.value) || 1);
          if (row.key === 'multi_wash_days') setMultiWashDays(Number(row.value) || 30);
          if (row.key === 'master_site_url') setMasterSiteUrl(row.value);
          if (row.key === 'site_name') setSiteName(row.value);
          if (row.key === 'packages_enabled') setPackagesEnabled(row.value === 'true');
          if (row.key === 'unlimited_packages_enabled') setUnlimitedPackagesEnabled(row.value === 'true');
          if (row.key === 'package_exterior_price') setPackageExteriorPrice(row.value);
          if (row.key === 'package_interior_price') setPackageInteriorPrice(row.value);
        });
      }
    };
    fetchSettings();
  }, []);

  // Load prices from database
  useEffect(() => {
    const fetchPrices = async () => {
      const { data } = await supabase.
      from('wash_prices').
      select('wash_type, vehicle_type, price');
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

  // Load codes from database
  const fetchCodes = useCallback(async () => {
    const { data, error } = await supabase.
    from('wash_codes').
    select('*').
    order('created_at', { ascending: false }).
    limit(100);

    if (error) {
      toast.error('Failed to load codes');
      console.error(error);
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
  }, []);

  useEffect(() => {
    fetchCodes();
  }, [fetchCodes]);

  // Load extras from database
  useEffect(() => {
    const fetchExtras = async () => {
      const { data } = await supabase.
      from('wash_extras').
      select('*').
      eq('active', true).
      order('name');
      if (data) {
        setExtras(data as WashExtra[]);
      }
    };
    fetchExtras();
  }, []);

  const extrasTotal = extras.
  filter((e) => selectedExtras.has(e.id)).
  reduce((sum, e) => sum + Number(e.price), 0);

  const totalPrice = price + extrasTotal;

  const handleWashSelect = (type: WashType) => {
    setSelectedWash(type);
    setPrice(dbPrices[selectedVehicle]?.[type] ?? DEFAULT_PRICES[type]);
  };

  const handleVehicleSelect = (vehicleType: string) => {
    setSelectedVehicle(vehicleType);
    setPrice(dbPrices[vehicleType]?.[selectedWash] ?? DEFAULT_PRICES[selectedWash]);
  };

  const toggleExtra = (id: string) => {
    setSelectedExtras((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);else
      next.add(id);
      return next;
    });
  };

  const handleGenerate = useCallback(async () => {
    setGenerating(true);
    try {
      const expiresAt = new Date();
      if (isMultiWash) {
        expiresAt.setDate(expiresAt.getDate() + multiWashDays);
      } else {
        expiresAt.setDate(expiresAt.getDate() + expiryDays);
      }
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
      } as any);

      if (error) {
        toast.error('Failed to save code');
        console.error(error);
        return;
      }

      await fetchCodes();
      toast.success(`Code ${newCode.code} generated — ${isMultiWash ? washQuantity + ' washes' : WASH_OPTIONS.find((w) => w.id === selectedWash)!.name}`);
      setCustomerPhone('');
      setSelectedExtras(new Set());
      setIsMultiWash(false);
      setWashQuantity(5);
    } finally {
      setGenerating(false);
    }
  }, [selectedWash, expiryDays, codes, customerPhone, totalPrice, isMultiWash, washQuantity]);

  const handleMarkUsed = useCallback(async (id: string) => {
    const code = codes.find((c) => c.id === id);
    if (!code) return;

    const newWashesUsed = code.washesUsed + 1;
    const isFullyUsed = code.totalWashes <= 1 || newWashesUsed >= code.totalWashes;

    const { error } = await supabase.
    from('wash_codes').
    update({
      washes_used: newWashesUsed,
      used: isFullyUsed,
      used_at: isFullyUsed ? new Date().toISOString() : null
    } as any).
    eq('id', id);

    if (error) {
      toast.error('Failed to update code');
      return;
    }
    setCodes((prev) => prev.map((c) => c.id === id ? {
      ...c,
      washesUsed: newWashesUsed,
      used: isFullyUsed,
      usedAt: isFullyUsed ? new Date() : undefined
    } : c));
    toast.info(code.totalWashes > 1 ?
    `Wash ${newWashesUsed}/${code.totalWashes} used` :
    'Code marked as used');
  }, [codes]);

  const filteredCodes = codes.filter((c) => {
    if (filter === 'all') return true;
    return getCodeStatus(c) === filter;
  });

  const activeCount = codes.filter((c) => getCodeStatus(c) === 'active').length;

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>);

  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center gap-3">
          <div className="p-2 rounded-lg bg-primary/10 text-primary">
            <Droplets className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-foreground">{businessName}</h1>
            <p className="text-xs text-muted-foreground font-mono">Code Generator</p>
          </div>
          <div className="ml-auto flex items-center gap-4">
            <button onClick={() => navigate('/pos')} className="p-2 rounded-md hover:bg-secondary transition-colors text-muted-foreground hover:text-foreground" title="Point of Sale">
              <ShoppingCart className="w-5 h-5" />
            </button>
            {packagesEnabled && (
              <button onClick={() => navigate('/packages')} className="p-2 rounded-md hover:bg-secondary transition-colors text-muted-foreground hover:text-foreground" title="Wash Packages">
                <Car className="w-5 h-5" />
              </button>
            )}
            {isAdmin &&
            <button onClick={() => setShowSettings(!showSettings)} className="p-2 rounded-md hover:bg-secondary transition-colors text-muted-foreground hover:text-foreground" title="Settings">
                <Settings className="w-5 h-5" />
              </button>
            }
            {!isAdmin &&
            <div className="flex items-center gap-2">
              <button onClick={() => navigate('/reports')} className="p-2 rounded-md hover:bg-secondary transition-colors text-muted-foreground hover:text-foreground" title="Reports">
                <BarChart3 className="w-5 h-5" />
              </button>
              <button onClick={signOut} className="p-2 rounded-md hover:bg-secondary transition-colors text-muted-foreground hover:text-foreground" title="Sign Out">
                <LogOut className="w-5 h-5" />
              </button>
            </div>
            }
            <div className="text-right">
              <span className="text-2xl font-bold font-mono text-primary">{activeCount}</span>
              <p className="text-xs text-muted-foreground">Active Codes</p>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-8 space-y-8">
        {showSettings &&
        <section className="rounded-lg border border-border bg-card p-4 space-y-3">
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Receipt Settings</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-lg">
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Business Name (receipt header)</label>
                <Input value={businessName} onChange={(e) => setBusinessName(e.target.value)} placeholder="BULLDOG CARWASH" className="bg-secondary border-border" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Business Phone (shown on receipt)</label>
                <Input value={businessPhone} onChange={(e) => setBusinessPhone(e.target.value)} placeholder="000-000-0000" className="bg-secondary border-border" />
              </div>
              <div className="sm:col-span-2">
                <label className="text-xs text-muted-foreground mb-1 block">Receipt Footer Message</label>
                <Input value={receiptFooter} onChange={(e) => setReceiptFooter(e.target.value)} placeholder="Scan QR code at the wash bay to start." className="bg-secondary border-border" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Single Wash Expiry (days)</label>
                <Input type="number" min={1} value={expiryDays} onChange={(e) => setExpiryDays(Number(e.target.value) || 1)} className="bg-secondary border-border" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Multi-Wash Expiry (days)</label>
                <Input type="number" min={1} value={multiWashDays} onChange={(e) => setMultiWashDays(Number(e.target.value) || 1)} className="bg-secondary border-border" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Site Name</label>
                <Input value={siteName} onChange={(e) => setSiteName(e.target.value)} placeholder="e.g. Main Branch, CBD, Mall" className="bg-secondary border-border" />
                <p className="text-xs text-muted-foreground mt-1">Identifies this location in package wash reports</p>
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Master Site URL (cross-site packages)</label>
                <Input value={masterSiteUrl} onChange={(e) => setMasterSiteUrl(e.target.value)} placeholder="https://vpjjzekbtpagjaauxood.supabase.co" className="bg-secondary border-border" />
              </div>
              <div className="sm:col-span-2 mt-2">
                <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Package Features</h3>
                <div className="space-y-3">
                  <label className="flex items-center gap-3 cursor-pointer">
                    <input type="checkbox" checked={unlimitedPackagesEnabled} onChange={(e) => setUnlimitedPackagesEnabled(e.target.checked)} className="w-4 h-4 rounded border-border accent-primary" />
                    <div>
                      <span className={`text-sm font-medium ${packagesEnabled ? 'text-foreground' : 'text-muted-foreground'}`}>Unlimited Washes</span>
                      <p className="text-xs text-muted-foreground">Package holders get unlimited washes for the duration</p>
                    </div>
                  </label>
                </div>
              </div>
              <div className="sm:col-span-2 mt-2">
                <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Package Prices (Monthly)</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">Ultimate Wash Exterior (R)</label>
                    <Input type="number" min={0} value={packageExteriorPrice} onChange={(e) => setPackageExteriorPrice(e.target.value)} className="font-mono bg-secondary border-border" />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">Ultimate Wash with Interior (R)</label>
                    <Input type="number" min={0} value={packageInteriorPrice} onChange={(e) => setPackageInteriorPrice(e.target.value)} className="font-mono bg-secondary border-border" />
                  </div>
                </div>
              </div>
              <div className="sm:col-span-2 mt-2">
                <label className="text-xs text-muted-foreground mb-2 block">Customer Portal QR Code (print & display for customers)</label>
                <div className="flex items-center gap-4">
                  <div data-mycodes-qr className="p-3 rounded-lg bg-white inline-block">
                    <QRCodeSVG value="https://washcodeadmin.lovable.app/my-codes" size={120} level="M" />
                   </div>
                   <div className="space-y-2">
                     <p className="text-xs text-muted-foreground font-mono">https://washcodeadmin.lovable.app/my-codes</p>
                    <p className="text-xs text-muted-foreground">Customers scan this to view their wash codes</p>
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-2"
                      onClick={() => {
                        const printWindow = window.open('', '_blank', 'width=500,height=600');
                        if (!printWindow) return;
                        const qrEl = document.querySelector('[data-mycodes-qr]')?.innerHTML || '';
                        printWindow.document.write(`<!DOCTYPE html><html><head><title>Scan to View Your Wash Codes</title><style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:'Courier New',monospace;display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:100vh;padding:40px;text-align:center}.title{font-size:24px;font-weight:bold;margin-bottom:8px}.subtitle{font-size:14px;color:#666;margin-bottom:32px}.qr-box{padding:24px;border:3px solid #000;border-radius:16px;display:inline-block;margin-bottom:24px}.qr-box svg{width:200px;height:200px}.url{font-size:12px;color:#999;margin-top:16px}@media print{body{padding:20px}}</style></head><body><div class="title">${businessName}</div><div class="subtitle">Scan to view your wash codes</div><div class="qr-box">${qrEl}</div><div class="url">https://washcodeadmin.lovable.app/my-codes</div></body></html>`);
                        printWindow.document.close();
                        printWindow.focus();
                        printWindow.print();
                      }}
                    >
                      <Printer className="w-4 h-4" />
                      Print QR Poster
                    </Button>
                  </div>
                </div>
              </div>
              <div className="sm:col-span-2">
                <div className="flex gap-2 flex-wrap">
                  <Button
                  variant="outline"
                  size="sm"
                  className="gap-2"
                  onClick={async () => {
                    const updates = [
                    { key: 'business_name', value: businessName },
                    { key: 'business_phone', value: businessPhone },
                    { key: 'receipt_footer', value: receiptFooter },
                    { key: 'expiry_days', value: String(expiryDays) },
                    { key: 'multi_wash_days', value: String(multiWashDays) },
                    { key: 'master_site_url', value: masterSiteUrl },
                    { key: 'site_name', value: siteName },
                    { key: 'packages_enabled', value: String(packagesEnabled) },
                    { key: 'unlimited_packages_enabled', value: String(unlimitedPackagesEnabled) },
                    { key: 'package_exterior_price', value: packageExteriorPrice },
                    { key: 'package_interior_price', value: packageInteriorPrice }];

                    for (const u of updates) {
                      await supabase.from('business_settings').update({ value: u.value }).eq('key', u.key);
                    }
                    toast.success('Receipt settings saved');
                  }}>
                  
                    <Save className="w-4 h-4" />
                    Save Settings
                  </Button>
                  <Button
                  variant="outline"
                  size="sm"
                  className="gap-2"
                  onClick={() => navigate('/reports')}>
                  
                    <BarChart3 className="w-4 h-4" />
                    View Reports
                  </Button>
                  <Button
                  variant="outline"
                  size="sm"
                  className="gap-2"
                  onClick={() => navigate('/pricing')}>
                  
                    <DollarSign className="w-4 h-4" />
                    Wash Pricing
                  </Button>
                  <Button
                  variant="outline"
                  size="sm"
                  className="gap-2"
                  onClick={() => navigate('/users')}>
                  
                    <Users className="w-4 h-4" />
                    Manage Users
                  </Button>
                  <Button
                  variant="outline"
                  size="sm"
                  className="gap-2"
                  onClick={() => navigate('/packages')}>
                  
                    <Car className="w-4 h-4" />
                    Wash Packages
                  </Button>
                  <Button
                  variant="outline"
                  size="sm"
                  className="gap-2"
                  onClick={() => navigate('/pos-products')}>
                  
                    <Package className="w-4 h-4" />
                    POS Products
                  </Button>
                  <Button
                  variant="outline"
                  size="sm"
                  className="gap-2 text-destructive hover:text-destructive"
                  onClick={signOut}>
                  
                    <LogOut className="w-4 h-4" />
                    Sign Out
                  </Button>
                </div>
              </div>
            </div>
          </section>
        }
        {/* Vehicle Type */}
        <section className="space-y-4">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Select Vehicle Type</h2>
          <div className="grid grid-cols-3 gap-3">
            {VEHICLE_TYPES.map((vt) => (
              <button
                key={vt.id}
                onClick={() => handleVehicleSelect(vt.id)}
                className={`rounded-lg border p-3 text-center text-sm font-medium transition-all ${
                  selectedVehicle === vt.id
                    ? 'border-primary bg-primary/10 text-primary ring-1 ring-primary/30'
                    : 'border-border bg-card text-muted-foreground hover:bg-secondary hover:text-foreground'
                }`}
              >
                {vt.label}
              </button>
            ))}
          </div>

          {/* Wash Package Type */}
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Wash Package</h2>
          <div className={`grid gap-3 ${unlimitedPackagesEnabled ? 'grid-cols-2' : 'grid-cols-1'}`}>
            <button
              onClick={() => { setIsMultiWash(false); }}
              className="rounded-lg border p-3 text-center transition-all border-primary bg-primary/10 text-primary ring-1 ring-primary/30"
            >
              <span className="text-sm font-medium block">Single Wash</span>
              <span className="text-xs opacity-70">{expiryDays} day{expiryDays !== 1 ? 's' : ''} expiry</span>
            </button>
            {unlimitedPackagesEnabled && (
              <button
                onClick={() => navigate('/packages')}
                className="rounded-lg border border-primary/30 bg-primary/5 p-3 text-center transition-all hover:bg-primary/10 hover:border-primary"
              >
                <Car className="w-4 h-4 mx-auto mb-1 text-primary" />
                <span className="text-sm font-medium block text-primary">Unlimited</span>
                <span className="text-xs text-muted-foreground">♾️ Plate-based</span>
              </button>
            )}
          </div>



          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Select Wash Type</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {WASH_OPTIONS.map((option) =>
            <WashTypeCard key={option.id} option={option} selected={selectedWash === option.id} onSelect={handleWashSelect} />
            )}
          </div>

          {/* Customer Details & Settings */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Customer Phone</label>
              <Input value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} placeholder="e.g. 0812345678" className="font-mono bg-secondary border-border" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Base Price (R)</label>
              <Input type="number" min={0} step={0.5} value={price} onChange={(e) => setPrice(Math.max(0, parseFloat(e.target.value) || 0))} className="font-mono bg-secondary border-border" disabled={!isAdmin} />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Expiry</label>
              <Input value={isMultiWash ? `${multiWashDays} days` : `${expiryDays} day${expiryDays !== 1 ? 's' : ''}`} disabled className="font-mono bg-secondary border-border opacity-60" />
            </div>
          </div>

          {/* Extras */}
          {extras.length > 0 &&
          <div className="space-y-2">
              <label className="text-xs text-muted-foreground block">Extras</label>
              <div className="flex flex-wrap gap-3">
                {extras.map((extra) =>
              <label key={extra.id} className="flex items-center gap-2 cursor-pointer rounded-md border border-border px-3 py-2 hover:bg-secondary transition-colors">
                    <Checkbox
                  checked={selectedExtras.has(extra.id)}
                  onCheckedChange={() => toggleExtra(extra.id)} />
                
                    <span className="text-sm">{extra.name}</span>
                    <span className="text-xs text-muted-foreground font-mono">R{extra.price}</span>
                  </label>
              )}
              </div>
              {extrasTotal > 0 &&
            <p className="text-xs text-muted-foreground font-mono">
                  Total: R{price} + R{extrasTotal} extras = <span className="text-foreground font-semibold">R{totalPrice}</span>
                </p>
            }
            </div>
          }


          <Button onClick={handleGenerate} disabled={generating} className="w-full sm:w-auto gap-2">
            {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            Generate Code — R{isMultiWash ? (totalPrice * washQuantity).toFixed(2) : totalPrice}
          </Button>
        </section>

        {/* Codes List */}
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Generated Codes</h2>
            <div className="flex items-center gap-1 text-xs">
              <Filter className="w-3 h-3 text-muted-foreground" />
              {(['all', 'active', 'used', 'expired'] as FilterType[]).map((f) =>
              <button key={f} onClick={() => setFilter(f)} className={`px-2 py-1 rounded transition-colors ${filter === f ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:text-foreground'}`}>
                  {f.charAt(0).toUpperCase() + f.slice(1)}
                </button>
              )}
            </div>
          </div>

          {filteredCodes.length === 0 ?
          <div className="text-center py-16 text-muted-foreground">
              <Zap className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p className="font-mono text-sm">{codes.length === 0 ? 'No codes generated yet' : 'No codes match filter'}</p>
            </div> :

          <div className="space-y-3">
              {filteredCodes.map((code) =>
            <CodeDisplay key={code.id} code={code} onMarkUsed={handleMarkUsed} isAdmin={isAdmin} onExpiryUpdated={(id, newExpiry) => setCodes(prev => prev.map(c => c.id === id ? { ...c, expiresAt: newExpiry } : c))} businessPhone={businessPhone} businessName={businessName} receiptFooter={receiptFooter} />
            )}
            </div>
          }
        </section>
      </main>

      <Footer />
    </div>);

};

export default Index;