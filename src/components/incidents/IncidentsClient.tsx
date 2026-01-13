"use client"

import { useState } from "react"
import { Incident } from "@/lib/types"
import { DataTable } from "./data-table"
import { getColumns } from "./columns"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { summarizeIncident } from "@/ai/flows/summarize-incident"
import { Skeleton } from "@/components/ui/skeleton"

export function IncidentsClient({ data }: { data: Incident[] }) {
  const [selectedIncident, setSelectedIncident] = useState<Incident | null>(null)
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [aiSummary, setAiSummary] = useState<string>("")
  const [isLoadingSummary, setIsLoadingSummary] = useState(false)

  const handleViewDetails = (incident: Incident) => {
    setSelectedIncident(incident)
    setIsDialogOpen(true)
    setAiSummary("") // Reset summary on new view
  }

  const handleGenerateSummary = async () => {
    if (!selectedIncident) return
    setIsLoadingSummary(true)
    try {
      const incidentDetails = `
        Domain: ${selectedIncident.domain}
        Action: ${selectedIncident.action}
        Risk Score: ${selectedIncident.riskScore}
        Types: ${selectedIncident.types.join(', ')}
        Timestamp: ${new Date(selectedIncident.timestamp).toLocaleString()}
      `;
      const result = await summarizeIncident({ incidentDetails })
      setAiSummary(result.summary)
    } catch (error) {
      console.error("Failed to generate AI summary:", error)
      setAiSummary("Could not generate summary at this time.")
    } finally {
      setIsLoadingSummary(false)
    }
  }

  const columns = getColumns(handleViewDetails)

  return (
    <>
      <Card>
        <CardHeader>
            <CardTitle>All Incidents</CardTitle>
            <p className="text-sm text-muted-foreground">Review and manage all recorded data leak incidents.</p>
        </CardHeader>
        <CardContent>
            <DataTable columns={columns} data={data} />
        </CardContent>
      </Card>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="sm:max-w-[625px]">
          <DialogHeader>
            <DialogTitle>Incident Details: {selectedIncident?.id}</DialogTitle>
            <DialogDescription>
              Detailed information about the incident and an AI-generated summary.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <p className="text-right text-sm font-medium">Domain</p>
              <p className="col-span-3 text-sm">{selectedIncident?.domain}</p>
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <p className="text-right text-sm font-medium">User</p>
              <p className="col-span-3 text-sm">{selectedIncident?.userIdHash ? `User ${selectedIncident.userIdHash.substring(0, 6)}` : 'Unknown'}</p>
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <p className="text-right text-sm font-medium">Details</p>
              <p className="col-span-3 text-sm text-muted-foreground">
                Action: {selectedIncident?.action}, Types: {selectedIncident?.types.join(', ')}, Risk: {selectedIncident?.riskScore}
              </p>
            </div>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-base">AI Summary</CardTitle>
                <Button onClick={handleGenerateSummary} disabled={isLoadingSummary || !!aiSummary} size="sm">
                  {isLoadingSummary ? "Generating..." : "Generate"}
                </Button>
              </CardHeader>
              <CardContent>
                {isLoadingSummary && <div className="space-y-2 pt-2">
                    <Skeleton className="h-4 w-[90%]" />
                    <Skeleton className="h-4 w-[75%]" />
                    <Skeleton className="h-4 w-[85%]" />
                </div>}
                {aiSummary && <p className="text-sm text-muted-foreground pt-2">{aiSummary}</p>}
                {!aiSummary && !isLoadingSummary && <p className="text-sm text-muted-foreground pt-2">Click "Generate" to get an AI-powered summary of the incident.</p>}
              </CardContent>
            </Card>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
