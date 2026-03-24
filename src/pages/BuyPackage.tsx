import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { toast } from 'sonner';
import { Loader2, Car, Droplets, MapPin, CheckCircle } from 'lucide-react';
import Footer from '@/components/Footer';

interface Site {
  id: string;
  name: string;
  address: string;
  active: boolean;
}

const PACKAGE_TYPES = [
  { id: 'ultimate_exterior', label: 'Ultimate Wash Exterior', description: 'Full exterior wash package' },
  { id: 'ultimate_interior', label: 'Ultimate Wash with Interior', description: 'Full exterior + interior detail' },
];

const DURATION_OPTIONS = [
  { days: 30, label: '1 Month' },
  { days: 60, label: '2 Months' },
  { days: 90, label: '3 Months' },
  { days: 180, label: '6 Months' },
  { days: 365, label: '1 Year' },
];

const BuyPackage = () => {
  const [step, setStep] = useState(1);
  const [sites, setSites] = useState<Site[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [businessName, setBusinessName] = useState('BULLDOG CARWASH');

  // Prices
  const [exteriorPrice, setExteriorPrice] = useState(500);
  const [interiorPrice, setInteriorPrice] = useState(800);

  // Form
  const [siteId, setSiteId] = useState('');
  const [packageType, setPackageType] = useState('ultimate_exterior');
  const [duration, setDuration] = useState(30);
  const [vehicleReg, setVehicleReg] = useState('');
  const [vehicleMake, setVehicleMake] = useState('');
  const [vehicleColour, setVehicleColour] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');

  const monthlyPrice = packageType === 'ultimate_exterior' ? exteriorPrice : interiorPrice;
  const totalPrice = monthlyPrice * (duration / 30);

  useEffect(() => {
    const fetchData = async () => {
      const [sitesRes, settingsRes] = await Promise.all([
        supabase.from('sites').select('*').eq('active', true).order('name'),
        supabase.from('business_settings').select('key, value').in('key', [
          'business_name', 'package_exterior_price', 'package_interior_price'
        ]),
      ]);

      if (sitesRes.data) setSites(sitesRes.data);
      if (settingsRes.data) {
        settingsRes.data.forEach((row: any) => {
          if (row.key === 'business_name') setBusinessName(row.value);
          if (row.key === 'package_exterior_price') setExteriorPrice(Number(row.value) || 500);
          if (row.key === 'package_interior_price') setInteriorPrice(Number(row.value) || 800);
        });
      }
      setLoading(false);
    };
    fetchData();
  }, []);

  const handleSubmitOrder = async () => {
    if (!vehicleReg.trim()) { toast.error('Registration number is required'); return; }
    if (!customerEmail.trim()) { toast.error('Email is required'); return; }
    if (!customerPhone.trim()) { toast.error('Phone number is required'); return; }

    setSubmitting(true);
    try {
      // For now, create order as pending — PayFast integration will handle payment
      const { error } = await supabase.functions.invoke('create-package-order', {
        body: {
          site_id: siteId || null,
          package_type: packageType,
          duration_days: duration,
          amount: totalPrice,
          vehicle_reg: vehicleReg.toUpperCase().trim(),
          vehicle_make: vehicleMake.trim(),
          vehicle_colour: vehicleColour.trim(),
          customer_email: customerEmail.trim(),
          customer_phone: customerPhone.trim(),
        },
      });

      if (error) throw error;
      setStep(4); // Success
      toast.success('Order placed successfully!');
    } catch (err) {
      toast.error('Failed to place order. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-primary/5 to-background flex flex-col">
      <div className="flex-1 max-w-lg mx-auto w-full px-4 py-8">
        {/* Header */}
        <div className="text-center mb-8">
          <Droplets className="w-10 h-10 text-primary mx-auto mb-2" />
          <h1 className="text-2xl font-bold text-foreground">{businessName}</h1>
          <p className="text-muted-foreground text-sm mt-1">Purchase a Wash Package</p>
        </div>

        {/* Progress */}
        <div className="flex items-center justify-center gap-2 mb-8">
          {[1, 2, 3].map((s) => (
            <div key={s} className="flex items-center gap-2">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold transition-all ${
                step >= s ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
              }`}>
                {step > s ? <CheckCircle className="w-4 h-4" /> : s}
              </div>
              {s < 3 && <div className={`w-8 h-0.5 ${step > s ? 'bg-primary' : 'bg-muted'}`} />}
            </div>
          ))}
        </div>

        {/* Step 1: Select Package */}
        {step === 1 && (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold text-foreground">Choose Your Package</h2>


            <div className="space-y-3">
              {PACKAGE_TYPES.map((pkg) => (
                <Card
                  key={pkg.id}
                  className={`cursor-pointer transition-all ${
                    packageType === pkg.id
                      ? 'border-primary ring-2 ring-primary/20'
                      : 'hover:border-primary/50'
                  }`}
                  onClick={() => setPackageType(pkg.id)}
                >
                  <CardContent className="p-4">
                    <div className="flex justify-between items-center">
                      <div>
                        <p className="font-semibold text-foreground">{pkg.label}</p>
                        <p className="text-sm text-muted-foreground">{pkg.description}</p>
                      </div>
                      <p className="text-lg font-bold text-primary">
                        R{pkg.id === 'ultimate_exterior' ? exteriorPrice : interiorPrice}/mo
                      </p>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Duration</label>
              <Select value={String(duration)} onValueChange={(v) => setDuration(Number(v))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {DURATION_OPTIONS.map((d) => (
                    <SelectItem key={d.days} value={String(d.days)}>{d.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <Card className="bg-primary/5 border-primary/20">
              <CardContent className="p-4 text-center">
                <p className="text-sm text-muted-foreground">Total</p>
                <p className="text-3xl font-bold text-primary">R{totalPrice.toFixed(2)}</p>
                <p className="text-xs text-muted-foreground">{duration} days</p>
              </CardContent>
            </Card>

            <Button className="w-full" size="lg" onClick={() => setStep(2)}>
              Continue
            </Button>
          </div>
        )}

        {/* Step 2: Vehicle Details */}
        {step === 2 && (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
              <Car className="w-5 h-5" /> Vehicle Details
            </h2>

            <div className="space-y-3">
              <div>
                <label className="text-sm font-medium text-foreground">Registration Number *</label>
                <Input
                  value={vehicleReg}
                  onChange={(e) => setVehicleReg(e.target.value.toUpperCase())}
                  placeholder="e.g. CA 123-456"
                  className="mt-1"
                />
              </div>
              <div>
                <label className="text-sm font-medium text-foreground">Vehicle Make</label>
                <Input
                  value={vehicleMake}
                  onChange={(e) => setVehicleMake(e.target.value)}
                  placeholder="e.g. Toyota Corolla"
                  className="mt-1"
                />
              </div>
              <div>
                <label className="text-sm font-medium text-foreground">Vehicle Colour</label>
                <Input
                  value={vehicleColour}
                  onChange={(e) => setVehicleColour(e.target.value)}
                  placeholder="e.g. White"
                  className="mt-1"
                />
              </div>
            </div>

            <div className="flex gap-3">
              <Button variant="outline" className="flex-1" onClick={() => setStep(1)}>Back</Button>
              <Button
                className="flex-1"
                onClick={() => {
                  if (!vehicleReg.trim()) { toast.error('Registration is required'); return; }
                  setStep(3);
                }}
              >
                Continue
              </Button>
            </div>
          </div>
        )}

        {/* Step 3: Contact & Confirm */}
        {step === 3 && (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold text-foreground">Your Details & Confirm</h2>

            <div className="space-y-3">
              <div>
                <label className="text-sm font-medium text-foreground">Email Address *</label>
                <Input
                  type="email"
                  value={customerEmail}
                  onChange={(e) => setCustomerEmail(e.target.value)}
                  placeholder="you@email.com"
                  className="mt-1"
                />
              </div>
              <div>
                <label className="text-sm font-medium text-foreground">Phone Number *</label>
                <Input
                  value={customerPhone}
                  onChange={(e) => setCustomerPhone(e.target.value)}
                  placeholder="e.g. 0821234567"
                  className="mt-1"
                />
              </div>
            </div>

            {/* Order Summary */}
            <Card className="bg-muted/50">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Order Summary</CardTitle>
              </CardHeader>
              <CardContent className="space-y-1 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Package</span>
                  <span className="font-medium">{PACKAGE_TYPES.find(p => p.id === packageType)?.label}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Duration</span>
                  <span className="font-medium">{DURATION_OPTIONS.find(d => d.days === duration)?.label}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Vehicle</span>
                  <span className="font-medium">{vehicleReg}</span>
                </div>
                {siteId && sites.find(s => s.id === siteId) && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Site</span>
                    <span className="font-medium">{sites.find(s => s.id === siteId)?.name}</span>
                  </div>
                )}
                <div className="border-t pt-2 mt-2 flex justify-between font-bold text-foreground">
                  <span>Total</span>
                  <span className="text-primary">R{totalPrice.toFixed(2)}</span>
                </div>
              </CardContent>
            </Card>

            <div className="flex gap-3">
              <Button variant="outline" className="flex-1" onClick={() => setStep(2)}>Back</Button>
              <Button className="flex-1" onClick={handleSubmitOrder} disabled={submitting}>
                {submitting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                Place Order
              </Button>
            </div>
          </div>
        )}

        {/* Step 4: Success */}
        {step === 4 && (
          <div className="text-center space-y-4 py-8">
            <CheckCircle className="w-16 h-16 text-primary mx-auto" />
            <h2 className="text-2xl font-bold text-foreground">Order Placed!</h2>
            <p className="text-muted-foreground">
              Your wash package order has been received. Once payment is confirmed, your package will be activated.
            </p>
            <p className="text-sm text-muted-foreground">
              Vehicle: <span className="font-semibold text-foreground">{vehicleReg}</span>
            </p>
            <Button variant="outline" onClick={() => { setStep(1); setVehicleReg(''); setVehicleMake(''); setVehicleColour(''); setCustomerEmail(''); setCustomerPhone(''); }}>
              Buy Another Package
            </Button>
          </div>
        )}
      </div>
      <Footer />
    </div>
  );
};

export default BuyPackage;
