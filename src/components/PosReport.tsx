import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { format, getDaysInMonth } from 'date-fns';
import { Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';

interface PosTransaction {
  id: string;
  total: number;
  items_count: number;
  created_at: string;
  created_by: string | null;
}

interface PosTransactionItem {
  id: string;
  transaction_id: string;
  product_name: string;
  product_description: string;
  quantity: number;
  unit_price: number;
  line_total: number;
}

interface TransactionWithItems extends PosTransaction {
  items: PosTransactionItem[];
}

const PosReport = () => {
  const [posTab, setPosTab] = useState('daily');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const [dailyTxns, setDailyTxns] = useState<TransactionWithItems[]>([]);
  const [monthlyTxns, setMonthlyTxns] = useState<TransactionWithItems[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchTransactions = async (start: string, end: string): Promise<TransactionWithItems[]> => {
    const { data: txns } = await supabase
      .from('pos_transactions')
      .select('*')
      .gte('created_at', start)
      .lte('created_at', end)
      .order('created_at', { ascending: false });

    if (!txns || txns.length === 0) return [];

    const txnIds = txns.map(t => t.id);
    const { data: items } = await supabase
      .from('pos_transaction_items')
      .select('*')
      .in('transaction_id', txnIds);

    return txns.map(t => ({
      ...t,
      items: (items || []).filter(i => i.transaction_id === t.id),
    }));
  };

  const fetchDaily = async (dateStr: string) => {
    setLoading(true);
    const result = await fetchTransactions(`${dateStr}T00:00:00.000Z`, `${dateStr}T23:59:59.999Z`);
    setDailyTxns(result);
    setLoading(false);
  };

  const fetchMonthly = async (monthStr: string) => {
    setLoading(true);
    const [year, mon] = monthStr.split('-').map(Number);
    const lastDay = getDaysInMonth(new Date(year, mon - 1));
    const result = await fetchTransactions(
      `${monthStr}-01T00:00:00.000Z`,
      `${monthStr}-${String(lastDay).padStart(2, '0')}T23:59:59.999Z`
    );
    setMonthlyTxns(result);
    setLoading(false);
  };

  useEffect(() => { fetchDaily(date); }, [date]);
  useEffect(() => { fetchMonthly(month); }, [month]);

  const productBreakdown = (txns: TransactionWithItems[]) => {
    const map: Record<string, { name: string; qty: number; revenue: number }> = {};
    txns.forEach(t => t.items.forEach(i => {
      if (!map[i.product_name]) map[i.product_name] = { name: i.product_name, qty: 0, revenue: 0 };
      map[i.product_name].qty += i.quantity;
      map[i.product_name].revenue += Number(i.line_total);
    }));
    return Object.values(map).sort((a, b) => b.revenue - a.revenue);
  };

  const dailyBreakdown = useMemo(() => {
    const grouped: Record<string, { count: number; revenue: number; items: number }> = {};
    monthlyTxns.forEach(t => {
      const day = format(new Date(t.created_at), 'yyyy-MM-dd');
      if (!grouped[day]) grouped[day] = { count: 0, revenue: 0, items: 0 };
      grouped[day].count++;
      grouped[day].revenue += Number(t.total);
      grouped[day].items += t.items_count;
    });
    return Object.entries(grouped).sort(([a], [b]) => a.localeCompare(b));
  }, [monthlyTxns]);

  const exportPosCSV = (txns: TransactionWithItems[], filename: string) => {
    const header = 'Transaction ID,Date,Product,Description,Qty,Unit Price,Line Total,Transaction Total\n';
    const rows = txns.flatMap(t =>
      t.items.map(i =>
        `${t.id},${format(new Date(t.created_at), 'dd/MM/yyyy HH:mm')},${i.product_name},"${i.product_description}",${i.quantity},${Number(i.unit_price).toFixed(2)},${Number(i.line_total).toFixed(2)},${Number(t.total).toFixed(2)}`
      )
    ).join('\n');
    const blob = new Blob([header + rows], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
  };

  const SummaryRow = ({ txns }: { txns: TransactionWithItems[] }) => {
    const totalRevenue = txns.reduce((s, t) => s + Number(t.total), 0);
    const totalItems = txns.reduce((s, t) => s + t.items_count, 0);
    return (
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <div className="rounded-lg border border-border bg-card p-5">
          <p className="text-xs text-muted-foreground uppercase tracking-wider">Transactions</p>
          <p className="text-3xl font-bold font-mono text-foreground mt-1">{txns.length}</p>
        </div>
        <div className="rounded-lg border border-border bg-card p-5">
          <p className="text-xs text-muted-foreground uppercase tracking-wider">Items Sold</p>
          <p className="text-3xl font-bold font-mono text-foreground mt-1">{totalItems}</p>
        </div>
        <div className="rounded-lg border border-border bg-card p-5">
          <p className="text-xs text-muted-foreground uppercase tracking-wider">Total Revenue</p>
          <p className="text-3xl font-bold font-mono text-primary mt-1">R{totalRevenue.toFixed(2)}</p>
        </div>
      </div>
    );
  };

  const ProductTable = ({ txns }: { txns: TransactionWithItems[] }) => {
    const products = productBreakdown(txns);
    return (
      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Product Breakdown</h2>
        <div className="rounded-lg border border-border bg-card overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-muted-foreground text-left">
                <th className="px-4 py-3 font-medium">Product</th>
                <th className="px-4 py-3 font-medium">Qty Sold</th>
                <th className="px-4 py-3 font-medium">Revenue</th>
              </tr>
            </thead>
            <tbody>
              {products.map(p => (
                <tr key={p.name} className="border-b border-border/50 hover:bg-secondary/30 transition-colors">
                  <td className="px-4 py-3 font-semibold text-foreground">{p.name}</td>
                  <td className="px-4 py-3 font-mono">{p.qty}</td>
                  <td className="px-4 py-3 font-mono text-primary font-bold">R{p.revenue.toFixed(2)}</td>
                </tr>
              ))}
              {products.length === 0 && (
                <tr><td colSpan={3} className="px-4 py-8 text-center text-muted-foreground">No sales data</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    );
  };

  const TransactionsTable = ({ txns, showDate }: { txns: TransactionWithItems[]; showDate?: boolean }) => (
    <section className="space-y-3">
      <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">All Transactions ({txns.length})</h2>
      <div className="rounded-lg border border-border bg-card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-muted-foreground text-left">
              <th className="px-4 py-3 font-medium">Time</th>
              <th className="px-4 py-3 font-medium">Items</th>
              <th className="px-4 py-3 font-medium">Products</th>
              <th className="px-4 py-3 font-medium">Total</th>
            </tr>
          </thead>
          <tbody>
            {txns.map(t => (
              <tr key={t.id} className="border-b border-border/50 hover:bg-secondary/30 transition-colors">
                <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                  {format(new Date(t.created_at), showDate ? 'dd/MM HH:mm' : 'HH:mm')}
                </td>
                <td className="px-4 py-3 font-mono">{t.items_count}</td>
                <td className="px-4 py-3 text-xs text-muted-foreground">
                  {t.items.map(i => `${i.product_name} x${i.quantity}`).join(', ')}
                </td>
                <td className="px-4 py-3 font-mono text-primary font-bold">R{Number(t.total).toFixed(2)}</td>
              </tr>
            ))}
            {txns.length === 0 && (
              <tr><td colSpan={4} className="px-4 py-8 text-center text-muted-foreground">{loading ? 'Loading…' : 'No transactions'}</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );

  return (
    <Tabs value={posTab} onValueChange={setPosTab}>
      <TabsList className="grid w-full max-w-xs grid-cols-2">
        <TabsTrigger value="daily">Daily</TabsTrigger>
        <TabsTrigger value="monthly">Monthly</TabsTrigger>
      </TabsList>

      <TabsContent value="daily" className="space-y-6 mt-6">
        <div className="flex items-center gap-4 flex-wrap">
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Report Date</label>
            <Input type="date" value={date} onChange={e => setDate(e.target.value)} className="bg-secondary border-border w-48" />
          </div>
          <Button variant="outline" onClick={() => exportPosCSV(dailyTxns, `pos-report-${date}.csv`)} disabled={dailyTxns.length === 0} className="gap-2 mt-5">
            <Download className="w-4 h-4" /> Export CSV
          </Button>
        </div>
        <SummaryRow txns={dailyTxns} />
        <ProductTable txns={dailyTxns} />
        <TransactionsTable txns={dailyTxns} />
      </TabsContent>

      <TabsContent value="monthly" className="space-y-6 mt-6">
        <div className="flex items-center gap-4 flex-wrap">
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Report Month</label>
            <Input type="month" value={month} onChange={e => setMonth(e.target.value)} className="bg-secondary border-border w-48" />
          </div>
          <Button variant="outline" onClick={() => exportPosCSV(monthlyTxns, `pos-report-${month}.csv`)} disabled={monthlyTxns.length === 0} className="gap-2 mt-5">
            <Download className="w-4 h-4" /> Export CSV
          </Button>
        </div>
        <SummaryRow txns={monthlyTxns} />
        <ProductTable txns={monthlyTxns} />

        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Daily Breakdown</h2>
          <div className="rounded-lg border border-border bg-card overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-muted-foreground text-left">
                  <th className="px-4 py-3 font-medium">Date</th>
                  <th className="px-4 py-3 font-medium">Transactions</th>
                  <th className="px-4 py-3 font-medium">Items</th>
                  <th className="px-4 py-3 font-medium">Revenue</th>
                </tr>
              </thead>
              <tbody>
                {dailyBreakdown.map(([day, stats]) => (
                  <tr key={day} className="border-b border-border/50 hover:bg-secondary/30 transition-colors">
                    <td className="px-4 py-3 font-mono">{format(new Date(day), 'dd MMM yyyy')}</td>
                    <td className="px-4 py-3 font-mono">{stats.count}</td>
                    <td className="px-4 py-3 font-mono">{stats.items}</td>
                    <td className="px-4 py-3 font-mono text-primary font-bold">R{stats.revenue.toFixed(2)}</td>
                  </tr>
                ))}
                {dailyBreakdown.length === 0 && (
                  <tr><td colSpan={4} className="px-4 py-8 text-center text-muted-foreground">No data for this month</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        <TransactionsTable txns={monthlyTxns} showDate />
      </TabsContent>
    </Tabs>
  );
};

export default PosReport;
