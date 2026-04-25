import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../AuthContext';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '../components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { toast } from 'sonner';
import { Mail, Lock, Globe, Zap, ShieldCheck, BarChart3, AlertTriangle, ExternalLink } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '../components/ui/alert';
import { GlobalLoader } from '../components/GlobalLoader';

export const LandingPage: React.FC = () => {
  const navigate = useNavigate();
  const { user, profile, loading, signInWithGoogle, login, signUp, organisation } = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
 
  React.useEffect(() => {
    // Aggressive "Smart Redirect": If we have a user, we shouldn't be on the landing page
    if (user && !loading) {
      if (organisation) {
        navigate(`/dashboard/${organisation.id}`, { replace: true });
      } else {
        // Fallback to org selection/creation if no active org found yet
        navigate('/organisation', { replace: true });
      }
      return;
    }

    // Check localStorage for early redirect intent to show a better UI
    const isAuthenticated = localStorage.getItem('isAuthenticated') === 'true';
    if (isAuthenticated && loading) {
      console.log("Cached auth found, waiting for Firebase...");
    }
  }, [user, profile, organisation, loading, navigate]);

  const handleGoogleAuth = async () => {
    setIsLoading(true);
    try {
      await signInWithGoogle();
      toast.success('Welcome to FieldPay!');
      // Redirection handled by useEffect
    } catch (error: any) {
      console.error('Google Auth error:', error);
      toast.error(error.message || 'Google authentication failed');
    } finally {
      setIsLoading(false);
    }
  };

  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      await login(email, password);
      toast.success('Welcome back!');
      // Redirection handled by useEffect
    } catch (error: any) {
      console.error('Login error:', error);
      if (error.code === 'auth/operation-not-allowed') {
        toast.error('Email/Password login is disabled. Please use Google or enable it in Firebase.');
      } else {
        toast.error(error.message || 'Login failed');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleEmailSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      await signUp(email, password);
      toast.success('Account created successfully!');
      // Redirection handled by useEffect
    } catch (error: any) {
      console.error('Signup error:', error);
      if (error.code === 'auth/operation-not-allowed') {
        toast.error('Email/Password signup is disabled. Please use Google or enable it in Firebase.');
      } else {
        toast.error(error.message || 'Signup failed');
      }
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading || (loading && localStorage.getItem('isAuthenticated') === 'true')) {
    return <GlobalLoader />;
  }

  return (
    <div className="min-h-screen bg-[var(--color-background)] flex flex-col lg:flex-row items-center justify-center p-6 lg:p-12 gap-12 max-w-7xl mx-auto w-full">
      <div className="flex-1 space-y-8 text-center lg:text-left">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[var(--color-primary)]/10 text-[var(--color-primary)] text-xs font-bold uppercase tracking-widest border border-[var(--color-primary)]/20">
          <Zap className="w-3 h-3" /> The Future of Workforce Management
        </div>
        <h1 className="text-5xl lg:text-7xl font-black tracking-tighter text-[var(--color-primary)] leading-[0.9]">
          FIELDPAY<span className="text-[var(--color-secondary)]">.</span>
        </h1>
        <p className="text-xl text-[var(--color-muted-foreground)] max-w-xl leading-relaxed">
          The all-in-one platform for agricultural payroll, job card tracking, and workforce verification. Built for the modern farm.
        </p>
        
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-lg">
          <div className="flex items-start gap-3 p-4 rounded-2xl bg-white border border-[var(--color-border)] shadow-sm">
            <ShieldCheck className="w-6 h-6 text-[var(--color-secondary)] shrink-0" />
            <div>
              <h3 className="font-bold text-sm">Verified Compliance</h3>
              <p className="text-xs text-[var(--color-muted-foreground)]">QA-ready employee onboarding and document tracking.</p>
            </div>
          </div>
          <div className="flex items-start gap-3 p-4 rounded-2xl bg-white border border-[var(--color-border)] shadow-sm">
            <BarChart3 className="w-6 h-6 text-[var(--color-secondary)] shrink-0" />
            <div>
              <h3 className="font-bold text-sm">Real-time Analytics</h3>
              <p className="text-xs text-[var(--color-muted-foreground)]">Track productivity and labor costs as they happen.</p>
            </div>
          </div>
        </div>
      </div>

      <div className="w-full max-w-md">
        <Card className="border-[var(--color-border)] shadow-2xl shadow-[var(--color-primary)]/10 rounded-[2rem] overflow-hidden">
          <CardHeader className="space-y-1 bg-[var(--color-primary)] text-white p-8">
            <CardTitle className="text-2xl font-bold">Get Started</CardTitle>
            <CardDescription className="text-white/70">Sign in to manage your workforce</CardDescription>
          </CardHeader>
          <CardContent className="p-8 space-y-6">
            <Tabs defaultValue="google" className="w-full">
              <TabsList className="grid w-full grid-cols-2 mb-6">
                <TabsTrigger value="google">Google</TabsTrigger>
                <TabsTrigger value="email">Email</TabsTrigger>
              </TabsList>
              
              <TabsContent value="google" className="space-y-4">
                <Button 
                  variant="outline" 
                  className="w-full py-6 rounded-xl border-2 hover:bg-gray-50 flex items-center justify-center gap-3 font-bold"
                  onClick={handleGoogleAuth}
                  disabled={isLoading}
                >
                  <Globe className="w-5 h-5" />
                  {isLoading ? 'Connecting...' : 'Continue with Google'}
                </Button>
                <p className="text-[10px] text-center text-[var(--color-muted-foreground)] px-4">
                  New users will automatically have a trial organisation created.
                </p>
              </TabsContent>

              <TabsContent value="email">
                <Tabs defaultValue="login" className="w-full">
                  <TabsList className="grid w-full grid-cols-2 mb-4 bg-gray-100 p-1 rounded-lg">
                    <TabsTrigger value="login" className="text-xs">Login</TabsTrigger>
                    <TabsTrigger value="signup" className="text-xs">Sign Up</TabsTrigger>
                  </TabsList>
                  
                  <TabsContent value="login">
                    <form onSubmit={handleEmailLogin} className="space-y-4">
                      <div className="space-y-2">
                        <div className="relative">
                          <Mail className="absolute left-3 top-3 w-4 h-4 text-gray-400" />
                          <Input 
                            type="email" 
                            placeholder="Email Address" 
                            className="pl-10 rounded-xl"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            required
                          />
                        </div>
                      </div>
                      <div className="space-y-2">
                        <div className="relative">
                          <Lock className="absolute left-3 top-3 w-4 h-4 text-gray-400" />
                          <Input 
                            type="password" 
                            placeholder="Password" 
                            className="pl-10 rounded-xl"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            required
                          />
                        </div>
                      </div>
                      <Button type="submit" className="w-full py-6 rounded-xl font-bold" disabled={isLoading}>
                        {isLoading ? 'Logging in...' : 'Login'}
                      </Button>
                    </form>
                  </TabsContent>

                  <TabsContent value="signup">
                    <form onSubmit={handleEmailSignUp} className="space-y-4">
                      <div className="space-y-2">
                        <div className="relative">
                          <Mail className="absolute left-3 top-3 w-4 h-4 text-gray-400" />
                          <Input 
                            type="email" 
                            placeholder="Email Address" 
                            className="pl-10 rounded-xl"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            required
                          />
                        </div>
                      </div>
                      <div className="space-y-2">
                        <div className="relative">
                          <Lock className="absolute left-3 top-3 w-4 h-4 text-gray-400" />
                          <Input 
                            type="password" 
                            placeholder="Password" 
                            className="pl-10 rounded-xl"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            required
                          />
                        </div>
                      </div>
                      <Button type="submit" className="w-full py-6 rounded-xl font-bold" disabled={isLoading}>
                        {isLoading ? 'Creating Account...' : 'Sign Up'}
                      </Button>
                    </form>
                  </TabsContent>
                </Tabs>
                <p className="mt-4 text-[10px] text-center text-orange-600 font-medium">
                  Note: Email/Password must be enabled in Firebase Console.
                </p>
              </TabsContent>
            </Tabs>
          </CardContent>
          <CardFooter className="bg-gray-50 border-t p-6 justify-center">
            <p className="text-[10px] text-gray-400 uppercase tracking-widest font-bold">Secure Enterprise Access</p>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
};
