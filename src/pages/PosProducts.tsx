import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { Plus, Pencil, Trash2, ArrowLeft, Loader2, Package } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import Footer from '@/components/Footer';

interface PosProduct {
  id: string;
  name: string;
  description: string;
  price: number;
  category: string;
  active: boolean;
}

const PosProducts = () => {
  const navigate = useNavigate();
  const [products, setProducts] = useState<PosProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<PosProduct | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [price, setPrice] = useState('');
  const [category, setCategory] = useState('General');
  const [saving, setSaving] = useState(false);

  const fetchProducts = async () => {
    const { data, error } = await supabase
      .from('pos_products')
      .select('*')
      .order('category')
      .order('name');
    if (error) {
      toast.error('Failed to load products');
    } else {
      setProducts((data as any[]) || []);
    }
    setLoading(false);
  };

  useEffect(() => { fetchProducts(); }, []);

  const openAdd = () => {
    setEditingProduct(null);
    setName('');
    setDescription('');
    setPrice('');
    setCategory('General');
    setDialogOpen(true);
  };

  const openEdit = (p: PosProduct) => {
    setEditingProduct(p);
    setName(p.name);
    setDescription(p.description);
    setPrice(String(p.price));
    setCategory(p.category);
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!name.trim() || !price) return;
    setSaving(true);
    try {
      if (editingProduct) {
        const { error } = await supabase
          .from('pos_products')
          .update({ name: name.trim(), description: description.trim(), price: Number(price), category: category.trim(), updated_at: new Date().toISOString() } as any)
          .eq('id', editingProduct.id);
        if (error) throw error;
        toast.success('Product updated');
      } else {
        const { error } = await supabase
          .from('pos_products')
          .insert({ name: name.trim(), description: description.trim(), price: Number(price), category: category.trim() } as any);
        if (error) throw error;
        toast.success('Product added');
      }
      setDialogOpen(false);
      fetchProducts();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this product?')) return;
    const { error } = await supabase.from('pos_products').delete().eq('id', id);
    if (error) {
      toast.error('Failed to delete');
    } else {
      toast.success('Product deleted');
      fetchProducts();
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
      fetchProducts();
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
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center gap-3">
          <button onClick={() => navigate('/')} className="p-2 rounded-md hover:bg-secondary transition-colors text-muted-foreground hover:text-foreground">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="p-2 rounded-lg bg-primary/10 text-primary">
            <Package className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-foreground">POS Products</h1>
            <p className="text-xs text-muted-foreground">Manage items for sale</p>
          </div>
          <div className="ml-auto">
            <Button onClick={openAdd} size="sm" className="gap-2">
              <Plus className="w-4 h-4" /> Add Product
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-8 space-y-6">
        {products.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground">
            <Package className="w-12 h-12 mx-auto mb-3 opacity-50" />
            <p>No products yet. Add your first product to get started.</p>
          </div>
        ) : (
          categories.map(cat => (
            <div key={cat}>
              <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">{cat}</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {products.filter(p => p.category === cat).map(p => (
                  <Card key={p.id} className={`${!p.active ? 'opacity-50' : ''}`}>
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between">
                        <div className="flex-1 min-w-0">
                          <h3 className="font-semibold text-foreground truncate">{p.name}</h3>
                          {p.description && <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{p.description}</p>}
                          <p className="text-lg font-bold font-mono text-primary mt-2">R{Number(p.price).toFixed(2)}</p>
                        </div>
                        <div className="flex gap-1 ml-2">
                          <button onClick={() => toggleActive(p)} className={`p-1.5 rounded text-xs ${p.active ? 'bg-green-500/20 text-green-400' : 'bg-destructive/20 text-destructive'}`}>
                            {p.active ? 'ON' : 'OFF'}
                          </button>
                          <button onClick={() => openEdit(p)} className="p-1.5 rounded hover:bg-secondary text-muted-foreground">
                            <Pencil className="w-4 h-4" />
                          </button>
                          <button onClick={() => handleDelete(p.id)} className="p-1.5 rounded hover:bg-destructive/20 text-destructive">
                            <Trash2 className="w-4 h-4" />
                          </button>
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

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editingProduct ? 'Edit Product' : 'Add Product'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Name</Label>
              <Input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Coffee" className="bg-secondary" />
            </div>
            <div>
              <Label>Description</Label>
              <Input value={description} onChange={e => setDescription(e.target.value)} placeholder="e.g. Fresh brewed coffee" className="bg-secondary" />
            </div>
            <div>
              <Label>Price (R)</Label>
              <Input type="number" min="0" step="0.01" value={price} onChange={e => setPrice(e.target.value)} placeholder="0.00" className="bg-secondary font-mono" />
            </div>
            <div>
              <Label>Category</Label>
              <Input value={category} onChange={e => setCategory(e.target.value)} placeholder="e.g. Beverages, Snacks" className="bg-secondary" />
            </div>
            <Button onClick={handleSave} disabled={saving || !name.trim() || !price} className="w-full">
              {saving && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
              {editingProduct ? 'Update Product' : 'Add Product'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Footer />
    </div>
  );
};

export default PosProducts;
