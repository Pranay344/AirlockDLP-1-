
'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { useAuth, useFirestore } from '@/firebase';
import { seedDatabase } from '@/lib/seed';

export default function SettingsPage() {
  const [isSeeding, setIsSeeding] = useState(false);
  const { toast } = useToast();
  const firestore = useFirestore();
  const auth = useAuth();

  const handleSeed = async () => {
    if (!auth.currentUser) {
      toast({
        variant: 'destructive',
        title: 'Authentication Error',
        description: 'You must be signed in to seed the database.',
      });
      return;
    }

    setIsSeeding(true);
    try {
      await seedDatabase(firestore);
      toast({
        title: 'Database Seeded',
        description: 'Your Firestore database has been populated with initial data.',
      });
    } catch (error: any) {
      console.error('Seeding failed:', error);
      toast({
        variant: 'destructive',
        title: 'Seeding Failed',
        description: error.message || 'An unknown error occurred.',
      });
    } finally {
      setIsSeeding(false);
    }
  };

  return (
    <div className="grid gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Database Management</CardTitle>
          <CardDescription>
            Use this section to manage your application's data.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4">
            <p className="text-sm text-muted-foreground">
              Populate your Firestore database with the initial set of sample
              incidents and policy packs. This is a one-time operation.
            </p>
            <Button onClick={handleSeed} disabled={isSeeding}>
              {isSeeding ? 'Seeding...' : 'Seed Database'}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
