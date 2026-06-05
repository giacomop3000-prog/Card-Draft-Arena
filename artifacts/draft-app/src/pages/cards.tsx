import React, { useState } from "react";
import { useListCards, getListCardsQueryKey, useCreateCard, useDeleteCard } from "@workspace/api-client-react";
import { ObjectUploader } from "@workspace/object-storage-web";
import { Button } from "@/components/ui/button";
import { Trash2, Image as ImageIcon } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";

export function Cards() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data: cards, isLoading } = useListCards({ query: { queryKey: getListCardsQueryKey() } });
  const createCard = useCreateCard();
  const deleteCard = useDeleteCard();
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

  const filteredCards = cards?.filter(c => c.name.toLowerCase().includes(filter.toLowerCase())) || [];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Card Library</h1>
          <p className="text-muted-foreground mt-1">Upload and manage cards for your draft pools.</p>
        </div>
        
        <div className="w-full sm:w-auto">
          <ObjectUploader
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
              // Store object path temporarily on the file object
              (file.meta as any).objectPath = objectPath;
              return {
                method: "PUT",
                url: uploadURL,
                headers: { "Content-Type": file.type },
              };
            }}
            onComplete={async (result) => {
              if (result.successful && result.successful.length > 0) {
                // For each successful upload, create a card
                for (const file of result.successful) {
                  const objectPath = (file.meta as any).objectPath;
                  const name = file.name.split('.')[0] || "Unnamed Card";
                  await createCard.mutateAsync({ data: { name, imageObjectPath: objectPath } });
                }
                toast({ title: "Cards uploaded successfully" });
                queryClient.invalidateQueries({ queryKey: getListCardsQueryKey() });
              }
            }}
          />
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
