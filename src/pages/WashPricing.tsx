import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { toast } from 'sonner';
import { ArrowLeft, Loader2, Save, Plus, Trash2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import Footer from '@/components/Footer';

const VEHICLE_TYPES = [
  { id: 'small_medium', label: 'Small/Medium Cars' },
  { id: 'bakkie_suv', label: 'Bakkies/SUV' },
  { id: 'quantum', label: 'Quantum' },
] as const;

interface WashPrice {
  wash_type: string;
  vehicle_type: string;
  price: number;
  name: string;
  description: string;
}

interface WashExtra {
  id: string;
  name: string;
  price: number;
  active: boolean;
}

const WashPricing = () => {
  const navigate = useNavigate();
  const [prices, setPrices] = useState<WashPrice[]>([]);
  const [extras, setExtras] = useState<WashExtra[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [newExtraName, setNewExtraName] = useState('');
  const [newExtraPrice, setNewExtraPrice] = useState(0);
  const [addingExtra, setAddingExtra] = useState(false);
  const [activeTab, setActiveTab] = useState('small_medium');

  useEffect(() => {
    const fetchData = async () => {
      const [pricesRes, extrasRes] = await Promise.all([
        supabase.from('wash_prices').select('*').order('wash_type'),
        supabase.from('wash_extras').select('*').order('name'),
      ]);

      if (pricesRes.error) toast.error('Failed to load prices');
      else setPrices((pricesRes.data as WashPrice[]) || []);

      if (extrasRes.error) toast.error('Failed to load extras');
      else setExtras((extrasRes.data as WashExtra[]) || []);

      setLoading(false);
    };
    fetchData();
  }, []);

  const updatePrice = async (washType: string, vehicleType: string, newPrice: number, newName: string, newDescription: string) => {
    const key = `${washType}-${vehicleType}`;
    setSaving(key);
    const { error, data } = await supabase
      .from('wash_prices')
      .update({ price: newPrice, name: newName, description: newDescription, updated_at: new Date().toISOString() })
      .eq('wash_type', washType)
      .eq('vehicle_type', vehicleType)
      .select();

    console.log('[WashPricing] update result', { washType, vehicleType, error, data });
    if (error) toast.error(`Failed to update price: ${error.message}`);
    else if (!data || data.length === 0) toast.error('No row updated — check permissions');
    else {
      setPrices(prev => prev.map(p =>
        p.wash_type === washType && p.vehicle_type === vehicleType
          ? { ...p, price: newPrice, name: newName, description: newDescription }
          : p
      ));
      toast.success('Price updated');
    }
    setSaving(null);
  };

  const addExtra = async () => {
    if (!newExtraName.trim()) { toast.error('Enter a name'); return; }
    setAddingExtra(true);
    const { data, error } = await supabase
      .from('wash_extras')
      .insert({ name: newExtraName.trim(), price: newExtraPrice })
      .select()
      .single();

    if (error) toast.error('Failed to add extra');
    else {
      setExtras(prev => [...prev, data as WashExtra]);
      setNewExtraName('');
      setNewExtraPrice(0);
      toast.success('Extra added');
    }
    setAddingExtra(false);
  };

  const updateExtra = async (id: string, name: string, price: number) => {
    setSaving(id);
    const { error } = await supabase
      .from('wash_extras')
      .update({ name, price, updated_at: new Date().toISOString() })
      .eq('id', id);

    if (error) toast.error('Failed to update extra');
    else toast.success('Extra updated');
    setSaving(null);
  };

  const deleteExtra = async (id: string) => {
    const { error } = await supabase.from('wash_extras').delete().eq('id', id);
    if (error) toast.error('Failed to delete extra');
    else {
      setExtras(prev => prev.filter(e => e.id !== id));
      toast.success('Extra removed');
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  const filteredPrices = prices.filter(p => p.vehicle_type === activeTab);

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-4 py-4 flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate('/')}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <h1 className="text-lg font-bold text-foreground">Wash Pricing</h1>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-8 space-y-8">
        <section className="space-y-4">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Vehicle Type</h2>
          <div className="flex gap-1 bg-secondary rounded-lg p-1">
            {VEHICLE_TYPES.map(vt => (
              <button
                key={vt.id}
                onClick={() => setActiveTab(vt.id)}
                className={`flex-1 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                  activeTab === vt.id
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {vt.label}
              </button>
            ))}
          </div>

          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
            Wash Types — {VEHICLE_TYPES.find(v => v.id === activeTab)?.label}
          </h2>
          {filteredPrices.map(wp => (
            <PriceCard
              key={`${wp.wash_type}-${wp.vehicle_type}`}
              washPrice={wp}
              saving={saving === `${wp.wash_type}-${wp.vehicle_type}`}
              onSave={(price, name, desc) => updatePrice(wp.wash_type, wp.vehicle_type, price, name, desc)}
            />
          ))}
        </section>

        <section className="space-y-4">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Extras</h2>
          {extras.map(extra => (
            <ExtraCard key={extra.id} extra={extra} saving={saving === extra.id} onSave={updateExtra} onDelete={deleteExtra} />
          ))}

          <Card>
            <CardContent className="py-4">
              <p className="text-xs text-muted-foreground mb-3 font-semibold">Add New Extra</p>
              <div className="flex gap-2 items-end flex-wrap">
                <div className="flex-1 min-w-[150px]">
                  <label className="text-xs text-muted-foreground">Name</label>
                  <Input value={newExtraName} onChange={e => setNewExtraName(e.target.value)} placeholder="e.g. Interior Clean" />
                </div>
                <div className="w-28">
                  <label className="text-xs text-muted-foreground">Price (R)</label>
                  <Input type="number" value={newExtraPrice} onChange={e => setNewExtraPrice(Number(e.target.value))} />
                </div>
                <Button size="sm" className="gap-2" disabled={addingExtra} onClick={addExtra}>
                  {addingExtra ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                  Add
                </Button>
              </div>
            </CardContent>
          </Card>
        </section>
      </main>
      <Footer />
    </div>
  );
};

const PriceCard = ({
  washPrice,
  saving,
  onSave,
}: {
  washPrice: WashPrice;
  saving: boolean;
  onSave: (price: number, name: string, desc: string) => void;
}) => {
  const [price, setPrice] = useState(washPrice.price);
  const [name, setName] = useState(washPrice.name);
  const [description, setDescription] = useState(washPrice.description);

  return (
    <Card>
      <CardContent className="py-4 space-y-3">
        <span className="text-xs font-mono text-muted-foreground uppercase">{washPrice.wash_type}</span>
        <div className="space-y-2">
          <label className="text-xs text-muted-foreground">Name</label>
          <Input value={name} onChange={e => setName(e.target.value)} />
        </div>
        <div className="space-y-2">
          <label className="text-xs text-muted-foreground">Description</label>
          <Input value={description} onChange={e => setDescription(e.target.value)} />
        </div>
        <div className="space-y-2">
          <label className="text-xs text-muted-foreground">Price (R)</label>
          <Input type="number" value={price} onChange={e => setPrice(Number(e.target.value))} />
        </div>
        <Button size="sm" className="gap-2" disabled={saving} onClick={() => onSave(price, name, description)}>
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          Save
        </Button>
      </CardContent>
    </Card>
  );
};

const ExtraCard = ({
  extra,
  saving,
  onSave,
  onDelete,
}: {
  extra: WashExtra;
  saving: boolean;
  onSave: (id: string, name: string, price: number) => void;
  onDelete: (id: string) => void;
}) => {
  const [name, setName] = useState(extra.name);
  const [price, setPrice] = useState(extra.price);

  return (
    <Card>
      <CardContent className="py-4">
        <div className="flex gap-2 items-end flex-wrap">
          <div className="flex-1 min-w-[150px]">
            <label className="text-xs text-muted-foreground">Name</label>
            <Input value={name} onChange={e => setName(e.target.value)} />
          </div>
          <div className="w-28">
            <label className="text-xs text-muted-foreground">Price (R)</label>
            <Input type="number" value={price} onChange={e => setPrice(Number(e.target.value))} />
          </div>
          <Button size="sm" className="gap-2" disabled={saving} onClick={() => onSave(extra.id, name, price)}>
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Save
          </Button>
          <Button size="sm" variant="destructive" className="gap-2" onClick={() => onDelete(extra.id)}>
            <Trash2 className="w-4 h-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};

export default WashPricing;
