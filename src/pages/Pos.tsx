import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { ArrowLeft, Loader2, Minus, Plus, ShoppingCart, Trash2, Printer, Receipt, Store } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';

interface PosProduct {
  id: string;
  name: string;
  description: string;
  price: number;
  category: string;
  image_url: string;
}

interface BasketItem {
  product: PosProduct;
  quantity: number;
}

const Pos = () => {
  const navigate = useNavigate();
  const { user, siteId: userSiteId } = useAuth();
  const [products, setProducts] = useState<PosProduct[]>([]);
  const [basket, setBasket] = useState<BasketItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [businessName, setBusinessName] = useState('BULLDOG CARWASH');
  const [businessPhone, setBusinessPhone] = useState('');
  const [siteName, setSiteName] = useState('');
  const [lastReceipt, setLastReceipt] = useState<{ items: BasketItem[]; total: number; date: Date; txId: string } | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [productsRes, settingsRes] = await Promise.all([
          supabase.from('pos_products').select('*').eq('active', true).order('category').order('name'),
          supabase.from('business_settings').select('key, value'),
        ]);

        if (productsRes.data) setProducts(productsRes.data as any[]);
        if (settingsRes.data) {
          settingsRes.data.forEach((r: any) => {
            if (r.key === 'business_name') setBusinessName(r.value);
            if (r.key === 'business_phone') setBusinessPhone(r.value);
          });
        }

        if (userSiteId) {
          const { data: siteData } = await supabase.from('sites').select('name').eq('id', userSiteId).single();
          if (siteData) setSiteName(siteData.name);
        }
      } catch (err) {
        console.error("Error loading POS data:", err);
        toast.error("Database connection error");
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [userSiteId]);

  const addToBasket = (product: PosProduct) => {
    setBasket(prev => {
      const existing = prev.find(i => i.product.id === product.id);
      if (existing) {
        return prev.map(i => i.product.id === product.id ? { ...i, quantity: i.quantity + 1 } : i);
      }
      return [...prev, { product, quantity: 1 }];
    });
  };

  const updateQuantity = (productId: string, delta: number) => {
    setBasket(prev => prev.map(i => {
      if (i.product.id !== productId) return i;
      const newQty = i.quantity + delta;
      return newQty > 0 ? { ...i, quantity: newQty } : i;
    }).filter(i => i.quantity > 0));
  };

  const removeFromBasket = (productId: string) => {
    setBasket(prev => prev.filter(i => i.product.id !== productId));
  };

  const basketTotal = basket.reduce((sum, i) => sum + i.product.price * i.quantity, 0);
  const basketCount = basket.reduce((sum, i) => sum + i.quantity, 0);

  const handleCheckout = async () => {
    if (basket.length === 0) return;
    setProcessing(true);
    try {
      const { data: tx, error: txError } = await supabase
        .from('pos_transactions')
        .insert({
          total: basketTotal,
          items_count: basketCount,
          created_by: user?.id,
          site_id: userSiteId
        } as any)
        .select('id')
        .single();

      if (txError || !tx) throw txError || new Error('Failed to create transaction');

      const items = basket.map(i => ({
        transaction_id: tx.id,
        product_name: i.product.name,
        product_description: i.product.description,
        quantity: i.quantity,
        unit_price: i.product.price,
        line_total: i.product.price * i.quantity,
      }));

      const { error: itemsError } = await supabase.from('pos_transaction_items').insert(items as any);
      if (itemsError) throw itemsError;

      setLastReceipt({ items: [...basket], total: basketTotal, date: new Date(), txId: tx.id });
      setBasket([]);
      toast.success('Sale completed!');
    } catch (e: any) {
      toast.error(e.message || 'Checkout failed');
    } finally {
      setProcessing(false);
    }
  };

  const printReceipt = () => {
    if (!lastReceipt) return;
    const w = window.open('', '_blank', 'width=400,height=600');
    if (!w) return;
    const itemsHtml = lastReceipt.items.map(i => `
      <tr>
        <td style="text-align:left;padding:2px 0;">${i.product.name}</td>
        <td style="text-align:center;padding:2px 4px;">${i.quantity}</td>
        <td style="text-align:right;padding:2px 0;">R${(i.product.price * i.quantity).toFixed(2)}</td>
      </tr>
    `).join('');

    w.document.write(`<!DOCTYPE html><html><head><title>Receipt</title>
      <style>
        body { font-family: 'Courier New', monospace; width: 280px; margin: 0 auto; padding: 10px; font-size: 12px; color: #000; }
        .header { text-align: center; border-bottom: 1px dashed #000; padding-bottom: 8px; margin-bottom: 8px; }
        .header h1 { font-size: 16px; margin: 0; }
        .header p { margin: 2px 0; font-size: 11px; }
        table { width: 100%; border-collapse: collapse; }
        .divider { border-top: 1px dashed #000; margin: 8px 0; }
        .total { font-size: 16px; font-weight: bold; text-align: right; }
        .footer { text-align: center; margin-top: 12px; font-size: 10px; color: #666; }
      </style></head><body>
      <div class="header">
        <h1>${businessName}</h1>
        ${siteName ? `<p>Branch: ${siteName}</p>` : ''}
        ${businessPhone ? `<p>Tel: ${businessPhone}</p>` : ''}
        <p>${lastReceipt.date.toLocaleDateString()} ${lastReceipt.date.toLocaleTimeString()}</p>
        <p style="font-size:9px;">TX: ${lastReceipt.txId.slice(0, 8).toUpperCase()}</p>
      </div>
      <table>
        <thead><tr>
          <th style="text-align:left;border-bottom:1px solid #000;padding-bottom:4px;">Item</th>
          <th style="text-align:center;border-bottom:1px solid #000;padding-bottom:4px;">Qty</th>
          <th style="text-align:right;border-bottom:1px solid #000;padding-bottom:4px;">Total</th>
        </tr></thead>
        <tbody>${itemsHtml}</tbody>
      </table>
      <div class="divider"></div>
      <div class="total">TOTAL: R${lastReceipt.total.toFixed(2)}</div>
      <div class="footer"><p>Thank you for your purchase!</p></div>
      <script>window.onload=function(){window.print();}</script>
    </body></html>`);
    w.document.close();
  };

  const categories = [...new Set(products.map(p => p.category))];
  const filtered = products.filter(p =>
    p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    p.category.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center gap-3">
          <button onClick={() => navigate('/')} className="p-2 rounded-xl hover:bg-secondary transition-colors text-muted-foreground hover:text-foreground">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="p-2.5 rounded-xl bg-primary/10 text-primary">
            <ShoppingCart className="w-5 h-5" />
          </div>
          <h1 className="text-lg font-black uppercase tracking-tight italic">Point of Sale</h1>

          {siteName && (
            <div className="flex items-center gap-1.5 px-4 py-1.5 bg-zinc-900 text-zinc-100 rounded-full ml-4 border border-zinc-800 shadow-lg">
              <Store className="w-3.5 h-3.5 text-blue-400" />
              <span className="text-[10px] font-black uppercase tracking-[0.2em]">{siteName} terminal</span>
            </div>
          )}

          <div className="ml-auto flex items-center gap-2">
            {lastReceipt && (
              <Button variant="outline" size="sm" onClick={printReceipt} className="gap-2 font-black text-[10px] rounded-xl border-2">
                <Printer className="w-4 h-4" /> REPRINT RECEIPT
              </Button>
            )}
          </div>
        </div>
      </header>

      <div className="flex-1 flex flex-col lg:flex-row max-w-7xl mx-auto w-full">
        <div className="flex-1 p-6 space-y-6 overflow-y-auto">
          <Input
            placeholder="SEARCH CATALOG..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="bg-card border-2 border-border h-14 rounded-2xl px-6 font-black tracking-widest shadow-sm"
          />

          {filtered.length === 0 ? (
            <div className="text-center py-20 opacity-30 italic uppercase text-xs font-black tracking-widest">No matching items</div>
          ) : (
            categories.filter(cat => filtered.some(p => p.category === cat)).map(cat => (
              <div key={cat} className="space-y-4">
                <h2 className="text-[10px] font-black text-muted-foreground uppercase tracking-[0.3em] px-2 flex items-center gap-2">
                  <div className="h-1 w-1 rounded-full bg-primary" /> {cat}
                </h2>
                <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-4">
                  {filtered.filter(p => p.category === cat).map(p => (
                    <button
                      key={p.id}
                      onClick={() => addToBasket(p)}
                      className="group relative rounded-3xl border-2 border-border bg-card hover:border-primary/40 hover:shadow-xl hover:-translate-y-1 transition-all text-left active:scale-95 overflow-hidden flex flex-col shadow-sm"
                    >
                      <div className="aspect-square overflow-hidden bg-muted">
                        {p.image_url ? (
                          <img src={p.image_url} alt={p.name} className="w-full h-full object-cover transition-transform group-hover:scale-110" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center bg-secondary/50">
                            <ShoppingCart className="w-10 h-10 text-muted-foreground/20" />
                          </div>
                        )}
                      </div>
                      <div className="p-4 space-y-1">
                        <p className="font-black text-xs text-foreground truncate uppercase tracking-tight">{p.name}</p>
                        <p className="text-xl font-black font-mono text-primary">R{Number(p.price).toFixed(2)}</p>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>

        {/* Basket sidebar */}
        <div className="lg:w-[400px] border-t lg:border-t-0 lg:border-l-2 border-border bg-muted/10 flex flex-col backdrop-blur-xl">
          <div className="p-8 border-b-2 border-border flex items-center justify-between">
            <h2 className="font-black text-foreground flex items-center gap-3 uppercase tracking-widest text-base italic">
              <Receipt className="w-5 h-5 text-primary" /> Active Basket
            </h2>
            {basketCount > 0 && (
              <span className="text-[10px] bg-blue-600 text-white px-3 py-1 rounded-full font-black shadow-lg">
                {basketCount} UNITS
              </span>
            )}
          </div>

          <div className="flex-1 overflow-y-auto p-6 space-y-4">
            {basket.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center opacity-20 gap-6">
                <ShoppingCart className="w-16 h-12" />
                <p className="text-[10px] font-black uppercase tracking-[0.4em]">Cart is empty</p>
              </div>
            ) : (
              basket.map(item => (
                <div key={item.product.id} className="flex items-center gap-4 p-4 rounded-[1.5rem] bg-card border-2 border-border shadow-md">
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-black text-foreground truncate uppercase tracking-tighter">{item.product.name}</p>
                    <p className="text-[10px] font-black text-primary font-mono mt-1">R{Number(item.product.price).toFixed(2)}</p>
                  </div>
                  <div className="flex flex-col items-center gap-1.5 bg-muted rounded-2xl p-1.5">
                    <button onClick={() => updateQuantity(item.product.id, 1)} className="p-1.5 rounded-xl hover:bg-background text-primary transition-all">
                      <Plus className="w-3.5 h-3.5" />
                    </button>
                    <span className="text-xs font-black font-mono w-6 text-center">{item.quantity}</span>
                    <button onClick={() => updateQuantity(item.product.id, -1)} className="p-1.5 rounded-xl hover:bg-background text-muted-foreground transition-all">
                      <Minus className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <button onClick={() => removeFromBasket(item.product.id)} className="p-2.5 rounded-2xl hover:bg-red-500/10 text-red-500 transition-colors">
                    <Trash2 className="w-4.5 h-4.5" />
                  </button>
                </div>
              ))
            )}
          </div>

          <div className="p-8 bg-card border-t-2 border-border space-y-6">
            <div className="flex justify-between items-center px-2">
              <span className="text-[10px] font-black uppercase tracking-[0.3em] text-muted-foreground">Order Total</span>
              <p className="text-4xl font-black font-mono text-primary">R{basketTotal.toFixed(2)}</p>
            </div>
            <Button
              onClick={handleCheckout}
              disabled={basket.length === 0 || processing}
              className="w-full font-black py-8 rounded-[2rem] shadow-2xl uppercase tracking-[0.2em] bg-primary text-primary-foreground"
              size="lg"
            >
              {processing ? <Loader2 className="w-6 h-6 animate-spin" /> : "Finalize Sale"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Pos;
