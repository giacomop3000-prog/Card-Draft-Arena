import React, { useState } from "react";
import { useListDrafts, getListDraftsQueryKey, useCreateDraft, useDeleteDraft } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Plus, Users, Layers, PlaySquare, Clock, CheckCircle2, Trash2 } from "lucide-react";
import { Link, useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Skeleton } from "@/components/ui/skeleton";

const createDraftSchema = z.object({
  name: z.string().min(1, "Name is required"),
  numPacks: z.coerce.number().min(1).max(10),
  cardsPerPack: z.coerce.number().min(1).max(30),
});

export function Drafts() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const { data: drafts, isLoading } = useListDrafts({ query: { queryKey: getListDraftsQueryKey() } });
  const createDraft = useCreateDraft();
  const deleteDraft = useDeleteDraft();
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [deleteTargetId, setDeleteTargetId] = useState<number | null>(null);

  const form = useForm<z.infer<typeof createDraftSchema>>({
    resolver: zodResolver(createDraftSchema),
    defaultValues: {
      name: "",
      numPacks: 3,
      cardsPerPack: 15,
    },
  });

  const onSubmit = (values: z.infer<typeof createDraftSchema>) => {
    createDraft.mutate({ data: values }, {
      onSuccess: (newDraft) => {
        toast({ title: "Draft created successfully" });
        setIsCreateOpen(false);
        queryClient.invalidateQueries({ queryKey: getListDraftsQueryKey() });
        setLocation(`/drafts/${newDraft.id}`);
      },
      onError: (err) => {
        toast({ title: "Failed to create draft", description: String(err), variant: "destructive" });
      }
    });
  };

  const confirmDelete = () => {
    if (deleteTargetId === null) return;
    deleteDraft.mutate({ id: deleteTargetId }, {
      onSuccess: () => {
        toast({ title: "Draft deleted" });
        queryClient.invalidateQueries({ queryKey: getListDraftsQueryKey() });
        setDeleteTargetId(null);
      },
      onError: () => {
        toast({ title: "Failed to delete draft", variant: "destructive" });
        setDeleteTargetId(null);
      },
    });
  };

  const statusConfig = {
    waiting: { icon: Clock, color: "text-yellow-500", bg: "bg-yellow-500/10", border: "border-yellow-500/20" },
    active: { icon: PlaySquare, color: "text-green-500", bg: "bg-green-500/10", border: "border-green-500/20" },
    completed: { icon: CheckCircle2, color: "text-blue-500", bg: "bg-blue-500/10", border: "border-blue-500/20" },
  };

  const deleteTargetName = drafts?.find(d => d.id === deleteTargetId)?.name;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Draft Sessions</h1>
          <p className="text-muted-foreground mt-1">Join an active draft or start a new one.</p>
        </div>
        
        <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
          <DialogTrigger asChild>
            <Button data-testid="button-create-draft-modal">
              <Plus className="h-4 w-4 mr-2" />
              New Draft
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[425px]">
            <DialogHeader>
              <DialogTitle>Create New Draft</DialogTitle>
            </DialogHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 pt-4">
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Draft Name</FormLabel>
                      <FormControl>
                        <Input placeholder="Friday Night Magic" {...field} data-testid="input-draft-name" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="numPacks"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Packs per Player</FormLabel>
                        <FormControl>
                          <Input type="number" min={1} max={10} {...field} data-testid="input-draft-packs" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="cardsPerPack"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Cards per Pack</FormLabel>
                        <FormControl>
                          <Input type="number" min={1} max={30} {...field} data-testid="input-draft-cards-per-pack" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                <DialogFooter className="pt-4">
                  <Button type="button" variant="outline" onClick={() => setIsCreateOpen(false)}>Cancel</Button>
                  <Button type="submit" disabled={createDraft.isPending} data-testid="button-submit-draft">
                    {createDraft.isPending ? "Creating..." : "Create Draft"}
                  </Button>
                </DialogFooter>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>

      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map(i => (
            <Card key={i} className="bg-card/50">
              <CardHeader className="pb-2">
                <Skeleton className="h-6 w-3/4 mb-2" />
                <Skeleton className="h-4 w-1/4" />
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-2/3" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : drafts?.length === 0 ? (
        <div className="text-center py-12 border border-dashed rounded-lg bg-card/20">
          <PlaySquare className="mx-auto h-12 w-12 text-muted-foreground opacity-20" />
          <h3 className="mt-4 text-lg font-medium text-foreground">No drafts found</h3>
          <p className="mt-2 text-sm text-muted-foreground">Create a new draft to get started.</p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {drafts?.map(draft => {
            const StatusIcon = statusConfig[draft.status].icon;
            return (
              <Card key={draft.id} className={`bg-card/80 border transition-all hover:border-primary/50 flex flex-col`}>
                <CardHeader className="pb-2">
                  <div className="flex justify-between items-start gap-2">
                    <CardTitle className="text-lg line-clamp-1 flex-1" title={draft.name}>{draft.name}</CardTitle>
                    <div className="flex items-center gap-2 shrink-0">
                      <Badge variant="outline" className={`${statusConfig[draft.status].bg} ${statusConfig[draft.status].color} ${statusConfig[draft.status].border} font-medium capitalize`}>
                        <StatusIcon className="h-3 w-3 mr-1" />
                        {draft.status}
                      </Badge>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                        onClick={(e) => { e.preventDefault(); setDeleteTargetId(draft.id); }}
                        data-testid={`button-delete-draft-${draft.id}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                  <CardDescription className="text-xs">
                    Created {new Date(draft.createdAt).toLocaleDateString()}
                  </CardDescription>
                </CardHeader>
                <CardContent className="flex-1">
                  <div className="flex items-center gap-4 text-sm text-muted-foreground mt-2">
                    <div className="flex items-center gap-1">
                      <Layers className="h-4 w-4" />
                      <span>{draft.numPacks} packs</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Layers className="h-4 w-4" />
                      <span>{draft.cardsPerPack} cards/pack</span>
                    </div>
                  </div>
                </CardContent>
                <CardFooter className="pt-4 border-t border-border/50">
                  <Link href={`/drafts/${draft.id}`} className="w-full">
                    <Button variant={draft.status === 'active' ? 'default' : 'secondary'} className="w-full" data-testid={`button-enter-draft-${draft.id}`}>
                      {draft.status === 'waiting' ? 'Enter Lobby' : draft.status === 'active' ? 'Resume Draft' : 'View Results'}
                    </Button>
                  </Link>
                </CardFooter>
              </Card>
            );
          })}
        </div>
      )}

      <AlertDialog open={deleteTargetId !== null} onOpenChange={(open) => { if (!open) setDeleteTargetId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete draft?</AlertDialogTitle>
            <AlertDialogDescription>
              <strong>{deleteTargetName}</strong> and all its picks and packs will be permanently deleted. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              disabled={deleteDraft.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteDraft.isPending ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
