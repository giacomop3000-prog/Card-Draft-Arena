import React, { useCallback, useEffect, useState } from "react";
import { useParams } from "wouter";
import { 
  useGetDraft, getGetDraftQueryKey, 
  useJoinDraft, 
  useStartDraft,
  useGetSeatState, getGetSeatStateQueryKey,
  useMakePick,
  useGetPool, getGetPoolQueryKey,
  useGetDraftSummary, getGetDraftSummaryQueryKey
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Users, User, Play, Clock, Layers, CheckCircle2, ChevronRight, ChevronLeft, X, ZoomIn } from "lucide-react";

export function DraftRoom() {
  const { id } = useParams<{ id: string }>();
  const draftId = parseInt(id || "0", 10);
  const queryClient = useQueryClient();
  const { toast } = useToast();
  
  const [seatId, setSeatId] = useState<number | null>(() => {
    const saved = localStorage.getItem(`seat_${draftId}`);
    return saved ? parseInt(saved, 10) : null;
  });

  const { data: draft, isLoading: loadingDraft } = useGetDraft(draftId, { 
    query: { 
      enabled: !!draftId, 
      queryKey: getGetDraftQueryKey(draftId),
      // Always poll while the draft is live — catches waiting→active and active→completed transitions
      refetchInterval: (query) => {
        if (!query.state.data) return 3000;
        return query.state.data.status !== 'completed' ? 3000 : false;
      }
    } 
  });

  const draftIsActive = draft?.status === 'active';
  const draftIsCompleted = draft?.status === 'completed';

  const { data: seatState } = useGetSeatState(draftId, seatId || 0, {
    query: {
      enabled: !!draftId && !!seatId && draftIsActive,
      queryKey: getGetSeatStateQueryKey(draftId, seatId || 0),
      // Poll continuously while the draft is active — not just when waiting
      refetchInterval: draftIsActive ? 2000 : false,
    }
  });

  const { data: pool } = useGetPool(draftId, seatId || 0, {
    query: {
      enabled: !!draftId && !!seatId && draftIsCompleted,
      queryKey: getGetPoolQueryKey(draftId, seatId || 0)
    }
  });

  const { data: summary } = useGetDraftSummary(draftId, {
    query: {
      enabled: !!draftId && draftIsCompleted,
      queryKey: getGetDraftSummaryQueryKey(draftId)
    }
  });

  const joinDraft = useJoinDraft();
  const startDraft = useStartDraft();
  const makePick = useMakePick();
  
  const [playerName, setPlayerName] = useState("");
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  const lightboxPack = seatState?.currentPack ?? [];
  const lightboxCard = lightboxIndex !== null ? lightboxPack[lightboxIndex] : null;

  const closeLightbox = useCallback(() => setLightboxIndex(null), []);
  const prevCard = useCallback(() =>
    setLightboxIndex(i => (i !== null && lightboxPack.length > 0 ? (i - 1 + lightboxPack.length) % lightboxPack.length : i)),
    [lightboxPack.length]);
  const nextCard = useCallback(() =>
    setLightboxIndex(i => (i !== null && lightboxPack.length > 0 ? (i + 1) % lightboxPack.length : i)),
    [lightboxPack.length]);

  useEffect(() => {
    if (lightboxIndex === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft")  { e.preventDefault(); prevCard(); }
      if (e.key === "ArrowRight") { e.preventDefault(); nextCard(); }
      if (e.key === "Escape")     { e.preventDefault(); closeLightbox(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [lightboxIndex, prevCard, nextCard, closeLightbox]);

  // Close lightbox automatically when the pack changes (user picked or new pack arrived)
  useEffect(() => {
    setLightboxIndex(null);
  }, [seatState?.currentPackId]);

  const handleJoin = (e: React.FormEvent) => {
    e.preventDefault();
    if (!playerName.trim()) return;
    
    joinDraft.mutate({ id: draftId, data: { playerName } }, {
      onSuccess: (seat) => {
        setSeatId(seat.id);
        localStorage.setItem(`seat_${draftId}`, seat.id.toString());
        toast({ title: "Joined draft" });
        queryClient.invalidateQueries({ queryKey: getGetDraftQueryKey(draftId) });
      },
      onError: (err) => {
        toast({ title: "Failed to join", description: err.error, variant: "destructive" });
      }
    });
  };

  const handleStart = () => {
    startDraft.mutate({ id: draftId }, {
      onSuccess: () => {
        toast({ title: "Draft started!" });
        queryClient.invalidateQueries({ queryKey: getGetDraftQueryKey(draftId) });
        if (seatId) {
          queryClient.invalidateQueries({ queryKey: getGetSeatStateQueryKey(draftId, seatId) });
        }
      },
      onError: (err) => {
        toast({ title: "Failed to start", description: err.error, variant: "destructive" });
      }
    });
  };

  const handlePick = (cardId: number, packId: number) => {
    if (!seatId) return;
    makePick.mutate({ id: draftId, data: { seatId, cardId, packId } }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetSeatStateQueryKey(draftId, seatId) });
        // Immediately refresh draft so completed status shows without waiting for the poll
        queryClient.invalidateQueries({ queryKey: getGetDraftQueryKey(draftId) });
      },
      onError: (err) => {
        toast({ title: "Failed to pick", description: err.error, variant: "destructive" });
      }
    });
  };

  if (loadingDraft && !draft) return <div>Loading draft room...</div>;
  if (!draft) return <div>Draft not found</div>;

  const currentSeat = draft.seats.find(s => s.id === seatId);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-border pb-6">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <h1 className="text-3xl font-bold tracking-tight">{draft.name}</h1>
            <Badge variant="outline" className="uppercase font-medium tracking-wider text-xs bg-secondary/50">
              {draft.status}
            </Badge>
          </div>
          <div className="flex items-center gap-6 text-sm text-muted-foreground">
            <div className="flex items-center gap-1"><Users className="h-4 w-4" /> {draft.seats.length} players</div>
            <div className="flex items-center gap-1"><Layers className="h-4 w-4" /> {draft.numPacks} packs of {draft.cardsPerPack}</div>
          </div>
        </div>
        
        {currentSeat && (
          <div className="flex items-center gap-2 bg-secondary/30 px-4 py-2 rounded-lg border border-border/50">
            <User className="h-4 w-4 text-primary" />
            <span className="font-medium text-sm">Playing as <strong className="text-foreground">{currentSeat.playerName}</strong> (Seat {currentSeat.seatPosition})</span>
          </div>
        )}
      </div>

      {/* Lobby Phase */}
      {draft.status === 'waiting' && (
        <div className="grid md:grid-cols-2 gap-8 animate-in fade-in slide-in-from-bottom-4">
          <Card className="bg-card/50">
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Users className="h-5 w-5 text-primary" /> Players ({draft.seats.length})</CardTitle>
            </CardHeader>
            <CardContent>
              {draft.seats.length === 0 ? (
                <div className="text-muted-foreground text-sm py-4 italic">No one has joined yet.</div>
              ) : (
                <ul className="space-y-2">
                  {draft.seats.map(s => (
                    <li key={s.id} className="flex items-center justify-between p-2 rounded-md bg-secondary/20 border border-border/30">
                      <span className="font-medium flex items-center gap-2">
                        <User className="h-4 w-4 text-muted-foreground" />
                        {s.playerName} {s.id === seatId && <Badge variant="secondary" className="ml-2 text-[10px]">You</Badge>}
                      </span>
                      <span className="text-xs text-muted-foreground">Seat {s.seatPosition}</span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <div className="space-y-6">
            {!seatId ? (
              <Card className="border-primary/30 shadow-sm shadow-primary/10">
                <CardHeader>
                  <CardTitle>Join Draft</CardTitle>
                  <CardDescription>Enter your name to take a seat at the table.</CardDescription>
                </CardHeader>
                <CardContent>
                  <form onSubmit={handleJoin} className="flex gap-3">
                    <Input 
                      placeholder="Your Name" 
                      value={playerName} 
                      onChange={e => setPlayerName(e.target.value)} 
                      data-testid="input-join-name"
                      className="flex-1"
                    />
                    <Button type="submit" disabled={joinDraft.isPending || !playerName.trim()} data-testid="button-join-draft">
                      Join Seat
                    </Button>
                  </form>
                </CardContent>
              </Card>
            ) : (
              <Card className="bg-primary/5 border-primary/20">
                <CardContent className="pt-6 flex flex-col items-center text-center space-y-4">
                  <div className="h-12 w-12 rounded-full bg-primary/20 flex items-center justify-center">
                    <Clock className="h-6 w-6 text-primary animate-pulse" />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold mb-1">Ready to Draft</h3>
                    <p className="text-sm text-muted-foreground">Waiting for the host to start...</p>
                  </div>
                  <Button 
                    size="lg" 
                    className="w-full mt-4" 
                    onClick={handleStart}
                    disabled={startDraft.isPending || draft.seats.length < 2}
                    data-testid="button-start-draft"
                  >
                    <Play className="h-4 w-4 mr-2" />
                    Start Draft Now
                  </Button>
                  {draft.seats.length < 2 && (
                    <p className="text-xs text-destructive">Need at least 2 players to start.</p>
                  )}
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      )}

      {/* Pick Phase */}
      {draft.status === 'active' && seatState && (
        <div className="space-y-6 animate-in fade-in">
          <div className="flex flex-wrap items-center justify-between gap-4 bg-secondary/20 p-4 rounded-lg border border-border/50">
            <div className="flex items-center gap-6">
              <div>
                <span className="text-xs text-muted-foreground uppercase tracking-wider font-bold block mb-1">Pack</span>
                <div className="text-xl font-bold flex items-center gap-2">
                  <Layers className="h-5 w-5 text-primary" />
                  {seatState.packNumber} <span className="text-muted-foreground text-sm font-normal">/ {draft.numPacks}</span>
                </div>
              </div>
              <div className="h-10 w-px bg-border"></div>
              <div>
                <span className="text-xs text-muted-foreground uppercase tracking-wider font-bold block mb-1">Picks</span>
                <div className="text-xl font-bold">
                  {seatState.picksDone} <span className="text-muted-foreground text-sm font-normal">/ {seatState.totalPicks}</span>
                </div>
              </div>
            </div>
            
            <div className="flex-1 w-full md:w-auto max-w-md">
              <div className="flex justify-between text-xs mb-1">
                <span>Overall Progress</span>
                <span>{Math.round((seatState.picksDone / seatState.totalPicks) * 100)}%</span>
              </div>
              <div className="h-2 w-full bg-secondary rounded-full overflow-hidden">
                <div 
                  className="h-full bg-primary transition-all duration-500 ease-out" 
                  style={{ width: `${(seatState.picksDone / seatState.totalPicks) * 100}%` }}
                />
              </div>
            </div>
          </div>

          {seatState.waitingForOthers ? (
            <div className="flex flex-col items-center justify-center py-24 text-center border rounded-lg bg-card/20">
              <div className="relative mb-6">
                <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center">
                  <Users className="h-8 w-8 text-primary" />
                </div>
                <div className="absolute -bottom-1 -right-1 h-5 w-5 rounded-full bg-primary animate-ping opacity-50" />
                <div className="absolute -bottom-1 -right-1 h-5 w-5 rounded-full bg-primary" />
              </div>
              <h3 className="text-xl font-semibold mb-2">Pick submitted!</h3>
              <p className="text-muted-foreground">Waiting for all players to pick before packs rotate...</p>
            </div>
          ) : seatState.waitingForPack ? (
            <div className="flex flex-col items-center justify-center py-24 text-center border rounded-lg bg-card/20 animate-pulse">
              <Clock className="h-12 w-12 text-muted-foreground mb-4 opacity-50" />
              <h3 className="text-xl font-semibold mb-2">Waiting for next pack...</h3>
              <p className="text-muted-foreground">Other players are still making their picks.</p>
            </div>
          ) : (
            <div>
              <div className="flex items-center gap-2 mb-4">
                <h3 className="text-lg font-semibold">Current Pack</h3>
                <Badge variant="secondary">{seatState.currentPack.length} cards</Badge>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
                {seatState.currentPack.map((card, idx) => (
                  <button
                    key={card.id}
                    onClick={() => setLightboxIndex(idx)}
                    disabled={makePick.isPending || !seatState.currentPackId}
                    className="group relative rounded-md overflow-hidden bg-secondary aspect-[2.5/3.5] border-2 border-transparent transition-all hover:border-primary hover:scale-[1.02] focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/50 text-left"
                    data-testid={`button-view-${card.id}`}
                  >
                    <img 
                      src={`/api/storage${card.imageObjectPath}`} 
                      alt={card.name}
                      className="absolute inset-0 w-full h-full object-cover"
                      loading="lazy"
                    />
                    <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                      <div className="bg-white/10 backdrop-blur-sm border border-white/20 text-white px-3 py-1.5 rounded-full text-sm font-medium flex items-center gap-1.5 transform translate-y-3 group-hover:translate-y-0 transition-transform">
                        <ZoomIn className="h-3.5 w-3.5" /> View
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Completed Phase */}
      {draft.status === 'completed' && pool && summary && (
        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4">
          <Card className="bg-primary/5 border-primary/20">
            <CardContent className="py-6">
              <div className="flex items-center justify-center gap-3 mb-2 text-primary">
                <CheckCircle2 className="h-8 w-8" />
                <h2 className="text-2xl font-bold">Draft Complete!</h2>
              </div>
              <p className="text-center text-muted-foreground">All packs have been drafted.</p>
            </CardContent>
          </Card>

          <div className="grid md:grid-cols-[1fr_300px] gap-8">
            <div>
              <h3 className="text-xl font-bold mb-4 flex items-center gap-2">
                <Layers className="h-5 w-5" /> Your Pool ({pool.cards.length} cards)
              </h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                {pool.cards.map((card, i) => (
                  <div key={`${card.id}-${i}`} className="rounded-md overflow-hidden bg-secondary aspect-[2.5/3.5] border border-border">
                    <img 
                      src={`/api/storage${card.imageObjectPath}`} 
                      alt={card.name}
                      className="w-full h-full object-cover"
                      loading="lazy"
                    />
                  </div>
                ))}
              </div>
            </div>

            <div>
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Final Standings</CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-3">
                    {summary.seatSummaries.map((s, i) => (
                      <li key={s.seat.id} className="flex flex-col gap-1 pb-3 border-b border-border/50 last:border-0 last:pb-0">
                        <div className="flex justify-between items-center">
                          <span className="font-medium flex items-center gap-2">
                            {i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `${i+1}.`}
                            {s.seat.playerName}
                            {s.seat.id === seatId && <Badge variant="outline" className="ml-1 text-[10px]">You</Badge>}
                          </span>
                          <span className="text-sm font-bold text-primary">{s.picksDone} picks</span>
                        </div>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      )}

      {/* Card Lightbox */}
      {lightboxCard && lightboxIndex !== null && seatState && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/90"
          onClick={closeLightbox}
        >
          {/* Close */}
          <button
            className="absolute top-4 right-4 text-white/70 hover:text-white bg-white/10 hover:bg-white/20 rounded-full p-2 transition-colors"
            onClick={closeLightbox}
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>

          {/* Counter */}
          <div className="absolute top-4 left-1/2 -translate-x-1/2 text-white/60 text-sm font-medium tabular-nums">
            {lightboxIndex + 1} / {lightboxPack.length}
          </div>

          {/* Prev arrow */}
          <button
            className="absolute left-4 top-1/2 -translate-y-1/2 text-white/70 hover:text-white bg-white/10 hover:bg-white/20 rounded-full p-3 transition-colors disabled:opacity-30"
            onClick={(e) => { e.stopPropagation(); prevCard(); }}
            disabled={lightboxPack.length <= 1}
            aria-label="Previous card"
          >
            <ChevronLeft className="h-6 w-6" />
          </button>

          {/* Card image */}
          <div
            className="flex flex-col items-center gap-6 px-20"
            onClick={(e) => e.stopPropagation()}
          >
            <img
              src={`/api/storage${lightboxCard.imageObjectPath}`}
              alt={lightboxCard.name}
              className="max-h-[75vh] max-w-[min(420px,80vw)] w-auto object-contain rounded-xl shadow-2xl"
            />
            <div className="flex flex-col items-center gap-3">
              <p className="text-white font-semibold text-lg">{lightboxCard.name}</p>
              <Button
                size="lg"
                className="px-10"
                disabled={makePick.isPending || !seatState.currentPackId}
                onClick={() => {
                  handlePick(lightboxCard.id, seatState.currentPackId!);
                  closeLightbox();
                }}
                data-testid={`button-pick-${lightboxCard.id}`}
              >
                Pick this card <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            </div>
          </div>

          {/* Next arrow */}
          <button
            className="absolute right-4 top-1/2 -translate-y-1/2 text-white/70 hover:text-white bg-white/10 hover:bg-white/20 rounded-full p-3 transition-colors disabled:opacity-30"
            onClick={(e) => { e.stopPropagation(); nextCard(); }}
            disabled={lightboxPack.length <= 1}
            aria-label="Next card"
          >
            <ChevronRight className="h-6 w-6" />
          </button>
        </div>
      )}
    </div>
  );
}
