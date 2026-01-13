
'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth, useUser } from '@/firebase';
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  updateProfile,
} from 'firebase/auth';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { useFirestore } from '@/firebase';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { Lock } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';

export default function LoginPage() {
  const auth = useAuth();
  const firestore = useFirestore();
  const { user, isUserLoading } = useUser();
  const router = useRouter();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');

  useEffect(() => {
    if (user) {
      router.push('/dashboard');
    }
  }, [user, router]);

  const handleAuthAction = async (action: 'signIn' | 'signUp') => {
    setIsLoading(true);
    try {
      if (action === 'signUp') {
        if (!displayName) {
          throw new Error('Display name is required for sign up.');
        }
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        const newUser = userCredential.user;
        
        // Update Firebase Auth profile
        await updateProfile(newUser, { displayName });

        // Create user profile in Firestore
        const userProfileRef = doc(firestore, 'users', newUser.uid);
        await setDoc(userProfileRef, {
          uid: newUser.uid,
          email: newUser.email,
          displayName: displayName,
          createdAt: serverTimestamp(),
        });

        toast({ title: 'Account created successfully!' });
        // The onAuthStateChanged listener will redirect to dashboard
      } else {
        await signInWithEmailAndPassword(auth, email, password);
        toast({ title: 'Signed in successfully!' });
        // The onAuthStateChanged listener will redirect to dashboard
      }
    } catch (error: any) {
      console.error(`${action} failed:`, error);
      toast({
        variant: 'destructive',
        title: `Authentication Failed`,
        description: error.message || `Could not ${action}.`,
      });
    } finally {
      setIsLoading(false);
    }
  };

  if (isUserLoading || user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <Card className="w-full max-w-sm">
          <CardHeader className="items-center text-center">
            <Skeleton className="mb-4 h-12 w-12 rounded-lg" />
            <Skeleton className="h-6 w-32" />
            <Skeleton className="mt-2 h-4 w-48" />
          </CardHeader>
          <CardContent className="space-y-4">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-4 w-full" />
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center">
            <div className="mx-auto mb-4 inline-block rounded-lg bg-primary p-3 text-primary-foreground">
                <Lock className="h-6 w-6" />
            </div>
            <h1 className="font-headline text-3xl font-bold">Airlock DLP Console</h1>
            <p className="text-muted-foreground">Access your security dashboard</p>
        </div>
        <Tabs defaultValue="sign-in" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="sign-in">Sign In</TabsTrigger>
            <TabsTrigger value="sign-up">Sign Up</TabsTrigger>
          </TabsList>
          <TabsContent value="sign-in">
            <Card>
              <CardHeader>
                <CardTitle>Welcome Back</CardTitle>
                <CardDescription>
                  Enter your credentials to access your account.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="email-signin">Email</Label>
                  <Input id="email-signin" type="email" placeholder="admin@example.com" required value={email} onChange={(e) => setEmail(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password-signin">Password</Label>
                  <Input id="password-signin" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} />
                </div>
                <Button onClick={() => handleAuthAction('signIn')} disabled={isLoading} className="w-full">
                  {isLoading ? 'Signing In...' : 'Sign In'}
                </Button>
              </CardContent>
            </Card>
          </TabsContent>
          <TabsContent value="sign-up">
            <Card>
              <CardHeader>
                <CardTitle>Create an Account</CardTitle>
                <CardDescription>
                  Enter your details to create a new admin account.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="displayName-signup">Display Name</Label>
                  <Input id="displayName-signup" placeholder="Admin Name" required value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email-signup">Email</Label>
                  <Input id="email-signup" type="email" placeholder="admin@example.com" required value={email} onChange={(e) => setEmail(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password-signup">Password</Label>
                  <Input id="password-signup" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} />
                </div>
                <Button onClick={() => handleAuthAction('signUp')} disabled={isLoading} className="w-full">
                  {isLoading ? 'Creating Account...' : 'Sign Up'}
                </Button>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
