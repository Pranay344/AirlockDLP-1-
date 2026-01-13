"use client"

import { ColumnDef } from "@tanstack/react-table"
import { MoreHorizontal } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Incident } from "@/lib/types"

const getBadgeVariant = (action: 'Blocked' | 'Warned' | 'Allowed'): 'destructive' | 'secondary' | 'default' => {
  switch (action) {
    case 'Blocked':
      return 'destructive';
    case 'Warned':
      return 'secondary';
    case 'Allowed':
    default:
      return 'default';
  }
}

const getRiskColor = (score?: number) => {
  if (score === undefined || score === null) return 'text-slate-400';
  if (score > 80) return 'text-red-500'; // Imperial Red
  if (score > 60) return 'text-amber-500'; // Amber
  return 'text-emerald-500'; // Emerald Green for low risk
}


export const getColumns = (
  onViewDetails: (incident: Incident) => void
): ColumnDef<Incident>[] => [
  {
    accessorKey: "userIdHash",
    header: "User",
    cell: ({ row }) => {
      // In a real app, you would resolve the userIdHash to a user name and avatar
      const userIdHash = row.original.userIdHash;
      return (
        <div className="flex items-center gap-3">
          <Avatar className="h-8 w-8 border-2 border-slate-700">
            <AvatarFallback className="bg-slate-800 text-slate-400 text-xs">
                {userIdHash ? userIdHash.substring(0, 2).toUpperCase() : 'U'}
            </AvatarFallback>
          </Avatar>
          <span className="font-medium text-slate-300">{userIdHash ? `User ${userIdHash.substring(0, 6)}` : 'Unknown User'}</span>
        </div>
      )
    }
  },
  {
    accessorKey: "domain",
    header: "Domain",
  },
  {
    accessorKey: "types",
    header: "Leak Types",
    cell: ({ row }) => {
      const types = row.original.types;
      return (
        <div className="flex flex-wrap gap-1">
          {types.map(type => <Badge key={type} variant="outline">{type}</Badge>)}
        </div>
      )
    }
  },
  {
    accessorKey: "action",
    header: "Action",
    cell: ({ row }) => {
        const action = row.original.action;
        const variant = getBadgeVariant(action);
        if (variant === 'secondary') {
          return <Badge className="bg-amber-500/10 text-amber-400 border-amber-500/20 hover:bg-amber-500/20">{action}</Badge>;
        }
        return <Badge variant={getBadgeVariant(action)}>{action}</Badge>;
    }
  },
  {
    accessorKey: "riskScore",
    header: () => <div className="text-right">Risk</div>,
    cell: ({ row }) => {
      const score = row.original.riskScore;
      return <div className={`text-right font-bold ${getRiskColor(score)}`}>{score || 'N/A'}</div>
    }
  },
  {
    accessorKey: "timestamp",
    header: "Timestamp",
    cell: ({ row }) => {
      return new Date(row.original.timestamp).toLocaleString();
    }
  },
  {
    id: "actions",
    cell: ({ row }) => {
      const incident = row.original

      return (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="h-8 w-8 p-0">
              <span className="sr-only">Open menu</span>
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>Actions</DropdownMenuLabel>
            <DropdownMenuItem onClick={() => onViewDetails(incident)}>
              View Details & AI Summary
            </DropdownMenuItem>
            <DropdownMenuItem>Acknowledge</DropdownMenuItem>
            <DropdownMenuItem>Create Issue</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )
    },
  },
]
