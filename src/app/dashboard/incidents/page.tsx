
'use client';

import { useMemo } from 'react';
import { collection, query } from 'firebase/firestore';
import { IncidentsClient } from '@/components/incidents/IncidentsClient';
import { useCollection, useFirestore, useUser, useMemoFirebase } from '@/firebase';
import type { Incident } from '@/lib/types';


export default function IncidentsPage() {
  const firestore = useFirestore();
  const { user, isUserLoading } = useUser();

  const incidentsQuery = useMemoFirebase(() => {
    if (!user || isUserLoading) return null;
    return query(collection(firestore, 'event_logs'));
  }, [firestore, user, isUserLoading]);

  const { data: incidents, isLoading } = useCollection<Incident>(incidentsQuery);

  if (isLoading || isUserLoading) {
    return <div>Loading incidents...</div>;
  }

  return <IncidentsClient data={incidents || []} />;
}
