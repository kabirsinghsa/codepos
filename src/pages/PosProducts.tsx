import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { Plus, Pencil, Trash2, ArrowLeft, Loader2, Package, ImagePlus, X, Box, Warehouse } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import Footer from '@/components/Footer';

interface PosProduct {
  id: string;
  name: string;
  description: string;
  price: number;
  category: string;
  active: boolean;
  image_url: string;
}

interface InventoryRecord {
  site_id: string;
  site_name: string;
  quantity: number;
}

const PosProducts = () => {
  const navigate = useNavigate();
  const [products, setProducts] = useState<PosProduct[]>([]);
  const [sites, setSites] = useState<{id: string, name: string}[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [stockDialogOpen, setStockDialogOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<PosProduct | null>(null);
  const [selectedProduct, setSelectedProduct] = useState<PosProduct | null>(null);
  const [inventory, setInventory] = useState<InventoryRecord[]>([]);

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [price, setPrice] = useState('');
  const [category, setCategory] = useState('General');
  const [saving, setSaving] = useState(false);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState('');
  const [uploadingImage, setUploadingImage] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchData = async () => {
    const [productsRes, sitesRes] = await Promise.all([
      supabase.from('pos_products').select('*').order('category').order('name'),
      supabase.from('sites').select('id, name').eq('active', true).order('name')
    ]);

    if (productsRes.data) setProducts(productsRes.data as any[]);
    if (sitesRes.data) setSites(sitesRes.data as any[]);
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, []);

  const fetchStock = async (product: PosProduct) => {
    setSelectedProduct(product);
    const { data: invData } = await (supabase as any)
      .from('pos_inventory')
      .select('site_id, quantity')
      .eq('product_id', product.id) as { data: { site_id: string; quantity: number }[] | null };

    const mappedInv = sites.map(s => {
      const existing = invData?.find(i => i.site_id === s.id);
      return {
        site_id: s.id,
        site_name: s.name,
        quantity: existing?.quantity || 0
      };
    });

    setInventory(mappedInv);
    setStockDialogOpen(true);
  };

  const handleUpdateStock = (siteId: string, value: string) => {
    const qty = parseInt(value) || 0;
    setInventory(prev => prev.map(i => i.site_id === siteId ? { ...i, quantity: qty } : i));
  };

  const saveStock = async () => {
    if (!selectedProduct) return;
    setSaving(true);
    try {
      const upserts = inventory.map(i => ({
        product_id: selectedProduct.id,
        site_id: i.site_id,
        quantity: i.quantity,
        updated_at: new Date().toISOString()
      }));

      const { error } = await supabase.from('pos_inventory').upsert(upserts, { onConflict: 'product_id,site_id' });
      if (error) throw error;
      toast.success('Inventory updated');
      setStockDialogOpen(false);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  const openAdd = () => {
    setEditingProduct(null);
    setName('');
    setDescription('');
    setPrice('');
    setCategory('General');
    setImageFile(null);
    setImagePreview('');
    setDialogOpen(true);
  };

  const openEdit = (p: PosProduct) => {
    setEditingProduct(p);
    setName(p.name);
    setDescription(p.description);
    setPrice(String(p.price));
    setCategory(p.category);
    setImageFile(null);
    setImagePreview(p.image_url || '');
    setDialogOpen(true);
  };

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      toast.error('Image must be under 5MB');
      return;
    }
    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
  };

  const uploadImage = async (file: File): Promise<string> => {
    const ext = file.name.split('.').pop();
    const fileName = `pos/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
    const { error } = await supabase.storage.from('pos-products').upload(fileName, file);
    if (error) throw error;
    const { data } = supabase.storage.from('pos-products').getPublicUrl(fileName);
    return data.publicUrl;
  };

  const handleSave = async () => {
    if (!name.trim() || !price) return;
    setSaving(true);
    try {
      let imageUrl = editingProduct?.image_url || '';

      if (imageFile) {
        setUploadingImage(true);
        imageUrl = await uploadImage(imageFile);
        setUploadingImage(false);
      }

      const productData = {
        name: name.trim(),
        description: description.trim(),
        price: Number(price),
        category: category.trim(),
        image_url: imageUrl,
        updated_at: new Date().toISOString()
      };

      if (editingProduct) {
        const { error } = await supabase
          .from('pos_products')
          .update(productData as any)
          .eq('id', editingProduct.id);
        if (error) throw error;
        toast.success('Product updated');
      } else {
        const { error } = await supabase
          .from('pos_products')
          .insert(productData as any);
        if (error) throw error;
        toast.success('Product added');
      }
      setDialogOpen(false);
      fetchData();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
      setUploadingImage(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this product?')) return;
    const { error } = await supabase.from('pos_products').delete().eq('id', id);
    if (error) {
      toast.error('Failed to delete');
    } else {
      toast.success('Product deleted');
      fetchData();
    }
  };

  const toggleActive = async (p: PosProduct) => {
    const { error } = await supabase
      .from('pos_products')
      .update({ active: !p.active } as any)
      .eq('id', p.id);
    if (error) {
      toast.error('Failed to update');
    } else {
      fetchData();
    }
  };

  const categories = [...new Set(products.map(p => p.category))];

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center gap-3">
          <button onClick={() => navigate('/')} className="p-2 rounded-md hover:bg-secondary transition-colors text-muted-foreground hover:text-foreground">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="p-2 rounded-lg bg-primary/10 text-primary">
            <Package className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-foreground uppercase tracking-tight">Product Inventory</h1>
            <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-widest">Global Product Catalog & Stock Control</p>
          </div>
          <div className="ml-auto">
            <Button onClick={openAdd} size="sm" className="gap-2 font-bold uppercase text-[10px] tracking-widest">
              <Plus className="w-4 h-4" /> Add New Item
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-8 space-y-8">
        {products.length === 0 ? (
          <div className="text-center py-20 bg-muted/20 rounded-3xl border-2 border-dashed border-border">
            <Package className="w-12 h-12 mx-auto mb-4 opacity-20 text-foreground" />
            <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest">No products in catalog</p>
          </div>
        ) : (
          categories.map(cat => (
            <div key={cat} className="space-y-4">
              <h2 className="text-xs font-black text-muted-foreground uppercase tracking-[0.2em] px-1 border-l-4 border-primary ml-1">{cat}</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {products.filter(p => p.category === cat).map(p => (
                  <Card key={p.id} className={`overflow-hidden rounded-2xl border-2 transition-all group ${!p.active ? 'opacity-50 grayscale' : 'hover:border-primary/30 shadow-sm'}`}>
                    <div className="relative aspect-[16/10] overflow-hidden bg-muted">
                      {p.image_url ? (
                        <img src={p.image_url} alt={p.name} className="w-full h-full object-cover transition-transform group-hover:scale-105" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center bg-secondary/50">
                          <Package className="w-10 h-10 text-muted-foreground/20" />
                        </div>
                      )}
                      <div className="absolute top-3 right-3 flex gap-1">
                        <button
                          onClick={() => fetchStock(p)}
                          className="p-2 bg-black/60 backdrop-blur-md text-white rounded-xl hover:bg-primary transition-colors shadow-lg"
                          title="Manage Stock"
                        >
                          <Box className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                    <CardContent className="p-5">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <h3 className="font-bold text-sm text-foreground uppercase tracking-tight truncate">{p.name}</h3>
                          <p className="text-xl font-black font-mono text-primary mt-1">R{Number(p.price).toFixed(2)}</p>
                        </div>
                        <div className="flex flex-col gap-2">
                          <div className="flex gap-1">
                            <button onClick={() => toggleActive(p)} className={`p-2 rounded-xl text-[10px] font-black uppercase tracking-tighter ${p.active ? 'bg-green-500/10 text-green-500' : 'bg-destructive/10 text-destructive'}`}>
                              {p.active ? 'Live' : 'Hidden'}
                            </button>
                            <button onClick={() => openEdit(p)} className="p-2 bg-secondary rounded-xl text-muted-foreground hover:text-foreground">
                              <Pencil className="w-4 h-4" />
                            </button>
                            <button onClick={() => handleDelete(p.id)} className="p-2 bg-destructive/5 rounded-xl text-destructive hover:bg-destructive/10">
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          ))
        )}
      </main>

      {/* STOCK CONTROL DIALOG */}
      <Dialog open={stockDialogOpen} onOpenChange={setStockDialogOpen}>
        <DialogContent className="sm:max-w-md rounded-3xl border-2">
          <DialogHeader className="items-center pb-4 border-b">
            <div className="p-3 bg-primary/10 rounded-2xl mb-2"><Box className="w-6 h-6 text-primary" /></div>
            <DialogTitle className="font-black uppercase tracking-widest text-lg">Stock Control</DialogTitle>
            <p className="text-xs font-bold text-muted-foreground uppercase">{selectedProduct?.name}</p>
          </DialogHeader>
          <div className="py-6 space-y-6">
            {inventory.map(site => (
              <div key={site.site_id} className="flex items-center justify-between p-4 bg-muted/30 rounded-2xl border border-border">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-background rounded-lg border shadow-sm"><Warehouse className="w-4 h-4 text-muted-foreground" /></div>
                  <span className="text-xs font-black uppercase tracking-tight">{site.site_name}</span>
                </div>
                <div className="flex items-center gap-3">
                  <Label className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Qty:</Label>
                  <Input
                    type="number"
                    value={site.quantity}
                    onChange={e => handleUpdateStock(site.site_id, e.target.value)}
                    className="w-20 h-10 font-black text-center bg-background border-primary/20 rounded-xl"
                  />
                </div>
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button onClick={saveStock} disabled={saving} className="w-full font-black uppercase tracking-widest py-6 rounded-2xl shadow-xl">
              {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Update Site Inventory
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md rounded-3xl border-2">
          <DialogHeader>
            <DialogTitle className="font-black uppercase tracking-widest">{editingProduct ? 'Edit Catalog Item' : 'New Catalog Item'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-5 py-4">
            <div>
              <Label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground ml-1">Visualization</Label>
              <div className="mt-1.5">
                {imagePreview ? (
                  <div className="relative rounded-2xl overflow-hidden bg-muted aspect-video border-2 border-border shadow-inner">
                    <img src={imagePreview} alt="Preview" className="w-full h-full object-cover" />
                    <button
                      onClick={() => { setImageFile(null); setImagePreview(''); }}
                      className="absolute top-2 right-2 p-1.5 rounded-full bg-black/60 text-white hover:bg-primary transition-colors"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="w-full aspect-video rounded-2xl border-2 border-dashed border-border hover:border-primary/50 bg-secondary/30 flex flex-col items-center justify-center gap-2 transition-all hover:scale-[0.99] group"
                  >
                    <ImagePlus className="w-8 h-8 text-muted-foreground group-hover:text-primary transition-colors" />
                    <span className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">Attach Image</span>
                  </button>
                )}
                <input ref={fileInputRef} type="file" accept="image/*" onChange={handleImageSelect} className="hidden" />
              </div>
            </div>
            <div className="grid grid-cols-1 gap-4">
              <div className="space-y-1.5">
                <Label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground ml-1">Product Name</Label>
                <Input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. 500ml Bottled Water" className="bg-secondary/50 font-bold rounded-xl" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground ml-1">Category</Label>
                <Input value={category} onChange={e => setCategory(e.target.value)} placeholder="e.g. Beverages" className="bg-secondary/50 font-bold rounded-xl" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground ml-1">Selling Price (ZAR)</Label>
                <Input type="number" min="0" step="0.01" value={price} onChange={e => setPrice(e.target.value)} placeholder="0.00" className="bg-secondary/50 font-black font-mono rounded-xl" />
              </div>
            </div>
            <Button onClick={handleSave} disabled={saving || !name.trim() || !price} className="w-full font-black uppercase tracking-widest py-6 rounded-2xl shadow-xl mt-2">
              {(saving || uploadingImage) && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
              {uploadingImage ? 'Processing Upload...' : editingProduct ? 'Save Changes' : 'Confirm & Add'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Footer />
    </div>
  );
};

export default PosProducts;
