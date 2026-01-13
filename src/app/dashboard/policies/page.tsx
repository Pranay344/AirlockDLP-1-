
'use client';

import { useMemo } from 'react';
import { collection, query } from 'firebase/firestore';
import { PoliciesClient } from '@/components/policies/PoliciesClient';
import { useCollection, useFirestore, useUser, useMemoFirebase } from '@/firebase';
import type { PolicyPack } from '@/lib/types';

export default function PoliciesPage() {
  const firestore = useFirestore();
  const { user, isUserLoading } = useUser();

  const policiesQuery = useMemoFirebase(() => {
    if (!user || isUserLoading) return null;
    return query(collection(firestore, 'rules'));
  }, [firestore, user, isUserLoading]);

  const { data: policyPacks, isLoading } = useCollection<PolicyPack>(policiesQuery);

  if (isLoading || isUserLoading) {
    return <div>Loading policies...</div>;
  }

  return <PoliciesClient data={policyPacks || []} />;
}
