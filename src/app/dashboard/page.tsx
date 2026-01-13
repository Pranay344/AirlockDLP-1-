
'use client';

import { useMemo } from 'react';
import { collection, query } from 'firebase/firestore';
import { useCollection, useFirestore, useUser, useMemoFirebase } from '@/firebase';
import type { Incident, EventsByTimeData, LeaksByTypeData, LeaksByDomainData } from '@/lib/types';
import { DashboardClient } from '@/components/dashboard/DashboardClient';
import { ShieldAlert, ShieldCheck, ShieldQuestion, BookCopy } from 'lucide-react';
import { StatCard } from '@/components/common/StatCard';

export default function DashboardPage() {
  const firestore = useFirestore();
  const { user, isUserLoading } = useUser();

  const incidentsQuery = useMemoFirebase(() => {
    if (!user || isUserLoading) return null;
    return query(collection(firestore, 'event_logs'));
  }, [firestore, user, isUserLoading]);

  const { data: incidents, isLoading } = useCollection<Incident>(incidentsQuery);

  const dashboardData = useMemo(() => {
    if (!incidents) {
      return {
        totalEvents: 0,
        totalBlocks: 0,
        totalWarnings: 0,
        totalBypasses: 0,
        eventsByTime: [],
        leaksByType: [],
        leaksByDomain: [],
      };
    }

    const totalEvents = incidents.length;
    const totalBlocks = incidents.filter(inc => inc.action === 'Blocked').length;
    const totalWarnings = incidents.filter(inc => inc.action === 'Warned').length;
    const totalBypasses = incidents.filter(inc => inc.action === 'Allowed').length; 

    const eventsByTime = incidents.reduce<Record<string, { date: string; Blocked: number; Warned: number; Allowed: number }>>((acc, inc) => {
      const date = new Date(inc.timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      if (!acc[date]) {
        acc[date] = { date, Blocked: 0, Warned: 0, Allowed: 0 };
      }
      if (inc.action === 'Blocked' || inc.action === 'Warned' || inc.action === 'Allowed') {
        acc[date][inc.action]++;
      }
      return acc;
    }, {});

    const leaksByType = incidents.flatMap(inc => inc.types).reduce<Record<string, { type: string, count: number }>>((acc, type) => {
      if (!acc[type]) {
        acc[type] = { type, count: 0 };
      }
      acc[type].count++;
      return acc;
    }, {});

    const leaksByDomain = incidents.reduce<Record<string, number>>((acc, inc) => {
      acc[inc.domain] = (acc[inc.domain] || 0) + 1;
      return acc;
    }, {});

    return {
      totalEvents,
      totalBlocks,
      totalWarnings,
      totalBypasses,
      eventsByTime: Object.values(eventsByTime).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()),
      leaksByType: Object.values(leaksByType).sort((a, b) => b.count - a.count),
      leaksByDomain: Object.entries(leaksByDomain).map(([domain, count]) => ({ domain, count })).sort((a, b) => b.count - a.count).slice(0, 5),
    };
  }, [incidents]);

  if (isLoading || isUserLoading) {
    return (
        <div className="grid gap-4 md:gap-8">
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                <StatCard title="Total Events" value="..." icon={<BookCopy />} description="Loading..." />
                <StatCard title="Blocks" value="..." icon={<ShieldAlert />} description="Loading..." />
                <StatCard title="Warnings" value="..." icon={<ShieldQuestion />} description="Loading..." />
                <StatCard title="Bypasses" value="..." icon={<ShieldCheck />} description="Loading..." />
            </div>
        </div>
    )
  }

  return <DashboardClient {...dashboardData} />;
}
