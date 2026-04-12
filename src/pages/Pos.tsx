import { useState, useEffect, useCallback } from 'react';
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
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [userSiteId]);

  const printReceipt = useCallback((receiptData: { items: BasketItem[]; total: number; date: Date; txId: string }) => {
    const itemsHtml = receiptData.items.map(i => `
      <tr>
        <td style="text-align:left;padding:4px 0;">${i.product.name.toUpperCase()}</td>
        <td style="text-align:center;padding:4px;">${i.quantity}</td>
        <td style="text-align:right;padding:4px 0;">R${(i.product.price * i.quantity).toFixed(2)}</td>
      </tr>
    `).join('');

    const html = `<!DOCTYPE html><html><head><title>Receipt</title>
      <style>
        @page { margin: 0; size: 80mm auto; }
        body { font-family: 'Courier New', monospace; width: 72mm; margin: 0 auto; padding: 8mm 4mm; font-size: 12px; color: #000; line-height: 1.4; }
        .header { text-align: center; border-bottom: 2px dashed #000; padding-bottom: 10px; margin-bottom: 10px; }
        .header h1 { font-size: 18px; margin: 0; font-weight: 900; }
        table { width: 100%; border-collapse: collapse; margin: 10px 0; }
        .total-box { border-top: 2px dashed #000; padding-top: 10px; margin-top: 10px; text-align: right; }
        .total-box p { font-size: 16px; font-weight: 900; margin: 0; }
        .footer { text-align: center; margin-top: 20px; font-size: 10px; font-style: italic; }
      </style></head>
      <body>
        <div class="header">
          <h1>${siteName ? `${businessName} ${siteName.toUpperCase()}` : businessName}</h1>
          <p>${businessPhone ? `TEL: ${businessPhone}` : ''}</p>
          <p>${businessPhone ? `TEL: ${businessPhone}` : ''}</p>
          <p>${receiptData.date.toLocaleDateString()} ${receiptData.date.toLocaleTimeString()}</p>
          <p style="font-size:9px; margin-top:4px;">TXID: ${receiptData.txId.toUpperCase()}</p>
        </div>
        <table>
          <thead><tr style="border-bottom:1px solid #000;"><th align="left">ITEM</th><th>QTY</th><th align="right">TOTAL</th></tr></thead>
          <tbody>${itemsHtml}</tbody>
        </table>
        <div class="total-box"><p>TOTAL: R${receiptData.total.toFixed(2)}</p></div>
        <div class="footer"><p>Thank you for your business!</p></div>
      </body></html>`;

    const iframe = document.createElement('iframe');
    iframe.style.position = 'fixed';
    iframe.style.top = '-10000px';
    iframe.style.left = '-10000px';
    iframe.style.width = '80mm';
    iframe.style.height = '0';
    document.body.appendChild(iframe);

    const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
    if (iframeDoc) {
      iframeDoc.open();
      iframeDoc.write(html);
      iframeDoc.close();

      // Single print attempt after content is ready
      setTimeout(() => {
        try {
          iframe.contentWindow?.focus();
          iframe.contentWindow?.print();
        } catch (e) {
          // Fallback: open in new window
          const w = window.open('', '_blank', 'width=400,height=600');
          if (w) {
            w.document.write(html);
            w.document.close();
            setTimeout(() => { w.focus(); w.print(); setTimeout(() => w.close(), 1000); }, 300);
          } else {
            toast.error('Could not open print dialog. Please allow popups.');
          }
        }
        setTimeout(() => {
          try { document.body.removeChild(iframe); } catch {}
        }, 3000);
      }, 500);
    }
  }, [businessName, businessPhone, siteName]);

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

      const receipt = { items: [...basket], total: basketTotal, date: new Date(), txId: tx.id };
      setLastReceipt(receipt);
      setBasket([]);
      toast.success('Sale completed!');

      // AUTO-PRINT IMMEDIATELY
      printReceipt(receipt);

    } catch (e: any) {
      toast.error(e.message || 'Checkout failed');
    } finally {
      setProcessing(false);
    }
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
    <div className="page-container flex flex-col">
      <header className="page-header">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center gap-3">
          <button onClick={() => navigate('/')} className="p-2 rounded-lg hover:bg-secondary transition-colors text-muted-foreground hover:text-foreground">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="p-2 rounded-xl gradient-primary text-white">
            <ShoppingCart className="w-5 h-5" />
          </div>
          <h1 className="text-lg font-bold uppercase tracking-tight">Point of Sale</h1>

          {siteName && (
            <div className="flex items-center gap-1.5 px-3 py-1 bg-secondary text-foreground rounded-lg ml-2 border border-border">
              <Store className="w-3.5 h-3.5 text-primary" />
              <span className="text-[10px] font-semibold uppercase tracking-wider">{siteName}</span>
            </div>
          )}

          <div className="ml-auto flex items-center gap-2">
            {lastReceipt && (
              <Button variant="outline" size="sm" onClick={() => printReceipt(lastReceipt)} className="gap-2 text-[10px] font-semibold rounded-lg border-border uppercase tracking-wider">
                <Printer className="w-3.5 h-3.5" /> Reprint
              </Button>
            )}
          </div>
        </div>
      </header>

      <div className="flex-1 flex flex-col lg:flex-row max-w-7xl mx-auto w-full">
        <div className="flex-1 p-6 space-y-6 overflow-y-auto">
          <Input
            placeholder="SEARCH PRODUCTS..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="bg-card border-2 border-border h-14 rounded-2xl px-6 font-black tracking-widest shadow-sm"
          />

          {categories.filter(cat => filtered.some(p => p.category === cat)).map(cat => (
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
          ))}
        </div>

        <div className="lg:w-[400px] border-t lg:border-t-0 lg:border-l-2 border-border bg-muted/10 flex flex-col backdrop-blur-xl p-6">
          <div className="flex-1 overflow-y-auto space-y-4">
            {basket.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center opacity-20 gap-6">
                <ShoppingCart className="w-16 h-12" />
                <p className="text-[10px] font-black uppercase tracking-[0.4em]">Empty Cart</p>
              </div>
            ) : (
              basket.map(item => (
                <div key={item.product.id} className="flex items-center gap-4 p-4 rounded-[1.5rem] bg-card border-2 border-border shadow-md">
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-black text-foreground truncate uppercase">{item.product.name}</p>
                    <p className="text-[10px] font-black text-primary font-mono mt-1">R{Number(item.product.price).toFixed(2)}</p>
                  </div>
                  <div className="flex flex-col items-center gap-1.5 bg-muted rounded-2xl p-1.5">
                    <button onClick={() => updateQuantity(item.product.id, 1)} className="p-1.5 rounded-xl hover:bg-background text-primary transition-all"><Plus className="w-3.5 h-3.5" /></button>
                    <span className="text-xs font-black font-mono w-6 text-center">{item.quantity}</span>
                    <button onClick={() => updateQuantity(item.product.id, -1)} className="p-1.5 rounded-xl hover:bg-background text-muted-foreground transition-all"><Minus className="w-3.5 h-3.5" /></button>
                  </div>
                  <button onClick={() => removeFromBasket(item.product.id)} className="p-2.5 rounded-2xl hover:bg-red-500/10 text-red-500 transition-colors"><Trash2 className="w-4.5 h-4.5" /></button>
                </div>
              ))
            )}
          </div>

          <div className="p-8 bg-card border-t-2 border-border space-y-6 mt-4 rounded-3xl shadow-2xl">
            <div className="flex justify-between items-center px-2">
              <span className="text-[10px] font-black uppercase tracking-[0.3em] text-muted-foreground">Total</span>
              <p className="text-4xl font-black font-mono text-primary">R{basketTotal.toFixed(2)}</p>
            </div>
            <Button
              onClick={handleCheckout}
              disabled={basket.length === 0 || processing}
              className="w-full font-black py-8 rounded-[2rem] shadow-2xl uppercase tracking-[0.2em] bg-primary text-primary-foreground"
              size="lg"
            >
              {processing ? <Loader2 className="w-6 h-6 animate-spin" /> : "COMPLETE SALE"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Pos;
