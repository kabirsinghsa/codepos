import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { WashType, WASH_OPTIONS, getCodeStatus, WashCode } from '@/lib/codeGenerator';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Search, Loader2, Droplets, Clock, CheckCircle2, XCircle } from 'lucide-react';
import { format } from 'date-fns';
import { QRCodeSVG } from 'qrcode.react';
import Footer from '@/components/Footer';

const statusConfig = {
  active: { icon: Clock, label: 'ACTIVE', className: 'bg-success/10 text-success border-success/30' },
  used: { icon: CheckCircle2, label: 'USED', className: 'bg-muted text-muted-foreground border-border' },
  expired: { icon: XCircle, label: 'EXPIRED', className: 'bg-destructive/10 text-destructive border-destructive/30' },
};

const MyCodes = () => {
  const [phone, setPhone] = useState('');
  const [codes, setCodes] = useState<WashCode[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  const handleSearch = async () => {
    if (!phone.trim()) return;
    setLoading(true);
    setSearched(true);

    const { data, error } = await supabase
      .from('wash_codes')
      .select('*')
      .eq('customer_phone', phone.trim())
      .order('created_at', { ascending: false })
      .limit(20);

    if (!error && data) {
      setCodes(data.map(row => ({
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
      })));
    } else {
      setCodes([]);
    }
    setLoading(false);
  };

  const activeCodes = codes.filter(c => getCodeStatus(c) === 'active');
  const pastCodes = codes.filter(c => getCodeStatus(c) !== 'active');

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="border-b border-border bg-card/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-lg mx-auto px-4 py-4 flex items-center gap-3">
          <div className="p-2 rounded-xl bg-primary/10 text-primary">
            <Droplets className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-foreground">My Wash Codes</h1>
            <p className="text-xs text-muted-foreground">Enter your phone number to view codes</p>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-lg mx-auto w-full px-4 py-6 space-y-6">
        {/* Search */}
        <div className="flex gap-2">
          <Input
            placeholder="Enter your phone number"
            value={phone}
            onChange={e => setPhone(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSearch()}
            className="bg-secondary border-border font-mono"
          />
          <Button onClick={handleSearch} disabled={loading} size="icon" className="shrink-0">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
          </Button>
        </div>

        {/* Active Codes */}
        {activeCodes.length > 0 && (
          <section className="space-y-3">
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Active Codes</h2>
            {activeCodes.map(code => {
              const wash = WASH_OPTIONS.find(w => w.id === code.washType)!;
              const status = getCodeStatus(code);
              const cfg = statusConfig[status];
              return (
                <div key={code.id} className="rounded-xl border border-primary/20 bg-card p-5 space-y-4 glow-primary">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-lg font-bold text-foreground">{wash.name}</span>
                      <p className="text-xs text-muted-foreground">{wash.description}</p>
                    </div>
                    <span className={`text-xs px-2.5 py-1 rounded-full border font-semibold ${cfg.className}`}>
                      {cfg.label}
                    </span>
                  </div>

                  <div className="flex items-center justify-center">
                    <div className="p-3 rounded-xl bg-white">
                      <QRCodeSVG value={code.code} size={160} level="M" />
                    </div>
                  </div>

                  <div className="text-center">
                    <span className="font-mono text-2xl font-bold tracking-widest text-primary">{code.code}</span>
                  </div>

                  <div className="flex justify-between text-xs text-muted-foreground font-mono border-t border-border pt-3">
                    <span>Price: R{code.price.toFixed(2)}</span>
                    {code.totalWashes > 1 && (
                      <span className="text-primary font-semibold">{code.washesUsed}/{code.totalWashes} washes used</span>
                    )}
                    <span>Expires: {format(new Date(code.expiresAt), 'dd/MM/yy HH:mm')}</span>
                  </div>
                </div>
              );
            })}
          </section>
        )}

        {/* Past Codes */}
        {pastCodes.length > 0 && (
          <section className="space-y-3">
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Past Codes</h2>
            {pastCodes.map(code => {
              const wash = WASH_OPTIONS.find(w => w.id === code.washType)!;
              const status = getCodeStatus(code);
              const cfg = statusConfig[status];
              return (
                <div key={code.id} className="rounded-lg border border-border bg-card/50 p-4 opacity-60">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-foreground">{wash.name}</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full border ${cfg.className}`}>{cfg.label}</span>
                    </div>
                    <span className="text-xs text-muted-foreground font-mono">R{code.price.toFixed(2)}</span>
                  </div>
                  <div className="mt-2 flex justify-between text-xs text-muted-foreground font-mono">
                    <span>{code.code}</span>
                    <span>{format(new Date(code.createdAt), 'dd/MM/yy HH:mm')}</span>
                  </div>
                </div>
              );
            })}
          </section>
        )}

        {/* Empty States */}
        {searched && !loading && codes.length === 0 && (
          <div className="text-center py-16 text-muted-foreground">
            <Droplets className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p className="font-mono text-sm">No codes found for this number</p>
            <p className="text-xs mt-1">Make sure you entered the same number used at the counter</p>
          </div>
        )}

        {!searched && (
          <div className="text-center py-16 text-muted-foreground">
            <Search className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p className="font-mono text-sm">Enter your phone number above</p>
            <p className="text-xs mt-1">View your active wash codes and QR codes</p>
          </div>
        )}
      </main>

      <Footer />
    </div>
  );
};

export default MyCodes;
