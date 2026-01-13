
"use client"

import { useMemo } from "react"
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  Cell
} from "recharts"
import {
  ShieldAlert,
  ShieldCheck,
  ShieldQuestion,
  BookCopy,
} from "lucide-react"

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  ChartContainer,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart"

import { StatCard } from "@/components/common/StatCard"

import type { EventsByTimeData, LeaksByDomainData, LeaksByTypeData } from "@/lib/types"

type DashboardClientProps = {
  totalEvents: number;
  totalBlocks: number;
  totalWarnings: number;
  totalBypasses: number;
  eventsByTime: EventsByTimeData[];
  leaksByType: LeaksByTypeData[];
  leaksByDomain: LeaksByDomainData[];
};

// Helper function to create a sanitized key for CSS variables
const sanitizeKey = (key: string) => key.replace(/[^a-zA-Z0-9]/g, '');

export function DashboardClient({
  totalEvents,
  totalBlocks,
  totalWarnings,
  totalBypasses,
  eventsByTime,
  leaksByType,
  leaksByDomain,
}: DashboardClientProps) {

  const leaksByTypeChartConfig = useMemo(() => {
    const chartColors = ['hsl(var(--chart-1))', 'hsl(var(--chart-2))', 'hsl(var(--chart-3))', 'hsl(var(--chart-4))', 'hsl(var(--chart-5))'];
    const config: ChartConfig = {};
    leaksByType.forEach((leak, i) => {
      const key = sanitizeKey(leak.type);
      config[key] = {
        label: leak.type,
        color: chartColors[i % chartColors.length],
      };
    });
    return config;
  }, [leaksByType]);

  return (
    <div className="grid gap-4 md:gap-8">
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Total Events"
          value={totalEvents.toLocaleString()}
          icon={<BookCopy />}
          description="All scanned events in the last 7 days"
        />
        <StatCard
          title="Blocks"
          value={totalBlocks.toLocaleString()}
          icon={<ShieldAlert className="text-destructive" />}
          description="High-risk data exfiltration prevented"
        />
        <StatCard
          title="Warnings"
          value={totalWarnings.toLocaleString()}
          icon={<ShieldQuestion className="text-yellow-500" />}
          description="Users alerted to potential leaks"
        />
        <StatCard
          title="Bypasses"
          value={totalBypasses.toLocaleString()}
          icon={<ShieldCheck />}
          description="Warnings reviewed and bypassed by user"
        />
      </div>
      <div className="grid gap-4 md:gap-8 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Events Over Time</CardTitle>
            <CardDescription>
              Breakdown of user actions over the last 7 days.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ChartContainer config={{}} className="h-[300px] w-full">
              <LineChart data={eventsByTime} margin={{ top: 5, right: 20, left: -10, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" />
                <YAxis />
                <Tooltip content={<ChartTooltipContent />} />
                <Legend />
                <Line type="monotone" dataKey="Blocked" stroke="hsl(var(--destructive))" activeDot={{ r: 8 }} />
                <Line type="monotone" dataKey="Warned" stroke="hsl(var(--accent))" activeDot={{ r: 8 }}/>
                <Line type="monotone" dataKey="Allowed" stroke="hsl(var(--primary))" activeDot={{ r: 8 }} />
              </LineChart>
            </ChartContainer>
          </CardContent>
        </Card>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Leaks by Type</CardTitle>
                <CardDescription>Top data leak categories.</CardDescription>
              </CardHeader>
              <CardContent>
                <ChartContainer config={leaksByTypeChartConfig} className="h-[150px] w-full">
                    <PieChart>
                        <Tooltip content={<ChartTooltipContent nameKey="type" />} />
                        <Pie 
                            data={leaksByType} 
                            dataKey="count" 
                            nameKey="type"
                            cx="50%" 
                            cy="50%" 
                            outerRadius={60}
                        >
                          {leaksByType.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={leaksByTypeChartConfig[sanitizeKey(entry.type)]?.color} />
                          ))}
                        </Pie>
                    </PieChart>
                </ChartContainer>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Leaks by Domain</CardTitle>
                <CardDescription>Top target domains for data leaks.</CardDescription>
              </CardHeader>
              <CardContent>
                 <ChartContainer config={{}} className="h-[150px] w-full">
                    <BarChart data={leaksByDomain} layout="vertical" margin={{left: 20, right: 10}}>
                        <XAxis type="number" hide />
                        <YAxis type="category" dataKey="domain" width={80} stroke="hsl(var(--muted-foreground))" fontSize={12} />
                        <Tooltip cursor={{fill: 'hsl(var(--muted))'}} content={<ChartTooltipContent />} />
                        <Bar dataKey="count" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} />
                    </BarChart>
                </ChartContainer>
              </CardContent>
            </Card>
        </div>
      </div>
    </div>
  )
}
