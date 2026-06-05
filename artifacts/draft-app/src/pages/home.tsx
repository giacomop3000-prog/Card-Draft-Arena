import React from "react";
import { useListCards, getListCardsQueryKey, useListDrafts, getListDraftsQueryKey } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Layers, PlaySquare, ArrowRight } from "lucide-react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";

export function Home() {
  const { data: cards, isLoading: loadingCards } = useListCards({ query: { queryKey: getListCardsQueryKey() } });
  const { data: drafts, isLoading: loadingDrafts } = useListDrafts({ query: { queryKey: getListDraftsQueryKey() } });

  const activeDrafts = drafts?.filter(d => d.status === 'active') || [];
  const waitingDrafts = drafts?.filter(d => d.status === 'waiting') || [];

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Overview</h1>
        <p className="text-muted-foreground mt-2">Welcome to the Draft Command Center.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <Card className="bg-card/50 border-border/50">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Total Cards in Library</CardTitle>
            <Layers className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {loadingCards ? (
              <Skeleton className="h-8 w-16" />
            ) : (
              <div className="text-3xl font-bold" data-testid="stat-total-cards">{cards?.length || 0}</div>
            )}
            <p className="text-xs text-muted-foreground mt-1">Available for drafting</p>
          </CardContent>
        </Card>

        <Card className="bg-card/50 border-border/50">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Active Drafts</CardTitle>
            <PlaySquare className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            {loadingDrafts ? (
              <Skeleton className="h-8 w-16" />
            ) : (
              <div className="text-3xl font-bold text-primary" data-testid="stat-active-drafts">{activeDrafts.length}</div>
            )}
            <p className="text-xs text-muted-foreground mt-1">Currently in progress</p>
          </CardContent>
        </Card>
        
        <Card className="bg-card/50 border-border/50">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Waiting Drafts</CardTitle>
            <PlaySquare className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {loadingDrafts ? (
              <Skeleton className="h-8 w-16" />
            ) : (
              <div className="text-3xl font-bold" data-testid="stat-waiting-drafts">{waitingDrafts.length}</div>
            )}
            <p className="text-xs text-muted-foreground mt-1">Ready to join</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card className="bg-secondary/20 border-primary/20">
          <CardHeader>
            <CardTitle>Manage Cards</CardTitle>
            <CardDescription>Upload and organize card images for your drafts.</CardDescription>
          </CardHeader>
          <CardContent>
            <Link href="/cards" className="inline-flex items-center gap-2 text-sm font-medium text-primary hover:text-primary/80 transition-colors" data-testid="link-manage-cards">
              Go to Library <ArrowRight className="h-4 w-4" />
            </Link>
          </CardContent>
        </Card>

        <Card className="bg-secondary/20 border-primary/20">
          <CardHeader>
            <CardTitle>Draft Sessions</CardTitle>
            <CardDescription>Create or join a draft session with your friends.</CardDescription>
          </CardHeader>
          <CardContent>
            <Link href="/drafts" className="inline-flex items-center gap-2 text-sm font-medium text-primary hover:text-primary/80 transition-colors" data-testid="link-draft-sessions">
              View Drafts <ArrowRight className="h-4 w-4" />
            </Link>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
