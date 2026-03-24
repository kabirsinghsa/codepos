import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { ArrowLeft, Loader2, Minus, Plus, ShoppingCart, Trash2, Printer, Receipt } from 'lucide-react';
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
  const { user } = useAuth();
  const [products, setProducts] = useState<PosProduct[]>([]);
  const [basket, setBasket] = useState<BasketItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [businessName, setBusinessName] = useState('BULLDOG CARWASH');
  const [businessPhone, setBusinessPhone] = useState('');
  const [lastReceipt, setLastReceipt] = useState<{ items: BasketItem[]; total: number; date: Date; txId: string } | null>(null);

  useEffect(() => {
    const fetchData = async () => {
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
      setLoading(false);
    };
    fetchData();
  }, []);

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
      // Create transaction
      const { data: tx, error: txError } = await supabase
        .from('pos_transactions')
        .insert({ total: basketTotal, items_count: basketCount, created_by: user?.id } as any)
        .select('id')
        .single();

      if (txError || !tx) throw txError || new Error('Failed to create transaction');

      // Insert items
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
      ${i.product.description ? `<tr><td colspan="3" style="font-size:10px;color:#666;padding:0 0 4px 8px;">${i.product.description}</td></tr>` : ''}
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
        @media print { body { width: 100%; } }
      </style></head><body>
      <div class="header">
        <h1>${businessName}</h1>
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
      <div class="footer">
        <p>Thank you for your purchase!</p>
      </div>
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
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center gap-3">
          <button onClick={() => navigate('/')} className="p-2 rounded-md hover:bg-secondary transition-colors text-muted-foreground hover:text-foreground">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="p-2 rounded-lg bg-primary/10 text-primary">
            <ShoppingCart className="w-5 h-5" />
          </div>
          <h1 className="text-lg font-bold text-foreground">Point of Sale</h1>
          <div className="ml-auto flex items-center gap-2">
            {lastReceipt && (
              <Button variant="outline" size="sm" onClick={printReceipt} className="gap-2">
                <Printer className="w-4 h-4" /> Reprint
              </Button>
            )}
          </div>
        </div>
      </header>

      <div className="flex-1 flex flex-col lg:flex-row max-w-6xl mx-auto w-full">
        {/* Product grid */}
        <div className="flex-1 p-4 space-y-4 overflow-y-auto">
          <Input
            placeholder="Search products..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="bg-secondary border-border"
          />
          {filtered.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">No products found. Add products in POS Products settings.</p>
          ) : (
            categories.filter(cat => filtered.some(p => p.category === cat)).map(cat => (
              <div key={cat}>
                <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">{cat}</h2>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {filtered.filter(p => p.category === cat).map(p => (
                    <button
                      key={p.id}
                      onClick={() => addToBasket(p)}
                      className="rounded-lg border border-border bg-card hover:bg-secondary hover:border-primary/50 transition-all text-left active:scale-95 overflow-hidden flex flex-col"
                    >
                      {p.image_url ? (
                        <div className="aspect-square overflow-hidden bg-muted">
                          <img src={p.image_url} alt={p.name} className="w-full h-full object-cover" />
                        </div>
                      ) : (
                        <div className="aspect-square bg-muted/50 flex items-center justify-center">
                          <ShoppingCart className="w-8 h-8 text-muted-foreground/30" />
                        </div>
                      )}
                      <div className="p-2.5">
                        <p className="font-semibold text-sm text-foreground truncate">{p.name}</p>
                        <p className="text-lg font-bold font-mono text-primary mt-0.5">R{Number(p.price).toFixed(2)}</p>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>

        {/* Basket sidebar */}
        <div className="lg:w-80 border-t lg:border-t-0 lg:border-l border-border bg-card flex flex-col">
          <div className="p-4 border-b border-border">
            <h2 className="font-semibold text-foreground flex items-center gap-2">
              <Receipt className="w-4 h-4" /> Basket
              {basketCount > 0 && (
                <span className="ml-auto text-sm bg-primary/20 text-primary px-2 py-0.5 rounded-full font-mono">{basketCount}</span>
              )}
            </h2>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-2">
            {basket.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">Tap products to add to basket</p>
            ) : (
              basket.map(item => (
                <div key={item.product.id} className="flex items-center gap-2 p-2 rounded-lg bg-secondary/50">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{item.product.name}</p>
                    <p className="text-xs text-muted-foreground font-mono">R{Number(item.product.price).toFixed(2)} × {item.quantity}</p>
                  </div>
                  <div className="flex items-center gap-1">
                    <button onClick={() => updateQuantity(item.product.id, -1)} className="p-1 rounded hover:bg-secondary text-muted-foreground">
                      <Minus className="w-3.5 h-3.5" />
                    </button>
                    <span className="text-sm font-mono w-6 text-center text-foreground">{item.quantity}</span>
                    <button onClick={() => updateQuantity(item.product.id, 1)} className="p-1 rounded hover:bg-secondary text-muted-foreground">
                      <Plus className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={() => removeFromBasket(item.product.id)} className="p-1 rounded hover:bg-destructive/20 text-destructive ml-1">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <p className="text-sm font-bold font-mono text-foreground w-20 text-right">R{(item.product.price * item.quantity).toFixed(2)}</p>
                </div>
              ))
            )}
          </div>

          <div className="p-4 border-t border-border space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-lg font-semibold text-foreground">Total</span>
              <span className="text-2xl font-bold font-mono text-primary">R{basketTotal.toFixed(2)}</span>
            </div>
            <Button
              onClick={handleCheckout}
              disabled={basket.length === 0 || processing}
              className="w-full gap-2 text-base py-6"
              size="lg"
            >
              {processing ? <Loader2 className="w-5 h-5 animate-spin" /> : <Printer className="w-5 h-5" />}
              Checkout & Print Receipt
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Pos;
