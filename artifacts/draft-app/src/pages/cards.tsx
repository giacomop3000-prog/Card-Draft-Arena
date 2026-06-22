import React, { useState } from "react";
import { useListCards, getListCardsQueryKey, useCreateCard, useDeleteCard, useDeleteAllCards } from "@workspace/api-client-react";
import { ObjectUploader } from "@workspace/object-storage-web";
import { Button } from "@/components/ui/button";
import { Trash2, Image as ImageIcon } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

export function Cards() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data: cards, isLoading } = useListCards({ query: { queryKey: getListCardsQueryKey() } });
  const createCard = useCreateCard();
  const deleteCard = useDeleteCard();
  const deleteAllCards = useDeleteAllCards();
  const [filter, setFilter] = useState("");

  const handleDelete = (id: number) => {
    deleteCard.mutate({ id }, {
      onSuccess: () => {
        toast({ title: "Card deleted" });
        queryClient.invalidateQueries({ queryKey: getListCardsQueryKey() });
      },
      onError: () => {
        toast({ title: "Failed to delete card", variant: "destructive" });
      }
    });
  };

  const handleDeleteAll = () => {
    deleteAllCards.mutate(undefined, {
      onSuccess: () => {
        toast({ title: "All cards deleted" });
        queryClient.invalidateQueries({ queryKey: getListCardsQueryKey() });
      },
      onError: () => {
        toast({ title: "Failed to delete all cards", variant: "destructive" });
      }
    });
  };

  const filteredCards = cards?.filter(c => c.name.toLowerCase().includes(filter.toLowerCase())) || [];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Card Library</h1>
          <p className="text-muted-foreground mt-1">Upload and manage cards for your draft pools.</p>
        </div>
        
        <div className="flex items-center gap-2">
          {cards && cards.length > 0 && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" size="sm" disabled={deleteAllCards.isPending} data-testid="button-delete-all-cards">
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete All
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete all {cards.length} cards?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will permanently remove every card from the library. This action cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={handleDeleteAll} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                    Delete all cards
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
          <ObjectUploader
            maxNumberOfFiles={50}
            maxFileSize={20971520}
            buttonClassName="inline-flex items-center gap-2 rounded-md bg-primary text-primary-foreground px-4 py-2 text-sm font-medium hover:bg-primary/90 transition-colors"
            onGetUploadParameters={async (file) => {
              const res = await fetch("/api/storage/uploads/request-url", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  name: file.name,
                  size: file.size,
                  contentType: file.type,
                }),
              });
              const { uploadURL, objectPath } = await res.json();
              (file.meta as any).objectPath = objectPath;
              return {
                method: "PUT",
                url: uploadURL,
                headers: { "Content-Type": file.type },
              };
            }}
            onComplete={async (result) => {
              if (result.successful && result.successful.length > 0) {
                for (const file of result.successful) {
                  const objectPath = (file.meta as any).objectPath;
                  const name = file.name.replace(/\.[^/.]+$/, "") || "Unnamed Card";
                  await createCard.mutateAsync({ data: { name, imageObjectPath: objectPath } });
                }
                toast({ title: `${result.successful.length} card${result.successful.length > 1 ? "s" : ""} uploaded` });
                queryClient.invalidateQueries({ queryKey: getListCardsQueryKey() });
              }
            }}
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
            Upload Cards
          </ObjectUploader>
        </div>
      </div>

      <div className="w-full max-w-sm">
        <Input 
          placeholder="Filter cards..." 
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          data-testid="input-filter-cards"
        />
      </div>

      {isLoading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
          {Array.from({ length: 12 }).map((_, i) => (
            <Skeleton key={i} className="aspect-[2.5/3.5] rounded-md" />
          ))}
        </div>
      ) : filteredCards.length === 0 ? (
        <div className="text-center py-12 border border-dashed rounded-lg bg-card/20">
          <ImageIcon className="mx-auto h-12 w-12 text-muted-foreground opacity-20" />
          <h3 className="mt-4 text-lg font-medium text-foreground">No cards found</h3>
          <p className="mt-2 text-sm text-muted-foreground">Upload some cards to get started.</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
          {filteredCards.map((card) => (
            <div key={card.id} className="group relative rounded-md overflow-hidden bg-secondary aspect-[2.5/3.5] border border-border transition-all hover:border-primary">
              <img 
                src={`/api/storage${card.imageObjectPath}`} 
                alt={card.name}
                className="absolute inset-0 w-full h-full object-cover"
                loading="lazy"
                data-testid={`img-card-${card.id}`}
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-end p-3">
                <p className="text-white font-medium text-sm truncate" title={card.name}>{card.name}</p>
                <div className="mt-2">
                  <Button 
                    variant="destructive" 
                    size="sm" 
                    className="w-full h-8"
                    onClick={() => handleDelete(card.id)}
                    data-testid={`button-delete-card-${card.id}`}
                  >
                    <Trash2 className="h-4 w-4 mr-2" />
                    Delete
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
